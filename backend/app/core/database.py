from collections.abc import Generator

from sqlalchemy import ForeignKey, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from app.core.config import settings


def database_url() -> str:
    if settings.database_path.startswith("sqlite:///"):
        return settings.database_path
    return f"sqlite:///{settings.database_path}"


engine = create_engine(
    database_url(),
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(nullable=False)
    subscription_status: Mapped[str] = mapped_column(nullable=False)
    subscription_current_period_end: Mapped[int] = mapped_column(nullable=False)
    created_at: Mapped[int] = mapped_column(nullable=False)

    tokens: Mapped[list["ExtensionToken"]] = relationship(back_populates="user")
    usage_events: Mapped[list["UsageEvent"]] = relationship(back_populates="user")


class ExtensionToken(Base):
    __tablename__ = "extension_tokens"

    token_hash: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[int] = mapped_column(nullable=False)
    revoked_at: Mapped[int | None] = mapped_column(nullable=True)

    user: Mapped[User] = relationship(back_populates="tokens")


class UsageEvent(Base):
    __tablename__ = "usage_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(nullable=False)
    created_at: Mapped[int] = mapped_column(nullable=False)
    metadata_text: Mapped[str | None] = mapped_column("metadata", nullable=True)

    user: Mapped[User] = relationship(back_populates="usage_events")


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
