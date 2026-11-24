"""Font utilities for the PDF generation service.

Provides a list of available built-in PDF fonts and a text-width estimator
based on PyMuPDF's internal metrics.
"""
from __future__ import annotations

import fitz  # PyMuPDF

# ---------------------------------------------------------------------------
# Built-in PDF font names (PDF standard 14)
# ---------------------------------------------------------------------------

BUILTIN_FONTS: list[str] = [
    "Helvetica",
    "Helvetica-Bold",
    "Helvetica-Oblique",
    "Helvetica-BoldOblique",
    "Times-Roman",
    "Times-Bold",
    "Times-Italic",
    "Times-BoldItalic",
    "Courier",
    "Courier-Bold",
    "Courier-Oblique",
    "Courier-BoldOblique",
]

# Mapping from user-friendly name to fitz built-in short name
_FITZ_NAME_MAP: dict[str, str] = {
    "Helvetica": "helv",
    "Helvetica-Bold": "hebo",
    "Helvetica-Oblique": "heit",
    "Helvetica-BoldOblique": "hebi",
    "Times-Roman": "tiro",
    "Times-Bold": "tibo",
    "Times-Italic": "tiit",
    "Times-BoldItalic": "tibi",
    "Courier": "cour",
    "Courier-Bold": "cobo",
    "Courier-Oblique": "coit",
    "Courier-BoldOblique": "cobi",
}


def list_available_fonts() -> list[str]:
    """Return the list of built-in PDF fonts always available without extra files.

    Returns
    -------
    list[str]
        Standard 14 PDF font names.
    """
    return list(BUILTIN_FONTS)


def get_text_width(text: str, font_name: str = "Helvetica", font_size: float = 12.0) -> float:
    """Estimate the rendered width of *text* in points.

    Uses PyMuPDF's :class:`fitz.Font` to query actual glyph metrics rather
    than relying on a fixed character-width approximation.

    Parameters
    ----------
    text:
        The string whose width to measure.
    font_name:
        A built-in font name (from :data:`BUILTIN_FONTS`) or a fitz short name
        like ``"helv"``.  Unknown names fall back to Helvetica.
    font_size:
        Font size in points.

    Returns
    -------
    float
        Estimated width in points.
    """
    if not text:
        return 0.0

    # Resolve to fitz short name
    fitz_name = _FITZ_NAME_MAP.get(font_name, font_name)

    try:
        font = fitz.Font(fitz_name)
        return font.text_length(text, fontsize=font_size)
    except Exception:
        # Fallback: coarse approximation (avg char ≈ 0.6 × font_size)
        return len(text) * font_size * 0.6
