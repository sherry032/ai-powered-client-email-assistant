from dataclasses import dataclass

from pydantic import BaseModel, Field


@dataclass
class AuthUser:
    id: str
    email: str
    subscription_status: str
    subscription_current_period_end: int


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


class CheckoutRequest(BaseModel):
    plan: str = Field(pattern="^(solo|studio)$")


class CheckoutResponse(BaseModel):
    status: str
    plan: str
    subscription: SubscriptionResponse
