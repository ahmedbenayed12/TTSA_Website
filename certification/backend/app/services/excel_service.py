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
# Column Resolution & Normalization
# ---------------------------------------------------------------------------

def normalize_col_name(name: str) -> str:
    """Normalize a column name by removing all whitespace, hyphens, underscores and lowercasing."""
    return re.sub(r"[\s_\-]+", "", str(name)).lower()


EMAIL_ALIASES = {"email", "mail", "courriel", "adresseemail", "e-mail", "courrelec", "emailaddress"}
NAME_ALIASES = {"participantname", "participant", "author", "nom", "name", "fullname", "nometprenom", "nomprenom", "nomduparticipant"}
ROLE_ALIASES = {"roledescription", "role", "description", "qualite", "fonction"}
TITLE_ALIASES = {"presentationtitle", "title", "titre", "titredelapresentation", "sujet"}


def resolve_column(columns: Any, target_name: str) -> str | None:
    """Find matching column name in sheet columns, ignoring case, spaces, hyphens, underscores and checking aliases."""
    if not columns or not target_name:
        return None
    cols = list(columns)

    # 1. Exact match
    if target_name in cols:
        return target_name

    norm_target = normalize_col_name(target_name)

    # 2. Normalized match (e.g. 'E-MAIL' matches 'email', 'PARTICIPANT NAME' matches 'participant_name')
    for c in cols:
        if str(c).startswith("_"):
            continue
        if normalize_col_name(c) == norm_target:
            return str(c)

    # 3. Alias matches
    if norm_target in EMAIL_ALIASES:
        for c in cols:
            if str(c).startswith("_"):
                continue
            nc = normalize_col_name(c)
            if nc in EMAIL_ALIASES or "email" in nc or "mail" in nc:
                return str(c)

    if norm_target in NAME_ALIASES:
        for c in cols:
            if str(c).startswith("_"):
                continue
            nc = normalize_col_name(c)
            if nc in NAME_ALIASES or "participant" in nc or "author" in nc:
                return str(c)

    if norm_target in ROLE_ALIASES:
        for c in cols:
            if str(c).startswith("_"):
                continue
            nc = normalize_col_name(c)
            if nc in ROLE_ALIASES or "role" in nc:
                return str(c)

    if norm_target in TITLE_ALIASES:
        for c in cols:
            if str(c).startswith("_"):
                continue
            nc = normalize_col_name(c)
            if nc in TITLE_ALIASES or "title" in nc or "titre" in nc:
                return str(c)

    return None


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_rows(
    rows: list[dict[str, Any]],
    required_columns: list[str],
    email_column: str = "Email",
) -> ExcelValidationResult:
    """Validate a list of parsed rows against basic rules with flexible column resolution.

    Rules applied
    -------------
    1. ``email_column`` (or normalized equivalent) must exist in every row.
    2. Each email must pass the basic regex check.
    3. Duplicate emails are reported as *warnings* (not blocking errors).
    4. Required columns must not be empty.
    """
    errors: list[ValidationError] = []
    warnings: list[ValidationError] = []
    emails_seen: list[str] = []
    valid_count = 0

    if not rows:
        return ExcelValidationResult(valid_rows=0, errors=[], warnings=[])

    # Resolve actual column names present in the dataset
    sample_row = rows[0]
    actual_email_col = resolve_column(sample_row.keys(), email_column) or email_column

    # Map required columns to their actual sheet column names
    resolved_req_map: dict[str, str] = {}
    for col in required_columns:
        resolved_req_map[col] = resolve_column(sample_row.keys(), col) or col

    for row in rows:
        row_idx: int = int(row.get("_row_index", 0))
        row_has_error = False

        # --- Email column existence ---
        if actual_email_col not in row:
            errors.append(
                ValidationError(
                    row_index=row_idx,
                    field=email_column,
                    message=f"Column '{email_column}' (or '{actual_email_col}') not found in this sheet",
                )
            )
            row_has_error = True
        else:
            raw_email = row.get(actual_email_col)
            email_str = str(raw_email).strip() if raw_email is not None else ""

            if not email_str:
                errors.append(
                    ValidationError(
                        row_index=row_idx,
                        field=actual_email_col,
                        message="Email address is empty",
                    )
                )
                row_has_error = True
            elif not is_valid_email(email_str):
                errors.append(
                    ValidationError(
                        row_index=row_idx,
                        field=actual_email_col,
                        message=f"Invalid email format: '{email_str}'",
                    )
                )
                row_has_error = True
            else:
                emails_seen.append(email_str.lower())

        # --- Required columns not empty ---
        for orig_col, act_col in resolved_req_map.items():
            if act_col == actual_email_col:
                continue  # already checked
            if act_col not in row:
                errors.append(
                    ValidationError(
                        row_index=row_idx,
                        field=orig_col,
                        message=f"Required column '{orig_col}' not found in this sheet",
                    )
                )
                row_has_error = True
                continue

            val = row.get(act_col)
            if val is None or str(val).strip() == "":
                errors.append(
                    ValidationError(
                        row_index=row_idx,
                        field=act_col,
                        message=f"Required field '{act_col}' is empty",
                    )
                )
                row_has_error = True

        if not row_has_error:
            valid_count += 1

    # --- Duplicate emails (warnings only) ---
    duplicates = find_duplicate_emails(emails_seen)
    if duplicates:
        for dup_email in duplicates:
            for row in rows:
                raw_email = row.get(actual_email_col)
                if raw_email and str(raw_email).strip().lower() == dup_email:
                    warnings.append(
                        ValidationError(
                            row_index=int(row.get("_row_index", 0)),
                            field=actual_email_col,
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
