import time

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import AuthUser, CheckoutRequest, CheckoutResponse, SubscriptionResponse
from app.auth.service import is_subscription_valid, require_auth
from app.core.database import User, get_db


router = APIRouter()


@router.post("/v1/billing/checkout", response_model=CheckoutResponse)
def mock_checkout(
    payload: CheckoutRequest,
    user: AuthUser = Depends(require_auth),
    session: Session = Depends(get_db),
) -> CheckoutResponse:
    db_user = session.scalar(select(User).where(User.id == user.id))
    if db_user:
        db_user.subscription_status = "active"
        db_user.subscription_current_period_end = int(time.time()) + 30 * 24 * 60 * 60
        session.commit()
        session.refresh(db_user)
        user.subscription_status = db_user.subscription_status
        user.subscription_current_period_end = db_user.subscription_current_period_end

    subscription = SubscriptionResponse(
        status=user.subscription_status,
        current_period_end=user.subscription_current_period_end,
        is_valid=is_subscription_valid(user),
    )
    return CheckoutResponse(status="completed", plan=payload.plan, subscription=subscription)


@router.get("/v1/billing/portal")
def billing_portal(user: AuthUser = Depends(require_auth)) -> dict[str, str]:
    return {
        "message": "Billing portal is not connected yet. Replace this endpoint with Stripe Billing Portal.",
        "user_id": user.id,
    }
