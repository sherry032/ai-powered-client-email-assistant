import os
import time
import logging
import secrets
import sqlite3
import hashlib
import hmac
import base64
from collections import defaultdict, deque
from dataclasses import dataclass
from html import escape as html_escape
from typing import Any

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, HttpUrl
from dotenv import load_dotenv


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
load_dotenv()


def parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def origins_to_regex(origins: list[str]) -> str:
    escaped = []
    for origin in origins:
        escaped.append(
            origin
            .replace(".", r"\.")
            .replace("*", ".*")
        )
    return f"^({'|'.join(escaped)})$" if escaped else r"^$"


class Settings:
    def __init__(self) -> None:
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
        self.api_token = os.getenv("APP_API_TOKEN", "")
        self.allowed_origins = parse_csv(os.getenv("ALLOWED_ORIGINS", "chrome-extension://*,http://localhost:*"))
        self.rate_limit_per_hour = int(os.getenv("RATE_LIMIT_PER_HOUR", "120"))
        self.max_context_chars = int(os.getenv("MAX_CONTEXT_CHARS", "6000"))
        self.request_timeout_seconds = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "45"))
        self.database_path = os.getenv("DATABASE_PATH", "client_message_assistant.sqlite3")
        self.signup_trial_days = int(os.getenv("SIGNUP_TRIAL_DAYS", "14"))


settings = Settings()
app = FastAPI(
    title="Client Message Assistant API",
    version="0.1.0",
    description="Backend API for drafting client email replies from a Chrome extension."
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=origins_to_regex(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Client-Version", "X-Request-ID"],
)

request_windows: dict[str, deque[float]] = defaultdict(deque)
pairing_codes: dict[str, dict[str, Any]] = {}
logger = logging.getLogger("client-message-assistant")
logger.setLevel(logging.INFO)


@dataclass
class AuthUser:
    id: str
    email: str
    subscription_status: str
    subscription_current_period_end: int


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


class PairingCodeRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class PairingCodeResponse(BaseModel):
    code: str
    expires_in_seconds: int


class ExchangeCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)


class ExchangeCodeResponse(BaseModel):
    token: str
    user: dict[str, str]


class AuthRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=200)
    mode: str = Field(pattern="^(login|signup)$")


class SubscriptionResponse(BaseModel):
    status: str
    current_period_end: int
    is_valid: bool


class DevSubscriptionUpdate(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    status: str = Field(pattern="^(active|trialing|past_due|canceled|inactive)$")
    days: int = Field(default=30, ge=-365, le=3650)


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            create table if not exists users (
                id text primary key,
                email text not null unique,
                password_hash text not null,
                subscription_status text not null,
                subscription_current_period_end integer not null,
                created_at integer not null
            );

            create table if not exists extension_tokens (
                token_hash text primary key,
                user_id text not null,
                created_at integer not null,
                revoked_at integer,
                foreign key (user_id) references users(id)
            );

            create table if not exists usage_events (
                id integer primary key autoincrement,
                user_id text not null,
                event_type text not null,
                created_at integer not null,
                metadata text,
                foreign key (user_id) references users(id)
            );
            """
        )


init_db()


async def require_auth(authorization: str | None = Header(default=None)) -> AuthUser:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API token. Sign in from the extension settings page."
        )

    if settings.api_token and secrets.compare_digest(token, settings.api_token):
        return AuthUser(
            id="dev-token",
            email="dev@example.local",
            subscription_status="active",
            subscription_current_period_end=int(time.time()) + 31_536_000,
        )

    user = get_user_by_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired API token. Sign in again from extension settings."
        )

    return user


def require_valid_subscription(user: AuthUser) -> None:
    if is_subscription_valid(user):
        return

    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail="Your subscription is not active. Please update your plan to generate drafts."
    )


def is_subscription_valid(user: AuthUser) -> bool:
    return (
        user.subscription_status in {"active", "trialing"}
        and user.subscription_current_period_end > int(time.time())
    )


def enforce_rate_limit(subject: str) -> None:
    now = time.time()
    window = request_windows[subject]
    while window and window[0] <= now - 3600:
        window.popleft()

    if len(window) >= settings.rate_limit_per_hour:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later."
        )

    window.append(now)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str, salt: bytes | None = None) -> str:
    password_salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), password_salt, 210_000)
    return "pbkdf2_sha256$210000${}${}".format(
        base64.urlsafe_b64encode(password_salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = encoded.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False

    salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
    expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
    return hmac.compare_digest(actual, expected)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_user(email: str, password: str) -> sqlite3.Row:
    now = int(time.time())
    user_id = f"user_{secrets.token_urlsafe(16)}"
    trial_end = now + settings.signup_trial_days * 24 * 60 * 60

    try:
        with db() as conn:
            conn.execute(
                """
                insert into users (
                    id, email, password_hash, subscription_status,
                    subscription_current_period_end, created_at
                ) values (?, ?, ?, ?, ?, ?)
                """,
                (user_id, normalize_email(email), hash_password(password), "trialing", trial_end, now),
            )
            row = conn.execute("select * from users where id = ?", (user_id,)).fetchone()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email. Log in instead."
        ) from exc

    return row


def authenticate_user(email: str, password: str) -> sqlite3.Row:
    with db() as conn:
        row = conn.execute(
            "select * from users where email = ?",
            (normalize_email(email),),
        ).fetchone()

    if not row or not verify_password(password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    return row


def row_to_auth_user(row: sqlite3.Row) -> AuthUser:
    return AuthUser(
        id=row["id"],
        email=row["email"],
        subscription_status=row["subscription_status"],
        subscription_current_period_end=row["subscription_current_period_end"],
    )


def issue_token_for_user(row: sqlite3.Row) -> str:
    token = f"cma_{secrets.token_urlsafe(32)}"
    with db() as conn:
        conn.execute(
            """
            insert into extension_tokens (token_hash, user_id, created_at, revoked_at)
            values (?, ?, ?, null)
            """,
            (token_hash(token), row["id"], int(time.time())),
        )
    return token


def get_user_by_token(token: str) -> AuthUser | None:
    with db() as conn:
        row = conn.execute(
            """
            select users.*
            from extension_tokens
            join users on users.id = extension_tokens.user_id
            where extension_tokens.token_hash = ?
              and extension_tokens.revoked_at is null
            """,
            (token_hash(token),),
        ).fetchone()

    return row_to_auth_user(row) if row else None


def record_usage(user_id: str, event_type: str, metadata: str = "") -> None:
    with db() as conn:
        conn.execute(
            """
            insert into usage_events (user_id, event_type, created_at, metadata)
            values (?, ?, ?, ?)
            """,
            (user_id, event_type, int(time.time()), metadata),
        )


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true"}


@app.get("/extension/connect", response_class=HTMLResponse)
def extension_connect() -> str:
    return """
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Connect Client Message Assistant</title>
    <style>
      body {
        margin: 0;
        color: #17212b;
        background: #f6f8fa;
        font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(560px, calc(100vw - 32px));
        margin: 64px auto;
        padding: 28px;
        border: 1px solid #d8dee4;
        border-radius: 8px;
        background: #fff;
      }
      h1 { margin: 0 0 8px; color: #17324d; font-size: 28px; }
      p { color: #5c6875; }
      label { display: grid; gap: 8px; margin-top: 20px; font-weight: 750; }
      input {
        border: 1px solid #d8dee4;
        border-radius: 8px;
        padding: 12px;
        font: inherit;
      }
      button {
        margin-top: 16px;
        border: 0;
        border-radius: 8px;
        padding: 12px 16px;
        color: #fff;
        background: #17324d;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }
      .code {
        display: none;
        margin-top: 20px;
        padding: 18px;
        border-radius: 8px;
        background: #f1f4f7;
      }
      .code strong {
        display: block;
        color: #17324d;
        font-size: 30px;
        letter-spacing: 4px;
      }
      .error { color: #be4d32; }
    </style>
  </head>
  <body>
    <main>
      <h1>Connect your extension</h1>
      <p>For this MVP, enter your email to create a one-time pairing code. Paste the code into the Chrome extension settings.</p>
      <label>Email
        <input id="email" type="email" autocomplete="email" placeholder="you@example.com">
      </label>
      <button id="create" type="button">Create pairing code</button>
      <p id="status"></p>
      <div id="codeWrap" class="code">
        <span>Your pairing code</span>
        <strong id="code"></strong>
        <p>Return to the extension settings and paste this code.</p>
      </div>
    </main>
    <script>
      const email = document.querySelector("#email");
      const button = document.querySelector("#create");
      const status = document.querySelector("#status");
      const codeWrap = document.querySelector("#codeWrap");
      const code = document.querySelector("#code");
      button.addEventListener("click", async () => {
        status.textContent = "Creating code...";
        status.className = "";
        codeWrap.style.display = "none";
        try {
          const response = await fetch("/v1/extension/pairing-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.value.trim() })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Could not create code.");
          code.textContent = data.code;
          codeWrap.style.display = "block";
          status.textContent = "Code created.";
        } catch (error) {
          status.textContent = error.message || String(error);
          status.className = "error";
        }
      });
    </script>
  </body>
</html>
"""


@app.get("/extension/auth", response_class=HTMLResponse)
def extension_auth(redirect_uri: str = Query(..., min_length=10, max_length=500)) -> str:
    safe_redirect = html_escape(redirect_uri)
    return f"""
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in to Client Message Assistant</title>
    <style>
      body {{
        margin: 0;
        color: #17212b;
        background: #f6f8fa;
        font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }}
      main {{
        width: min(560px, calc(100vw - 32px));
        margin: 64px auto;
        padding: 28px;
        border: 1px solid #d8dee4;
        border-radius: 8px;
        background: #fff;
      }}
      h1 {{ margin: 0 0 8px; color: #17324d; font-size: 28px; }}
      p {{ color: #5c6875; }}
      .mode {{
        display: flex;
        gap: 8px;
        margin-top: 20px;
      }}
      .mode label {{
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 0;
      }}
      label {{ display: grid; gap: 8px; margin-top: 20px; font-weight: 750; }}
      input {{
        border: 1px solid #d8dee4;
        border-radius: 8px;
        padding: 12px;
        font: inherit;
      }}
      button {{
        margin-top: 16px;
        border: 0;
        border-radius: 8px;
        padding: 12px 16px;
        color: #fff;
        background: #17324d;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }}
      .error {{ color: #be4d32; }}
    </style>
  </head>
  <body>
    <main>
      <h1>Sign in</h1>
      <p>Log in or create an account to connect Client Message Assistant to this browser.</p>
      <div class="mode">
        <label><input name="mode" type="radio" value="login" checked> Log in</label>
        <label><input name="mode" type="radio" value="signup"> Create account</label>
      </div>
      <label>Email
        <input id="email" type="email" autocomplete="email" placeholder="you@example.com">
      </label>
      <label>Password
        <input id="password" type="password" autocomplete="current-password" placeholder="At least 8 characters">
      </label>
      <button id="connect" type="button">Connect extension</button>
      <p id="status"></p>
    </main>
    <script>
      const redirectUri = "{safe_redirect}";
      const email = document.querySelector("#email");
      const password = document.querySelector("#password");
      const button = document.querySelector("#connect");
      const status = document.querySelector("#status");
      button.addEventListener("click", async () => {{
        status.textContent = "Connecting...";
        status.className = "";
        const mode = document.querySelector("input[name='mode']:checked").value;
        try {{
          const response = await fetch("/v1/extension/auth-token", {{
            method: "POST",
            headers: {{ "Content-Type": "application/json" }},
            body: JSON.stringify({{
              email: email.value.trim(),
              password: password.value,
              mode
            }})
          }});
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || "Could not sign in.");
          const params = new URLSearchParams({{
            token: data.token,
            email: data.user.email,
            user_id: data.user.id
          }});
          window.location.href = `${{redirectUri}}#${{params.toString()}}`;
        }} catch (error) {{
          status.textContent = error.message || String(error);
          status.className = "error";
        }}
      }});
    </script>
  </body>
</html>
"""


@app.post("/v1/extension/auth-token", response_model=ExchangeCodeResponse)
def create_extension_auth_token(payload: AuthRequest) -> ExchangeCodeResponse:
    if payload.mode == "signup":
        user = create_user(payload.email, payload.password)
    else:
        user = authenticate_user(payload.email, payload.password)

    return issue_extension_token(user)


@app.post("/v1/extension/pairing-code", response_model=PairingCodeResponse)
def create_pairing_code(payload: PairingCodeRequest) -> PairingCodeResponse:
    code = f"{secrets.randbelow(1_000_000):06d}"
    pairing_codes[code] = {
        "email": payload.email.lower(),
        "created_at": time.time(),
        "expires_at": time.time() + 600,
    }
    logger.info("pairing code created email=%s code=%s", payload.email.lower(), code)
    return PairingCodeResponse(code=code, expires_in_seconds=600)


@app.post("/v1/extension/exchange-code", response_model=ExchangeCodeResponse)
def exchange_pairing_code(payload: ExchangeCodeRequest) -> ExchangeCodeResponse:
    code = payload.code.strip()
    record = pairing_codes.pop(code, None)
    if not record or record["expires_at"] < time.time():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired pairing code."
        )

    user = get_or_create_pairing_user(record["email"])
    return issue_extension_token(user)


@app.get("/v1/me")
def me(user: AuthUser = Depends(require_auth)) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "subscription": {
            "status": user.subscription_status,
            "current_period_end": user.subscription_current_period_end,
            "is_valid": is_subscription_valid(user),
        },
    }


@app.get("/v1/subscription", response_model=SubscriptionResponse)
def subscription(user: AuthUser = Depends(require_auth)) -> SubscriptionResponse:
    return SubscriptionResponse(
        status=user.subscription_status,
        current_period_end=user.subscription_current_period_end,
        is_valid=is_subscription_valid(user),
    )


@app.post("/dev/subscription", response_model=SubscriptionResponse)
def dev_update_subscription(
    payload: DevSubscriptionUpdate,
    authorization: str | None = Header(default=None),
) -> SubscriptionResponse:
    require_dev_token(authorization)
    period_end = int(time.time()) + payload.days * 24 * 60 * 60
    with db() as conn:
        row = conn.execute(
            """
            update users
            set subscription_status = ?,
                subscription_current_period_end = ?
            where email = ?
            returning *
            """,
            (payload.status, period_end, normalize_email(payload.email)),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    user = row_to_auth_user(row)
    return SubscriptionResponse(
        status=user.subscription_status,
        current_period_end=user.subscription_current_period_end,
        is_valid=is_subscription_valid(user),
    )


def require_dev_token(authorization: str | None) -> None:
    if not settings.api_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="APP_API_TOKEN is required for dev admin endpoints."
        )
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(token, settings.api_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid dev token.")


def get_or_create_pairing_user(email: str) -> sqlite3.Row:
    normalized_email = normalize_email(email)
    with db() as conn:
        row = conn.execute("select * from users where email = ?", (normalized_email,)).fetchone()
    if row:
        return row
    return create_user(normalized_email, secrets.token_urlsafe(18))


def issue_extension_token(user: sqlite3.Row) -> ExchangeCodeResponse:
    token = issue_token_for_user(user)
    logger.info("extension token issued user_id=%s", user["id"])
    return ExchangeCodeResponse(token=token, user={"id": user["id"], "email": user["email"]})


@app.post("/v1/draft-client-reply", response_model=DraftResponse)
async def draft_client_reply(
    payload: DraftRequest,
    request: Request,
    user: AuthUser = Depends(require_auth),
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
            detail="OPENAI_API_KEY is not configured on the server."
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
            detail="OpenAI returned no draft text."
        )

    logger.info(
        "draft response ready request_id=%s reply_chars=%s model=%s",
        request_id,
        len(reply),
        data.get("model") or clean_payload.model or settings.openai_model,
    )
    record_usage(user.id, "draft_generated", f"request_id={request_id}")
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
