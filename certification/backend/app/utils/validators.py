"""Email and general data validators."""
from __future__ import annotations

import re

# RFC 5321-ish email regex — pragmatic balance between strictness and coverage
EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
)


def is_valid_email(email: str) -> bool:
    """Return True when *email* passes the basic format check.

    Parameters
    ----------
    email:
        Email address to validate (leading/trailing whitespace is stripped
        by the caller before invoking this function).

    Returns
    -------
    bool
    """
    return bool(EMAIL_REGEX.match(email.strip()))


def find_duplicate_emails(emails: list[str]) -> list[str]:
    """Return a list of email addresses that appear more than once.

    The comparison is case-insensitive.  The returned list contains each
    duplicated address exactly once, in the order it was first seen.

    Parameters
    ----------
    emails:
        Flat list of email strings (may already be lowercased).

    Returns
    -------
    list[str]
        Lowercase duplicate addresses.
    """
    seen: dict[str, int] = {}
    for email in emails:
        lower = email.lower().strip()
        seen[lower] = seen.get(lower, 0) + 1

    return [addr for addr, count in seen.items() if count > 1]


def validate_filename_pattern(
    pattern: str, available_columns: list[str]
) -> list[str]:
    """Return a list of ``{{placeholder}}`` tokens that cannot be resolved.

    Parameters
    ----------
    pattern:
        Filename pattern string, e.g. ``"Certificate_{{Author}}.pdf"``.
    available_columns:
        Column names present in the Excel sheet plus special keys like
        ``"name"`` (always injected by the send queue).

    Returns
    -------
    list[str]
        Unresolvable placeholder names (without braces).
        An empty list means the pattern is fully resolvable.
    """
    placeholders = re.findall(r"\{\{(.+?)\}\}", pattern)
    # Always-available synthetic keys
    built_ins = {"name", "email", "_row_index"}
    all_available = set(available_columns) | built_ins

    return [p.strip() for p in placeholders if p.strip() not in all_available]
