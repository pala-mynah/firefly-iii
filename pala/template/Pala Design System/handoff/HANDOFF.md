# Pala — Handoff for Claude Code

This bundle contains everything needed to build new HTML surfaces in the
**Pala** visual identity. Drop the whole folder into your CC working directory.

## Files

| File | Role |
|---|---|
| `tokens.css` | Source of truth — colors, type, spacing, radii, shadows. Import this first. |
| `components.css` | Vocabulary — `.pala-card`, `.pala-rail`, `.pala-stat`, `.pala-pill`, `.pala-table`, `.pala-btn`, `.pala-input`. Imports tokens. |
| `landing.html` | Reference rendering — Home Assistant landing page using tokens + components. The dark-mode contract. |
| `preview.html` | Standalone reference (tokens inlined) — easier to open without the import chain. |
| `cv-example.html` | Paper-mode reference — the CV. Shows the same identity on a light surface. |
| `README.md` | System overview — 60/30/10, voice, type rules, the rail device. |

## Contract — read before building

- **Surfaces** — 60 % paper-cool / paper, 30 % Pala Blue (`#073363`) for rails
  and identity moments, 10 % mint (`#149966` / `#6CC59A`) for accent —
  interactive states, italic phrases, deltas, focus rings.
- **Type** — Crimson Pro everywhere (display, body, tag). Italics carry
  character moments ("*at rest*", "*designer & engineer*"). Monospace only
  for data (timestamps, IPs, ports, IDs).
- **The rail** (`.pala-rail`) is the signature device — Pala-Blue background,
  mint stripe top-right, mint italic sub-line, mint border-left on active item.
  Carry it through every primary surface.
- **No** emoji, **no** gradient backgrounds, **no** rounded-card-with-left-
  border-accent tropes.
- **Reuse** the `.pala-*` classes — do not introduce a new naming scheme.

## Prompt template

> Build [a page for X]. Use the Pala design system in this folder. Inherit
> `tokens.css` and `components.css`; match the vocabulary in `landing.html`.
> The page must:
> 1. Open with a Pala-blue rail and mint stripe.
> 2. Use Crimson Pro for everything; italics for character moments.
> 3. Stay within the 60/30/10 rhythm — paper surfaces dominant, blue
>    sections present, mint as accent only.
> 4. Reuse `.pala-card`, `.pala-stat`, `.pala-pill`, `.pala-table`, etc.
>    Do not invent new component names.
