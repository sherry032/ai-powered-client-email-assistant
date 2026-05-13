import os

from dotenv import load_dotenv


load_dotenv()


def parse_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def origins_to_regex(origins: list[str]) -> str:
    escaped = []
    for origin in origins:
        escaped.append(origin.replace(".", r"\.").replace("*", ".*"))
    return f"^({'|'.join(escaped)})$" if escaped else r"^$"


class Settings:
    def __init__(self) -> None:
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
        self.api_token = os.getenv("APP_API_TOKEN", "")
        self.allowed_origins = parse_csv(
            os.getenv("ALLOWED_ORIGINS", "chrome-extension://*,http://localhost:*,http://127.0.0.1:*")
        )
        self.rate_limit_per_hour = int(os.getenv("RATE_LIMIT_PER_HOUR", "120"))
        self.max_context_chars = int(os.getenv("MAX_CONTEXT_CHARS", "6000"))
        self.request_timeout_seconds = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "45"))
        self.database_path = os.getenv("DATABASE_PATH", "client_message_assistant.sqlite3")
        self.signup_trial_days = int(os.getenv("SIGNUP_TRIAL_DAYS", "14"))
        self.session_secret_key = os.getenv("SESSION_SECRET_KEY", "dev-change-me")
        self.google_client_id = os.getenv("GOOGLE_CLIENT_ID", "")
        self.google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")


settings = Settings()
