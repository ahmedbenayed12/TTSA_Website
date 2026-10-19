#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a WeasyPrint PDF from a Jinja HTML template and JSON data.")
    parser.add_argument("--template", required=True, help="Path to .html Jinja template")
    parser.add_argument("--data", required=True, help="Path to JSON data file")
    parser.add_argument("--out", required=True, help="Output PDF path")
    parser.add_argument("--html-out", help="Optional rendered HTML path for browser preview")
    args = parser.parse_args()

    template_path = Path(args.template).resolve()
    data_path = Path(args.data).resolve()
    out_path = Path(args.out).resolve()

    data = json.loads(data_path.read_text(encoding="utf-8"))
    env = Environment(
        loader=FileSystemLoader(str(template_path.parent)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    html = env.get_template(template_path.name).render(**data)

    if args.html_out:
        html_out = Path(args.html_out).resolve()
        html_out.parent.mkdir(parents=True, exist_ok=True)
        html_out.write_text(html, encoding="utf-8")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    HTML(string=html, base_url=str(template_path.parent)).write_pdf(str(out_path))
    print(out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
