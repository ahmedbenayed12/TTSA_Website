#!/usr/bin/env python3
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = [
    ("invoice", "Invoice", "templates/invoice.html", "data/sample-invoice.json", ["Total due", "PAYMENT"]),
    ("report", "Report", "templates/report.html", "data/sample-report.json", ["Tiny Launch Report", "Highlights"]),
    ("proposal", "Proposal", "templates/proposal.html", "data/sample-proposal.json", ["PDF Template System", "DELIVERABLES"]),
    ("one-page-brief", "One-page brief", "templates/one-page-brief.html", "data/sample-one-page-brief.json", ["Should we replace", "RECOMMENDED NEXT ACTION"]),
    ("receipt", "Receipt", "templates/receipt.html", "data/sample-receipt.json", ["RECEIPT", "PAID"]),
    ("statement", "Statement", "templates/statement.html", "data/sample-statement.json", ["Client Account", "Opening balance"]),
]


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> int:
    out = ROOT / "examples"
    out.mkdir(exist_ok=True)
    cards = []
    for slug, title, template, data, needles in EXAMPLES:
        pdf = out / f"{slug}.pdf"
        html = out / f"{slug}.html"
        png = out / f"{slug}.png"
        run(["python", "scripts/render_pdf.py", "--template", template, "--data", data, "--out", str(pdf), "--html-out", str(html)])
        qa_cmd = ["python", "scripts/qa_pdf.py", str(pdf), "--expect-pages", "1"]
        for needle in needles:
            qa_cmd += ["--must-contain", needle]
        run(qa_cmd)
        if subprocess.run(["bash", "-lc", "command -v pdftoppm >/dev/null"], cwd=ROOT).returncode == 0:
            run(["pdftoppm", "-png", "-singlefile", "-r", "144", str(pdf), str(png.with_suffix(""))])
        cards.append((slug, title))

    index = ["<!doctype html><html><head><meta charset='utf-8'><title>WeasyPrint PDF Examples</title>", "<style>body{margin:0;background:#fffaf0;color:#201713;font-family:Inter,system-ui,sans-serif;padding:32px}h1{font-family:Georgia,serif;font-size:52px;letter-spacing:-.05em;line-height:.9}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}.card{background:white;border:1px solid #eadfce;border-radius:22px;padding:14px;text-decoration:none;color:inherit}.card img{width:100%;border-radius:14px;border:1px solid #eadfce}.links{display:flex;gap:10px}.links a{color:#201713}</style></head><body>", "<h1>WeasyPrint PDF Examples</h1><p>Rendered HTML/CSS templates with PDFs and thumbnails.</p><section class='grid'>"]
    for slug, title in cards:
        index.append(f"<article class='card'><img src='{slug}.png' alt='{title} preview'><h2>{title}</h2><p class='links'><a href='{slug}.pdf'>PDF</a><a href='{slug}.html'>HTML</a></p></article>")
    index.append("</section></body></html>")
    (out / "index.html").write_text("\n".join(index), encoding="utf-8")
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
