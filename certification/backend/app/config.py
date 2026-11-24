"""Application configuration using pydantic-settings.
Loads settings from environment variables and optional .env file.
"""
import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All application settings with defaults and .env override support."""

    # Database
    database_url: str = "sqlite+aiosqlite:///./attestation.db"

    # Security
    secret_key: str = "change-me"

    # File storage paths (relative to CWD or absolute)
    upload_dir: str = "uploads"
    generated_dir: str = "generated"

    # Gmail OAuth2 credentials
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_redirect_uri: str = "http://localhost:8000/api/gmail/callback"

    # Rate limiting
    send_delay_seconds: float = 1.5
    max_daily_emails: int = 450

    # CORS / frontend
    frontend_url: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache()
def get_settings() -> Settings:
    """Return cached Settings singleton. Reads .env once and detects persistent storage."""
    s = Settings()

    # If Render persistent disk exists at /data, store DB & files there
    if os.environ.get("DATABASE_URL"):
        s.database_url = os.environ["DATABASE_URL"]
    elif os.path.exists("/data") and os.path.isdir("/data"):
        s.database_url = "sqlite+aiosqlite:////data/attestation.db"

    if os.environ.get("UPLOAD_DIR"):
        s.upload_dir = os.environ["UPLOAD_DIR"]
    elif os.path.exists("/data") and os.path.isdir("/data"):
        s.upload_dir = "/data/cert_uploads"
        os.makedirs(s.upload_dir, exist_ok=True)

    if os.environ.get("GENERATED_DIR"):
        s.generated_dir = os.environ["GENERATED_DIR"]
    elif os.path.exists("/data") and os.path.isdir("/data"):
        s.generated_dir = "/data/cert_generated"
        os.makedirs(s.generated_dir, exist_ok=True)

    return s
