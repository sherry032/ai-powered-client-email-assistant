import logging
from collections import defaultdict, deque
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy.orm import Session

from app.auth.models import AuthUser
from app.auth.service import record_usage, require_auth, require_valid_subscription
from app.core.config import settings
from app.core.database import get_db


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

router = APIRouter()
logger = logging.getLogger("client-message-assistant.drafts")
request_windows: dict[str, deque[float]] = defaultdict(deque)


class DraftRequest(BaseModel):
    context: str = Field(default="", max_length=12000)
    intent: str = Field(default="Reply with next steps", max_length=120)
    tone: str = Field(default="warm", max_length=40)
    points: str = Field(default="", max_length=4000)
    relationship: str = Field(default="", max_length=240)
    business_profile: str = Field(default="", max_length=2000)
    signature: str = Field(default="", max_length=1000)
    model: str | None = Field(default=None, max_length=80)
    source_url: HttpUrl | None = None


class DraftResponse(BaseModel):
    reply: str
    model: str
    usage: dict[str, Any] = Field(default_factory=dict)


def enforce_rate_limit(subject: str) -> None:
    now = time.time()
    window = request_windows[subject]
    while window and window[0] <= now - 3600:
        window.popleft()

    if len(window) >= settings.rate_limit_per_hour:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later.",
        )

    window.append(now)


@router.post("/v1/draft-client-reply", response_model=DraftResponse)
async def draft_client_reply(
    payload: DraftRequest,
    request: Request,
    user: AuthUser = Depends(require_auth),
    session: Session = Depends(get_db),
) -> DraftResponse:
    request_id = request.headers.get("x-request-id", "-")
    logger.info(
        "draft request received request_id=%s user_id=%s origin=%s context_chars=%s intent=%s",
        request_id,
        user.id,
        request.headers.get("origin", "-"),
        len(payload.context or ""),
        payload.intent,
    )
    require_valid_subscription(user)
    enforce_rate_limit(user.id)

    if not settings.openai_api_key:
        logger.error("missing OPENAI_API_KEY request_id=%s", request_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OPENAI_API_KEY is not configured on the server.",
        )

    clean_payload = payload.model_copy(update={
        "context": payload.context[-settings.max_context_chars:],
    })

    data = await call_openai(clean_payload, request_id=request_id)
    reply = extract_output_text(data)
    if not reply:
        logger.error("empty OpenAI response request_id=%s", request_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenAI returned no draft text.",
        )

    logger.info(
        "draft response ready request_id=%s reply_chars=%s model=%s",
        request_id,
        len(reply),
        data.get("model") or clean_payload.model or settings.openai_model,
    )
    record_usage(session, user.id, "draft_generated", f"request_id={request_id}")
    return DraftResponse(
        reply=reply.strip(),
        model=data.get("model") or clean_payload.model or settings.openai_model,
        usage=data.get("usage") or {},
    )


async def call_openai(payload: DraftRequest, request_id: str = "-") -> dict[str, Any]:
    model = payload.model or settings.openai_model
    body = {
        "model": model,
        "instructions": system_instructions(payload),
        "input": user_prompt(payload),
        "max_output_tokens": 650,
    }

    logger.info(
        "calling OpenAI request_id=%s model=%s input_chars=%s",
        request_id,
        model,
        len(body["input"]),
    )
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        response = await client.post(
            OPENAI_RESPONSES_URL,
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )

    if response.status_code >= 400:
        detail = parse_openai_error(response)
        logger.error(
            "OpenAI error request_id=%s status=%s detail=%s",
            request_id,
            response.status_code,
            detail,
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)

    logger.info("OpenAI response received request_id=%s status=%s", request_id, response.status_code)
    return response.json()


def system_instructions(payload: DraftRequest) -> str:
    parts = [
        "You help independent professionals write client emails and web messages.",
        "Write in a clear, confident, human voice. Avoid corporate filler.",
        "Preserve the user's facts. Do not invent commitments, dates, prices, or policies.",
        "If context is incomplete, write a useful draft that asks for the missing detail.",
        "Return only the message draft. No labels, analysis, or commentary.",
    ]
    if payload.business_profile:
        parts.append(f"Business context: {payload.business_profile}")
    if payload.signature:
        parts.append(f"Use this signature only when appropriate: {payload.signature}")
    return "\n".join(parts)


def user_prompt(payload: DraftRequest) -> str:
    return "\n\n".join([
        f"Task: {payload.intent or 'Draft a client response'}",
        f"Tone: {payload.tone or 'warm'}",
        optional_section("Client relationship", payload.relationship),
        optional_section("Conversation context", payload.context),
        optional_section("Must include", payload.points),
        optional_section("Source URL", str(payload.source_url) if payload.source_url else ""),
    ]).strip()


def optional_section(title: str, value: str) -> str:
    return f"{title}:\n{value.strip()}" if value and value.strip() else ""


def extract_output_text(data: dict[str, Any]) -> str:
    if isinstance(data.get("output_text"), str):
        return data["output_text"]

    chunks: list[str] = []
    for item in data.get("output", []):
        for part in item.get("content", []):
            if part.get("type") == "output_text" and part.get("text"):
                chunks.append(part["text"])
    return "\n".join(chunks)


def parse_openai_error(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return f"OpenAI request failed with status {response.status_code}."
    return body.get("error", {}).get("message") or f"OpenAI request failed with status {response.status_code}."
