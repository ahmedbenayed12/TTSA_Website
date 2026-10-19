# Font Guidance

Fonts change PDF layout. A template that fits with one font may overflow with another.

## Practical default

Start with system UI fonts for development:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
```

For reproducible production PDFs, bundle or install the exact fonts used by the template.

## Rules

- Prefer open fonts with permissive licenses.
- Keep font files small and intentional.
- Test PDFs on the same environment that generates production files.
- If brand fonts are unavailable, define an explicit fallback stack.
- Re-run QA after changing fonts.

## Good free font sources

- Google Fonts
- Fontsource packages
- system packages such as `fonts-dejavu-core` on Debian/Ubuntu

Do not rely on macOS-only or designer-machine-only fonts unless the production renderer also has them.
