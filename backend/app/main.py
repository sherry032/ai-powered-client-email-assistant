import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.auth.routes import router as auth_router
from app.billing import router as billing_router
from app.client_messages import router as client_messages_router
from app.core.config import origins_to_regex, settings
from app.core.database import init_db


logging.getLogger("client-message-assistant").setLevel(logging.INFO)
init_db()

app = FastAPI(
    title="Client Message Assistant API",
    version="0.1.0",
    description="Backend API for drafting client email replies from a Chrome extension.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=origins_to_regex(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Client-Version", "X-Request-ID"],
)

app.add_middleware(SessionMiddleware, secret_key=settings.session_secret_key)

app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(client_messages_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true"}
