"""Email sending service.

Supports two authentication modes:
- ``oauth2``  — Google Gmail API with OAuth 2.0
- ``smtp``    — Vanilla SMTP with app password (aiosmtplib)

Public API
----------
get_gmail_oauth_url(client_id, client_secret, redirect_uri) -> str
exchange_oauth_code(code, client_id, client_secret, redirect_uri) -> dict
send_email(config_dict, to_email, subject, body, pdf_path, sender_email) -> bool
interpolate_template(template_str, row_data) -> str
validate_rate_limit(sent_today, max_daily) -> bool
"""
from __future__ import annotations

import base64
import logging
import mimetypes
import os
import re
import ssl
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import aiosmtplib

logger = logging.getLogger(__name__)

# Google OAuth2 scope for sending email
_GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


# ---------------------------------------------------------------------------
# Template interpolation
# ---------------------------------------------------------------------------

def interpolate_template(template_str: str, row_data: dict[str, Any]) -> str:
    """Replace ``{{field_name}}`` placeholders with values from *row_data*.

    Unknown placeholders are left as-is.

    Parameters
    ----------
    template_str:
        Template string containing ``{{column_name}}`` tokens.
    row_data:
        Dict mapping column names to their values.

    Returns
    -------
    str
        Interpolated string.
    """
    def replacer(match: re.Match) -> str:
        key = match.group(1).strip()
        val = row_data.get(key)
        if val is None:
            return match.group(0)  # leave placeholder intact
        return str(val)

    return re.sub(r"\{\{(.+?)\}\}", replacer, template_str)


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

def validate_rate_limit(sent_today: int, max_daily: int) -> bool:
    """Return True when the daily quota has not been reached.

    Parameters
    ----------
    sent_today:
        Number of emails already sent today.
    max_daily:
        Maximum allowed sends per day.

    Returns
    -------
    bool
        ``True`` → quota available; ``False`` → limit exceeded.
    """
    return sent_today < max_daily


# ---------------------------------------------------------------------------
# OAuth2 helpers
# ---------------------------------------------------------------------------

def get_gmail_oauth_url(
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> str:
    """Build the Google OAuth2 consent-screen URL.

    Parameters
    ----------
    client_id, client_secret, redirect_uri:
        OAuth2 application credentials from Google Cloud Console.

    Returns
    -------
    str
        Authorization URL to redirect the user to.
    """
    from google_auth_oauthlib.flow import Flow  # type: ignore

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=_GMAIL_SCOPES,
        redirect_uri=redirect_uri,
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


async def exchange_oauth_code(
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> dict[str, Any]:
    """Exchange an OAuth2 authorization code for credentials.

    Parameters
    ----------
    code:
        The ``code`` query parameter returned by Google after user consent.

    Returns
    -------
    dict
        Serialisable credentials dict containing ``token``, ``refresh_token``,
        ``client_id``, ``client_secret``, ``scopes``, etc.
    """
    from google_auth_oauthlib.flow import Flow  # type: ignore

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=_GMAIL_SCOPES,
        redirect_uri=redirect_uri,
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    return {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "token_uri": creds.token_uri,
        "scopes": list(creds.scopes or _GMAIL_SCOPES),
    }


# ---------------------------------------------------------------------------
# Gmail API send
# ---------------------------------------------------------------------------

async def _send_via_gmail_api(
    credentials_dict: dict[str, Any],
    to: str,
    subject: str,
    body: str,
    pdf_path: str | None,
    sender: str,
) -> bool:
    """Send an email through the Gmail REST API using stored OAuth2 credentials.

    Parameters
    ----------
    credentials_dict:
        Dict previously returned by :func:`exchange_oauth_code`.
    to:
        Recipient email address.
    subject:
        Email subject line.
    body:
        Plain-text email body.
    pdf_path:
        Optional path to a PDF attachment.
    sender:
        Sender email address (must match the authenticated account).

    Returns
    -------
    bool
        ``True`` on success, ``False`` on any error.
    """
    try:
        import asyncio

        from google.oauth2.credentials import Credentials  # type: ignore
        from googleapiclient.discovery import build  # type: ignore

        creds = Credentials(
            token=credentials_dict.get("token"),
            refresh_token=credentials_dict.get("refresh_token"),
            client_id=credentials_dict.get("client_id"),
            client_secret=credentials_dict.get("client_secret"),
            token_uri=credentials_dict.get("token_uri", "https://oauth2.googleapis.com/token"),
            scopes=credentials_dict.get("scopes", _GMAIL_SCOPES),
        )

        # Build the MIME message
        msg = _build_mime_message(sender=sender, to=to, subject=subject, body=body, pdf_path=pdf_path)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

        # Run blocking SDK call in a thread pool
        def _do_send() -> None:
            service = build("gmail", "v1", credentials=creds)
            service.users().messages().send(
                userId="me", body={"raw": raw}
            ).execute()

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _do_send)
        return True

    except Exception as exc:
        logger.error("Gmail API send error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# SMTP send
# ---------------------------------------------------------------------------

async def _send_via_smtp(
    smtp_config: dict[str, Any],
    to: str,
    subject: str,
    body: str,
    pdf_path: str | None,
) -> bool:
    """Send an email via SMTP using aiosmtplib.

    Supports:
    - Port 465 → implicit SSL
    - Port 587 → STARTTLS

    Parameters
    ----------
    smtp_config:
        Dict with keys: ``smtp_host``, ``smtp_port``, ``smtp_user``,
        ``smtp_password``, ``sender_email``.
    to, subject, body, pdf_path:
        Standard message parameters.

    Returns
    -------
    bool
        ``True`` on success.
    """
    try:
        host: str = smtp_config["smtp_host"]
        port: int = int(smtp_config["smtp_port"])
        user: str = smtp_config["smtp_user"]
        password: str = smtp_config["smtp_password"]
        sender: str = smtp_config.get("sender_email", user)

        msg = _build_mime_message(sender=sender, to=to, subject=subject, body=body, pdf_path=pdf_path)

        use_tls = port == 465

        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=user,
            password=password,
            use_tls=use_tls,
            start_tls=not use_tls,
        )
        return True

    except Exception as exc:
        logger.error("SMTP send error: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Shared MIME builder
# ---------------------------------------------------------------------------

def _build_mime_message(
    sender: str,
    to: str,
    subject: str,
    body: str,
    pdf_path: str | None,
) -> MIMEMultipart:
    """Assemble a MIME multipart message, optionally with a PDF attachment."""
    msg = MIMEMultipart()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))

    if pdf_path and os.path.exists(pdf_path):
        with open(pdf_path, "rb") as fh:
            attachment = MIMEApplication(fh.read(), _subtype="pdf")
        filename = os.path.basename(pdf_path)
        attachment.add_header("Content-Disposition", "attachment", filename=filename)
        msg.attach(attachment)

    return msg


# ---------------------------------------------------------------------------
# Unified send entry point
# ---------------------------------------------------------------------------

async def send_email(
    config_dict: dict[str, Any],
    to_email: str,
    subject: str,
    body: str,
    pdf_path: str | None = None,
    sender_email: str | None = None,
) -> bool:
    """Send an email using the stored configuration.

    Dispatches to :func:`_send_via_gmail_api` or :func:`_send_via_smtp`
    based on ``config_dict["auth_type"]``.

    Parameters
    ----------
    config_dict:
        Decoded (plain-text) credentials dict.  For SMTP it must have the
        keys expected by :func:`_send_via_smtp`; for OAuth2 it must match
        the structure returned by :func:`exchange_oauth_code` plus an
        ``"sender_email"`` key.
    to_email:
        Recipient address.
    subject, body:
        Already-interpolated email content.
    pdf_path:
        Optional PDF attachment path.
    sender_email:
        Override sender; falls back to ``config_dict["sender_email"]``.

    Returns
    -------
    bool
        ``True`` if the message was accepted for delivery.
    """
    auth_type: str = config_dict.get("auth_type", "smtp").lower()
    effective_sender = sender_email or config_dict.get("sender_email", "")

    if auth_type == "oauth2":
        return await _send_via_gmail_api(
            credentials_dict=config_dict,
            to=to_email,
            subject=subject,
            body=body,
            pdf_path=pdf_path,
            sender=effective_sender,
        )
    else:
        return await _send_via_smtp(
            smtp_config=config_dict,
            to=to_email,
            subject=subject,
            body=body,
            pdf_path=pdf_path,
        )
