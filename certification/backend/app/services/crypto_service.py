"""Encrypt / decrypt sensitive data (credentials) using Fernet symmetric encryption.

The encryption key is derived from SECRET_KEY in .env using PBKDF2HMAC so that
the key is always reproducible from the same secret without storing the key itself.
"""
import base64

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Fixed salt — intentionally not secret; it is used only to derive a stable key
# from the application secret.  Do NOT use this pattern for password storage.
SALT: bytes = b"attestation_app_salt_v1"
_KDF_ITERATIONS: int = 100_000


def _get_fernet(secret_key: str) -> Fernet:
    """Derive a Fernet instance from *secret_key*.

    Parameters
    ----------
    secret_key:
        The application secret (e.g. ``settings.secret_key``).

    Returns
    -------
    Fernet
        Ready-to-use symmetric cipher.
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=SALT,
        iterations=_KDF_ITERATIONS,
    )
    key = base64.urlsafe_b64encode(kdf.derive(secret_key.encode("utf-8")))
    return Fernet(key)


def encrypt(data: str, secret_key: str) -> str:
    """Encrypt *data* and return a URL-safe base-64 string.

    Parameters
    ----------
    data:
        Plain-text string to protect.
    secret_key:
        Application secret from settings.

    Returns
    -------
    str
        Fernet token (URL-safe base-64 encoded).
    """
    return _get_fernet(secret_key).encrypt(data.encode("utf-8")).decode("utf-8")


def decrypt(data: str, secret_key: str) -> str:
    """Decrypt a Fernet token back to its original plain text.

    Parameters
    ----------
    data:
        Fernet token returned by :func:`encrypt`.
    secret_key:
        Application secret — must match the one used for encryption.

    Returns
    -------
    str
        Original plain-text string.

    Raises
    ------
    cryptography.fernet.InvalidToken
        If the token is corrupted, tampered with, or the wrong key is used.
    """
    return _get_fernet(secret_key).decrypt(data.encode("utf-8")).decode("utf-8")
