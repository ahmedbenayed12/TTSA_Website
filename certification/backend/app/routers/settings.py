"""Router: Email (Gmail OAuth2 / SMTP) and system settings.

Endpoints
---------
GET    /api/settings/gmail            Get current email config status
POST   /api/settings/gmail/smtp       Save SMTP configuration
POST   /api/settings/gmail/oauth/url  Generate OAuth2 consent URL
POST   /api/settings/gmail/oauth/callback Exchange code and store tokens
POST   /api/settings/test             Send test email to verify credentials
"""
from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.attestation import GmailConfig
from app.models.schemas import GmailConfigOut, GmailConfigSMTP
from app.services import crypto_service, email_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


class OAuthExchangeRequest(BaseModel):
    code: str
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    redirect_uri: Optional[str] = None


class OAuthUrlRequest(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    redirect_uri: Optional[str] = None


class TestEmailRequest(BaseModel):
    test_email: str


@router.get("/gmail")
async def get_email_settings(
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return currently active email config metadata (no secrets exposed)."""
    settings = get_settings()
    res = await db.execute(
        select(GmailConfig).where(GmailConfig.is_active == True).order_by(GmailConfig.id.desc())
    )
    cfg = res.scalars().first()
    if not cfg:
        return {
            "configured": False,
            "auth_type": "none",
            "sender_email": "",
            "is_active": False,
            "oauth_client_id_configured": bool(settings.gmail_client_id),
        }

    return {
        "configured": True,
        "id": cfg.id,
        "auth_type": cfg.auth_type,
        "sender_email": cfg.sender_email,
        "is_active": cfg.is_active,
        "created_at": cfg.created_at.isoformat() if cfg.created_at else None,
        "oauth_client_id_configured": bool(settings.gmail_client_id),
    }


@router.post("/gmail/smtp", response_model=GmailConfigOut)
async def save_smtp_settings(
    payload: GmailConfigSMTP,
    db: AsyncSession = Depends(get_db),
) -> GmailConfigOut:
    """Save SMTP configuration encrypted in the database."""
    settings = get_settings()

    # Mark existing active configs inactive
    await db.execute(update(GmailConfig).values(is_active=False))

    credentials = {
        "auth_type": "smtp",
        "smtp_host": payload.smtp_host.strip(),
        "smtp_port": payload.smtp_port,
        "smtp_user": payload.smtp_user.strip(),
        "smtp_password": payload.smtp_password.strip(),
        "sender_email": (payload.sender_email or "").strip() or payload.smtp_user.strip(),
    }

    encrypted = crypto_service.encrypt(json.dumps(credentials), settings.secret_key)

    cfg = GmailConfig(
        auth_type="smtp",
        encrypted_credentials=encrypted,
        sender_email=credentials["sender_email"],
        is_active=True,
    )
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return GmailConfigOut.model_validate(cfg)


@router.post("/gmail/oauth/url")
async def get_oauth_url(
    payload: Optional[OAuthUrlRequest] = None,
) -> dict[str, str]:
    """Generate the Google OAuth2 consent authorization URL."""
    settings = get_settings()

    client_id = (payload.client_id if payload and payload.client_id else settings.gmail_client_id).strip()
    client_secret = (payload.client_secret if payload and payload.client_secret else settings.gmail_client_secret).strip()
    redirect_uri = (payload.redirect_uri if payload and payload.redirect_uri else settings.gmail_redirect_uri).strip()

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google OAuth Client ID and Client Secret are required.",
        )

    try:
        url = email_service.get_gmail_oauth_url(
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
        )
        return {"auth_url": url}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not build OAuth URL: {exc}",
        ) from exc


@router.post("/gmail/oauth/callback")
async def handle_oauth_callback(
    payload: OAuthExchangeRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Exchange OAuth code for tokens and save them encrypted in the database."""
    settings = get_settings()

    client_id = (payload.client_id or settings.gmail_client_id).strip()
    client_secret = (payload.client_secret or settings.gmail_client_secret).strip()
    redirect_uri = (payload.redirect_uri or settings.gmail_redirect_uri).strip()

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google OAuth Client ID and Secret are required.",
        )

    try:
        creds_dict = await email_service.exchange_oauth_code(
            code=payload.code.strip(),
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to exchange OAuth code: {exc}",
        ) from exc

    # Determine user email if possible via Google API
    sender_email = ""
    try:
        from google.oauth2.credentials import Credentials  # type: ignore
        from googleapiclient.discovery import build  # type: ignore

        creds = Credentials(
            token=creds_dict.get("token"),
            refresh_token=creds_dict.get("refresh_token"),
            client_id=creds_dict.get("client_id"),
            client_secret=creds_dict.get("client_secret"),
            token_uri=creds_dict.get("token_uri"),
            scopes=creds_dict.get("scopes"),
        )
        service = build("gmail", "v1", credentials=creds)
        profile = service.users().getProfile(userId="me").execute()
        sender_email = profile.get("emailAddress", "")
    except Exception:
        sender_email = "authenticated_user@gmail.com"

    creds_dict["auth_type"] = "oauth2"
    creds_dict["sender_email"] = sender_email

    # Mark existing inactive
    await db.execute(update(GmailConfig).values(is_active=False))

    encrypted = crypto_service.encrypt(json.dumps(creds_dict), settings.secret_key)
    cfg = GmailConfig(
        auth_type="oauth2",
        encrypted_credentials=encrypted,
        sender_email=sender_email,
        is_active=True,
    )
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)

    return {
        "message": "OAuth credentials configured successfully.",
        "sender_email": sender_email,
        "auth_type": "oauth2",
    }


@router.post("/test")
async def test_email_connection(
    payload: TestEmailRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Send a test email using active credentials to verify the configuration."""
    settings = get_settings()

    res = await db.execute(
        select(GmailConfig).where(GmailConfig.is_active == True).order_by(GmailConfig.id.desc())
    )
    cfg = res.scalars().first()
    if not cfg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active email configuration found. Please configure SMTP or OAuth2 first.",
        )

    try:
        decrypted_json = crypto_service.decrypt(cfg.encrypted_credentials, settings.secret_key)
        credentials = json.loads(decrypted_json)
        credentials["auth_type"] = cfg.auth_type
        credentials["sender_email"] = cfg.sender_email
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not decrypt stored credentials: {exc}",
        ) from exc

    subject = "Test Email from Attestation Generator"
    body = (
        "Hello!\n\n"
        "This is a test email sent from the Attestation Generator system.\n"
        "Your email configuration is working properly!\n\n"
        "Best regards,\n"
        "TTSA Congress Organizing Team"
    )

    success = await email_service.send_email(
        config_dict=credentials,
        to_email=payload.test_email.strip(),
        subject=subject,
        body=body,
        pdf_path=None,
        sender_email=cfg.sender_email,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send test email. Please check your credentials and network connection.",
        )

    return {
        "success": True,
        "message": f"Test email successfully sent to {payload.test_email}",
        "sender": cfg.sender_email,
        "auth_type": cfg.auth_type,
    }

