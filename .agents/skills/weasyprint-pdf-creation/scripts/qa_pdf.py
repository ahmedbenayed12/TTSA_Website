#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

from pypdf import PdfReader


def run(cmd: list[str]) -> tuple[int, str]:
    proc = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return proc.returncode, proc.stdout


def main() -> int:
    parser = argparse.ArgumentParser(description="Lightweight PDF QA: page count, page size via pdfinfo, and text smoke checks.")
    parser.add_argument("pdf", help="PDF file to inspect")
    parser.add_argument("--expect-pages", type=int, help="Expected page count")
    parser.add_argument("--must-contain", action="append", default=[], help="Text that must appear in extracted PDF text; repeatable")
    args = parser.parse_args()

    pdf = Path(args.pdf)
    if not pdf.exists() or pdf.stat().st_size == 0:
        print(f"FAIL: missing or empty PDF: {pdf}", file=sys.stderr)
        return 1

    reader = PdfReader(str(pdf))
    pages = len(reader.pages)
    print(f"pages: {pages}")
    print(f"bytes: {pdf.stat().st_size}")

    if args.expect_pages is not None and pages != args.expect_pages:
        print(f"FAIL: expected {args.expect_pages} page(s), got {pages}", file=sys.stderr)
        return 1

    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    for needle in args.must_contain:
        if needle not in text:
            print(f"FAIL: missing text: {needle!r}", file=sys.stderr)
            return 1

    if shutil.which("pdfinfo"):
        code, output = run(["pdfinfo", str(pdf)])
        if code == 0:
            for line in output.splitlines():
                if re.match(r"^(Pages|Page size|PDF version):", line):
                    print(line)

    print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
