import secrets
import time

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.models import AuthUser, ExchangeCodeResponse
from app.auth.security import hash_password, token_hash, verify_password
from app.core.config import settings
from app.core.database import ExtensionToken, UsageEvent, User, get_db


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def require_auth(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_db),
) -> AuthUser:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API token. Sign in from the extension settings page.",
        )

    if settings.api_token and secrets.compare_digest(token, settings.api_token):
        return AuthUser(
            id="dev-token",
            email="dev@example.local",
            subscription_status="active",
            subscription_current_period_end=int(time.time()) + 31_536_000,
        )

    user = get_user_by_token(session, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired API token. Sign in again from extension settings.",
        )

    return user


def require_valid_subscription(user: AuthUser) -> None:
    if is_subscription_valid(user):
        return

    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail="Your subscription is not active. Please update your plan to generate drafts.",
    )


def is_subscription_valid(user: AuthUser) -> bool:
    return (
        user.subscription_status in {"active", "trialing"}
        and user.subscription_current_period_end > int(time.time())
    )


def create_user(session: Session, email: str, password: str) -> User:
    now = int(time.time())
    user = User(
        id=f"user_{secrets.token_urlsafe(16)}",
        email=normalize_email(email),
        password_hash=hash_password(password),
        subscription_status="trialing",
        subscription_current_period_end=now + settings.signup_trial_days * 24 * 60 * 60,
        created_at=now,
    )

    try:
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for this email. Log in instead.",
        ) from exc


def authenticate_user(session: Session, email: str, password: str) -> User:
    user = session.scalar(select(User).where(User.email == normalize_email(email)))

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    return user


def user_to_auth_user(user: User) -> AuthUser:
    return AuthUser(
        id=user.id,
        email=user.email,
        subscription_status=user.subscription_status,
        subscription_current_period_end=user.subscription_current_period_end,
    )


def issue_token_for_user(session: Session, user: User) -> str:
    token = f"cma_{secrets.token_urlsafe(32)}"
    session.add(
        ExtensionToken(
            token_hash=token_hash(token),
            user_id=user.id,
            created_at=int(time.time()),
            revoked_at=None,
        )
    )
    session.commit()
    return token


def get_user_by_token(session: Session, token: str) -> AuthUser | None:
    user = session.scalar(
        select(User)
        .join(ExtensionToken, ExtensionToken.user_id == User.id)
        .where(
            ExtensionToken.token_hash == token_hash(token),
            ExtensionToken.revoked_at.is_(None),
        )
    )
    return user_to_auth_user(user) if user else None


def record_usage(session: Session, user_id: str, event_type: str, metadata: str = "") -> None:
    session.add(
        UsageEvent(
            user_id=user_id,
            event_type=event_type,
            created_at=int(time.time()),
            metadata_text=metadata,
        )
    )
    session.commit()


def get_or_create_pairing_user(session: Session, email: str) -> User:
    normalized_email = normalize_email(email)
    user = session.scalar(select(User).where(User.email == normalized_email))
    if user:
        return user
    return create_user(session, normalized_email, secrets.token_urlsafe(18))


def get_or_create_oauth_user(session: Session, email: str) -> User:
    normalized_email = normalize_email(email)
    user = session.scalar(select(User).where(User.email == normalized_email))
    if user:
        return user
    return create_user(session, normalized_email, secrets.token_urlsafe(24))


def issue_extension_token(session: Session, user: User) -> ExchangeCodeResponse:
    token = issue_token_for_user(session, user)
    return ExchangeCodeResponse(token=token, user={"id": user.id, "email": user.email})


def require_dev_token(authorization: str | None) -> None:
    if not settings.api_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="APP_API_TOKEN is required for dev admin endpoints.",
        )
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(token, settings.api_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid dev token.")
