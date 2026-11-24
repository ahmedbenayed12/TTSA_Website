"""PDF generation and inspection service using PyMuPDF (fitz).

Public API
----------
detect_acroform_fields(pdf_path)       -> list[dict]
pdf_page_to_image(pdf_path, page_num, zoom) -> bytes  (PNG)
generate_pdf_for_row(template_path, field_mappings, row_data, output_path) -> str
get_pdf_info(pdf_path)                 -> dict
"""
from __future__ import annotations

import io
import os
import re
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# fitz alignment constants
_ALIGN_MAP = {
    "left": fitz.TEXT_ALIGN_LEFT,
    "center": fitz.TEXT_ALIGN_CENTER,
    "right": fitz.TEXT_ALIGN_RIGHT,
}

_DEFAULT_FONT = "helv"   # fitz built-in name for Helvetica


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _color_to_rgb(color_int: int) -> tuple[float, float, float]:
    """Convert a 24-bit integer colour (0xRRGGBB) to normalised RGB tuple."""
    r = ((color_int >> 16) & 0xFF) / 255.0
    g = ((color_int >> 8) & 0xFF) / 255.0
    b = (color_int & 0xFF) / 255.0
    return (r, g, b)


def _is_rtl(text: str) -> bool:
    """Return True when *text* contains Arabic or Hebrew characters."""
    arabic_range = re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]")
    hebrew_range = re.compile(r"[\u0590-\u05FF\uFB1D-\uFB4F]")
    return bool(arabic_range.search(text) or hebrew_range.search(text))


def _shape_rtl(text: str) -> str:
    """Apply Arabic reshaping and BiDi algorithm for proper RTL rendering."""
    try:
        import arabic_reshaper  # type: ignore
        from bidi.algorithm import get_display  # type: ignore

        reshaped = arabic_reshaper.reshape(text)
        return get_display(reshaped)
    except ImportError:
        # Libraries not installed — return text as-is
        return text


def _resolve_font(font_name: str, is_bold: bool = False, is_italic: bool = False) -> str:
    """Map a user-supplied font name to a fitz-safe built-in name, with fallback.

    fitz built-in names: helv, hebo, heit, hebi, tiro, tibi, cour, cobo, cobi
    """
    name_lower = font_name.lower()

    # Explicit style mapping
    if "helvetica" in name_lower or "opensans" in name_lower or name_lower in ("helv",):
        if is_bold and is_italic:
            return "hebi"
        if is_bold:
            return "hebo"
        if is_italic:
            return "heit"
        return "helv"

    if "times" in name_lower or "tiro" in name_lower:
        if is_bold and is_italic:
            return "tibi"
        if is_bold:
            return "tibo"
        if is_italic:
            return "tiit"
        return "tiro"

    if "courier" in name_lower or "cour" in name_lower:
        if is_bold and is_italic:
            return "cobi"
        if is_bold:
            return "cobo"
        if is_italic:
            return "coit"
        return "cour"

    # Unknown font → safe Helvetica family fallback
    if is_bold and is_italic:
        return "hebi"
    if is_bold:
        return "hebo"
    if is_italic:
        return "heit"
    return "helv"


def _wrap_text(text: str, font_name: str, font_size: float, max_width: float) -> list[str]:
    """Split *text* into lines that fit within *max_width* points using PyMuPDF font metrics."""
    if max_width <= 0 or not text:
        return [text]

    words = text.split()
    lines: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip() if current else word
        try:
            width = fitz.get_text_length(candidate, fontname=font_name, fontsize=font_size)
        except Exception:
            width = len(candidate) * font_size * 0.52

        if width <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word

    if current:
        lines.append(current)

    return lines if lines else [text]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_pdf_info(pdf_path: str) -> dict[str, Any]:
    """Return basic metadata about a PDF file.

    Parameters
    ----------
    pdf_path:
        Absolute or relative path to the PDF.

    Returns
    -------
    dict
        ``{page_count, page_sizes: [{width, height}], has_acroform}``
    """
    doc = fitz.open(pdf_path)
    try:
        page_sizes = [
            {"width": round(p.rect.width, 2), "height": round(p.rect.height, 2)}
            for p in doc
        ]
        has_acroform = bool(doc.is_pdf and doc.get_sigflags() != -1 or _has_widgets(doc))
        return {
            "page_count": doc.page_count,
            "page_sizes": page_sizes,
            "has_acroform": has_acroform,
        }
    finally:
        doc.close()


def _has_widgets(doc: fitz.Document) -> bool:
    """Return True if any page of *doc* contains interactive form widgets."""
    for page in doc:
        if page.widgets():
            return True
    return False


def detect_acroform_fields(pdf_path: str) -> list[dict[str, Any]]:
    """Detect interactive AcroForm widget fields in a PDF.

    Parameters
    ----------
    pdf_path:
        Path to the PDF file.

    Returns
    -------
    list[dict]
        Each dict has keys: ``name``, ``field_type``, ``rect``, ``page``.
        Returns an empty list when the PDF has no AcroForm.
    """
    doc = fitz.open(pdf_path)
    fields: list[dict[str, Any]] = []
    try:
        for page_num, page in enumerate(doc):
            for widget in page.widgets():
                fields.append(
                    {
                        "name": widget.field_name or "",
                        "field_type": widget.field_type_string,
                        "rect": list(widget.rect),
                        "page": page_num,
                    }
                )
    finally:
        doc.close()
    return fields


def pdf_page_to_image(pdf_path: str, page_num: int = 0, zoom: float = 2.0) -> bytes:
    """Render one PDF page as a PNG image.

    Parameters
    ----------
    pdf_path:
        Path to the PDF file.
    page_num:
        Zero-based page index to render.
    zoom:
        Magnification factor (2.0 → 144 dpi for a 72-dpi base).

    Returns
    -------
    bytes
        Raw PNG bytes.
    """
    doc = fitz.open(pdf_path)
    try:
        if page_num >= doc.page_count:
            page_num = 0
        page = doc[page_num]
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        return pix.tobytes("png")
    finally:
        doc.close()


def generate_pdf_for_row(
    template_path: str,
    field_mappings: list[dict[str, Any]],
    row_data: dict[str, Any],
    output_path: str,
) -> str:
    """Overlay dynamic text fields onto a PDF template and save the result.

    Parameters
    ----------
    template_path:
        Path to the base PDF template.
    field_mappings:
        List of field-mapping dicts (matches :class:`FieldMapping` schema).
        Each must contain at minimum: ``field_name``, ``x``, ``y``, ``page``.
    row_data:
        Dict mapping column names to values from the Excel row.
    output_path:
        Destination path for the generated PDF.

    Returns
    -------
    str
        The resolved *output_path*.

    Raises
    ------
    FileNotFoundError
        If *template_path* does not exist.
    """
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template not found: {template_path}")

    # Ensure output directory exists
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    doc = fitz.open(template_path)
    try:
        from app.services.excel_service import resolve_column

        for mapping in field_mappings:
            field_name: str = mapping.get("field_name", "")
            raw_value = row_data.get(field_name)
            if raw_value is None:
                # Fallback to flexible case/separator-insensitive resolution
                matched_key = resolve_column(row_data.keys(), field_name)
                if matched_key:
                    raw_value = row_data.get(matched_key)
            if raw_value is None:
                continue

            text: str = str(raw_value).strip()
            if not text:
                continue

            # Handle RTL / Arabic text
            if _is_rtl(text):
                text = _shape_rtl(text)

            page_idx: int = int(mapping.get("page", 0))
            if page_idx >= doc.page_count:
                page_idx = 0
            page = doc[page_idx]

            x: float = float(mapping.get("x", 0))
            y: float = float(mapping.get("y", 0))
            font_size: float = float(mapping.get("font_size", 12))
            color_int: int = int(mapping.get("color", 0x000000))
            color = _color_to_rgb(color_int)
            is_bold: bool = bool(mapping.get("is_bold", False))
            is_italic: bool = bool(mapping.get("is_italic", False))
            alignment_str: str = str(mapping.get("alignment", "center")).lower()
            max_width: float = float(mapping.get("max_width", 0))
            font_key: str = _resolve_font(
                str(mapping.get("font", "Helvetica")), is_bold, is_italic
            )
            # Wrap text if max_width is set
            lines = _wrap_text(text, font_key, font_size, max_width)
            line_spacing = font_size * 1.35

            for i, line in enumerate(lines):
                try:
                    t_len = fitz.get_text_length(line, fontname=font_key, fontsize=font_size)
                except Exception:
                    t_len = len(line) * font_size * 0.52

                if alignment_str == "center":
                    px = x - t_len / 2.0
                elif alignment_str == "right":
                    px = x - t_len
                else:
                    px = x

                py = y + i * line_spacing

                page.insert_text(
                    fitz.Point(px, py),
                    line,
                    fontname=font_key,
                    fontsize=font_size,
                    color=color,
                )

        doc.save(output_path, garbage=4, deflate=True)
    finally:
        doc.close()

    return output_path
