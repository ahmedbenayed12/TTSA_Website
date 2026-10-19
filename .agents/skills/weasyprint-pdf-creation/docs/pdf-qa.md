# PDF QA Checklist

Use this after every template or CSS change. Pretty PDFs are not done until they survive ugly data and extraction checks.

## 1. Render and capture warnings

```bash
python scripts/render_pdf.py   --template templates/invoice.html   --data data/sample-invoice.json   --out outputs/invoice.pdf   --html-out outputs/invoice.html 2> outputs/weasyprint.log
```

Treat unexpected WeasyPrint warnings as bugs. Unsupported CSS often creates layout drift without crashing.

## 2. Check page count and paper size

```bash
python scripts/qa_pdf.py outputs/invoice.pdf   --expect-pages 1   --must-contain 'Total due'
```

If `pdfinfo` is installed, the QA helper also prints page size and PDF version.

## 3. Smoke-test extracted text

PDFs are often searched, copied, archived, or parsed later. Make sure key business text appears in extraction:

- invoice number
- total due
- payment method
- client name
- dates
- critical references

Do not overfit exact whitespace; PDF extraction can join visual words.

## 4. Test ugly values

Use data that tries to break the layout:

- long IBANs and bank references
- long emails
- long client names
- large currency values
- 6+ line items
- mixed short and long descriptions

## 5. Inspect visual failure zones

Focus on:

- totals table
- payment boxes
- stamps/badges
- footers
- page breaks
- table rows near the bottom
- decorative absolute-positioned shapes

## 6. Generate thumbnails for review

```bash
pdftoppm -png -singlefile -r 144 outputs/invoice.pdf examples/invoice
```

A thumbnail in the README catches obvious layout regressions faster than asking people to open every PDF.
