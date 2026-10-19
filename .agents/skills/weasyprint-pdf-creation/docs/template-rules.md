# Template Design Rules

## Default stance

Design for A4 first. Keep the source as semantic HTML plus print CSS. Avoid JavaScript. Keep data separate from layout.

## Layout rules

1. Reserve space for decorative elements. Do not let stamps, blobs, or badges float over real content.
2. Use fixed table columns for invoices, statements, and money-heavy documents.
3. Use `font-variant-numeric: tabular-nums` for totals, balances, IDs, and dates.
4. Add wrapping rules for long strings:

```css
.long-value { overflow-wrap: anywhere; }
.amount { white-space: nowrap; text-align: right; }
```

5. Prefer `mm` for page canvas and important print spacing.
6. Keep footers either in normal flow or absolutely positioned with reserved bottom space.
7. Test with ugly data, not just perfect marketing-copy samples.

## CSS rules

Prefer boring print-safe CSS:

- grid
- flexbox
- tables for tabular data
- border radius
- solid fills
- local/system fonts

Verify carefully before relying on:

- shadows
- filters
- blend modes
- complex clipping
- browser-only CSS

## Template types

- **Invoice:** fixed money columns, wrap-safe payment details, no overlapping stamp.
- **Report:** compact metrics, chart-like bars, one-page summary.
- **Proposal:** phases, deliverables, assumptions, price/timeline box.
- **One-page brief:** decision, signals, risks, recommendation.
- **Receipt:** A5 or compact page, clear paid status, simple item rows.
- **Statement:** ledger table, aligned balances, long reference wrapping.
