import logging
import secrets
import time
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import (
    AuthRequest,
    AuthUser,
    DevSubscriptionUpdate,
    ExchangeCodeRequest,
    ExchangeCodeResponse,
    PairingCodeRequest,
    PairingCodeResponse,
    SubscriptionResponse,
)
from app.auth.pages import auth_page, pairing_page
from app.auth.oauth import google_client_configured, oauth
from app.auth.service import (
    authenticate_user,
    create_user,
    get_or_create_oauth_user,
    get_or_create_pairing_user,
    is_subscription_valid,
    issue_extension_token,
    normalize_email,
    require_auth,
    require_dev_token,
    user_to_auth_user,
)
from app.core.database import User, get_db


router = APIRouter()
pairing_codes: dict[str, dict[str, Any]] = {}
logger = logging.getLogger("client-message-assistant.auth")


@router.get("/extension/connect", response_class=HTMLResponse)
def extension_connect() -> str:
    return pairing_page()


@router.get("/extension/auth", response_class=HTMLResponse)
def extension_auth(redirect_uri: str = Query(..., min_length=10, max_length=500)) -> str:
    return auth_page(redirect_uri)


@router.get("/extension/auth/google/start")
async def google_auth_start(
    request: Request,
    redirect_uri: str = Query(..., min_length=10, max_length=500),
) -> RedirectResponse:
    if not google_client_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured on this server.",
        )

    request.session["extension_redirect_uri"] = redirect_uri
    callback_url = str(request.url_for("google_auth_callback"))
    return await oauth.google.authorize_redirect(request, callback_url)


@router.get("/extension/auth/google/callback", name="google_auth_callback")
async def google_auth_callback(
    request: Request,
    session: Session = Depends(get_db),
) -> RedirectResponse:
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo") or {}
    email = userinfo.get("email")
    email_verified = userinfo.get("email_verified")

    if not email or email_verified is False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email is missing or unverified.",
        )

    extension_redirect_uri = request.session.pop("extension_redirect_uri", None)
    if not extension_redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing extension redirect URI. Please start sign-in again.",
        )

    user = get_or_create_oauth_user(session, email)
    response = issue_extension_token(session, user)
    params = urlencode({
        "token": response.token,
        "email": response.user["email"],
        "user_id": response.user["id"],
    })
    return RedirectResponse(f"{extension_redirect_uri}#{params}")


@router.post("/v1/extension/auth-token", response_model=ExchangeCodeResponse)
def create_extension_auth_token(
    payload: AuthRequest,
    session: Session = Depends(get_db),
) -> ExchangeCodeResponse:
    if payload.mode == "signup":
        user = create_user(session, payload.email, payload.password)
    else:
        user = authenticate_user(session, payload.email, payload.password)

    response = issue_extension_token(session, user)
    logger.info("extension token issued user_id=%s", response.user["id"])
    return response


@router.post("/v1/extension/pairing-code", response_model=PairingCodeResponse)
def create_pairing_code(payload: PairingCodeRequest) -> PairingCodeResponse:
    code = f"{secrets.randbelow(1_000_000):06d}"
    pairing_codes[code] = {
        "email": payload.email.lower(),
        "created_at": time.time(),
        "expires_at": time.time() + 600,
    }
    logger.info("pairing code created email=%s code=%s", payload.email.lower(), code)
    return PairingCodeResponse(code=code, expires_in_seconds=600)


@router.post("/v1/extension/exchange-code", response_model=ExchangeCodeResponse)
def exchange_pairing_code(
    payload: ExchangeCodeRequest,
    session: Session = Depends(get_db),
) -> ExchangeCodeResponse:
    code = payload.code.strip()
    record = pairing_codes.pop(code, None)
    if not record or record["expires_at"] < time.time():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired pairing code.",
        )

    user = get_or_create_pairing_user(session, record["email"])
    return issue_extension_token(session, user)


@router.get("/v1/me")
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


@router.get("/v1/subscription", response_model=SubscriptionResponse)
def subscription(user: AuthUser = Depends(require_auth)) -> SubscriptionResponse:
    return SubscriptionResponse(
        status=user.subscription_status,
        current_period_end=user.subscription_current_period_end,
        is_valid=is_subscription_valid(user),
    )


@router.post("/dev/subscription", response_model=SubscriptionResponse)
def dev_update_subscription(
    payload: DevSubscriptionUpdate,
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> SubscriptionResponse:
    require_dev_token(authorization)
    period_end = int(time.time()) + payload.days * 24 * 60 * 60
    db_user = session.scalar(select(User).where(User.email == normalize_email(payload.email)))
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    db_user.subscription_status = payload.status
    db_user.subscription_current_period_end = period_end
    session.commit()
    session.refresh(db_user)
    user = user_to_auth_user(db_user)

    return SubscriptionResponse(
        status=user.subscription_status,
        current_period_end=user.subscription_current_period_end,
        is_valid=is_subscription_valid(user),
    )
