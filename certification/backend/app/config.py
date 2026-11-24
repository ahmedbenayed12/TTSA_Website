"""Application configuration using pydantic-settings.
Loads settings from environment variables and optional .env file.
"""
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
    """Return cached Settings singleton. Reads .env once."""
    return Settings()
