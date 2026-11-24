"""Excel parsing and validation service.

Supports multi-sheet workbooks; each sheet maps to an attestation type.

Public API
----------
parse_excel(file_path)                           -> dict
validate_rows(rows, required_columns, ...)       -> ExcelValidationResult
dispatch_rows_by_type(rows, type_column)         -> dict[str, list[dict]]
"""
from __future__ import annotations

import re
from typing import Any

import pandas as pd

from app.models.schemas import ExcelValidationResult, ValidationError
from app.utils.validators import EMAIL_REGEX, find_duplicate_emails, is_valid_email

# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def parse_excel(file_path: str) -> dict[str, Any]:
    """Parse all sheets of an Excel workbook.

    Parameters
    ----------
    file_path:
        Absolute or relative path to the ``.xlsx`` / ``.xls`` file.

    Returns
    -------
    dict
        ``{sheets: {sheet_name: {columns, rows, row_count}}, sheet_names: [str]}``

    Notes
    -----
    - NaN values are replaced with ``None`` for clean JSON serialisation.
    - Column names are stripped of leading/trailing whitespace.
    - Row index (1-based, matching Excel row numbers starting from 2) is
      injected as ``"_row_index"`` for error reporting.
    """
    all_sheets: dict[str, pd.DataFrame] = pd.read_excel(
        file_path, sheet_name=None, dtype=str
    )
    result: dict[str, Any] = {}

    for sheet_name, df in all_sheets.items():
        # Normalise column names
        df.columns = [str(c).strip() for c in df.columns]
        # Replace NaN → None
        df = df.where(pd.notna(df), None)
        # Drop completely empty rows
        df = df.dropna(how="all")

        rows: list[dict[str, Any]] = df.to_dict(orient="records")
        # Inject 1-based Excel row index (header is row 1, data starts at row 2)
        for i, row in enumerate(rows):
            row["_row_index"] = i + 2  # Excel row number

        result[sheet_name] = {
            "columns": list(df.columns),
            "rows": rows,
            "row_count": len(rows),
        }

    return {"sheets": result, "sheet_names": list(result.keys())}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_rows(
    rows: list[dict[str, Any]],
    required_columns: list[str],
    email_column: str = "Email",
) -> ExcelValidationResult:
    """Validate a list of parsed rows against basic rules.

    Rules applied
    -------------
    1. ``email_column`` must exist in every row.
    2. Each email must pass the basic regex check.
    3. Duplicate emails are reported as *warnings* (not blocking errors).
    4. Required columns must not be empty.

    Parameters
    ----------
    rows:
        List of row dicts as returned by :func:`parse_excel`.
    required_columns:
        Column names that must be non-empty.
    email_column:
        Name of the column that holds the recipient e-mail address.

    Returns
    -------
    ExcelValidationResult
        Contains ``valid_rows`` count and ``errors`` / ``warnings`` lists.
    """
    errors: list[ValidationError] = []
    warnings: list[ValidationError] = []
    emails_seen: list[str] = []
    valid_count = 0

    for row in rows:
        row_idx: int = int(row.get("_row_index", 0))
        row_has_error = False

        # --- Email column existence ---
        if email_column not in row:
            errors.append(
                ValidationError(
                    row_index=row_idx,
                    field=email_column,
                    message=f"Column '{email_column}' not found in this sheet",
                )
            )
            row_has_error = True
        else:
            raw_email = row.get(email_column)
            email_str = str(raw_email).strip() if raw_email is not None else ""

            if not email_str:
                errors.append(
                    ValidationError(
                        row_index=row_idx,
                        field=email_column,
                        message="Email address is empty",
                    )
                )
                row_has_error = True
            elif not is_valid_email(email_str):
                errors.append(
                    ValidationError(
                        row_index=row_idx,
                        field=email_column,
                        message=f"Invalid email format: '{email_str}'",
                    )
                )
                row_has_error = True
            else:
                emails_seen.append(email_str.lower())

        # --- Required columns not empty ---
        for col in required_columns:
            if col == email_column:
                continue  # already checked
            val = row.get(col)
            if val is None or str(val).strip() == "":
                errors.append(
                    ValidationError(
                        row_index=row_idx,
                        field=col,
                        message=f"Required field '{col}' is empty",
                    )
                )
                row_has_error = True

        if not row_has_error:
            valid_count += 1

    # --- Duplicate emails (warnings only) ---
    duplicates = find_duplicate_emails(emails_seen)
    if duplicates:
        for dup_email in duplicates:
            # Find all rows with this email
            for row in rows:
                raw_email = row.get(email_column)
                if raw_email and str(raw_email).strip().lower() == dup_email:
                    warnings.append(
                        ValidationError(
                            row_index=int(row.get("_row_index", 0)),
                            field=email_column,
                            message=f"Duplicate email address: '{dup_email}'",
                        )
                    )

    return ExcelValidationResult(
        valid_rows=valid_count,
        errors=errors,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Type dispatch
# ---------------------------------------------------------------------------


def dispatch_rows_by_type(
    rows: list[dict[str, Any]],
    type_column: str = "type",
) -> dict[str, list[dict[str, Any]]]:
    """Group rows by a type discriminator column.

    Parameters
    ----------
    rows:
        Flat list of row dicts.
    type_column:
        Column name used to partition rows into groups.
        If the column is absent in a row, that row goes to ``"default"``.

    Returns
    -------
    dict[str, list[dict]]
        ``{type_name: [rows]}``  — ``"default"`` when column is missing.
    """
    result: dict[str, list[dict[str, Any]]] = {}

    if not rows:
        return {"default": []}

    has_type_col = type_column in (rows[0] if rows else {})

    if not has_type_col:
        return {"default": rows}

    for row in rows:
        type_val = row.get(type_column)
        key = str(type_val).strip() if type_val is not None else "default"
        result.setdefault(key, []).append(row)

    return result
