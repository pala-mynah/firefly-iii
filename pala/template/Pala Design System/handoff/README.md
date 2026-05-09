# Pala Design System

A personal visual identity for **Pala**, anchored on a deep blue (`#073363`) with a deep mint highlight (`#149966`), on a 60/30/10 color rhythm, with typography rooted in the moderncv tradition — a classical CV aesthetic translated into a complete brand system.

> **Origin:** Pala is the personal visual identity of the project owner. It draws its DNA from [moderncv](https://github.com/xdanaux/moderncv) (the LaTeX CV class by Xavier Danaux) — particularly the use of a single brand color as a typographic accent, generous whitespace, and a calm, document-like surface.

---

## Index

| File / Folder            | Purpose                                                                 |
|--------------------------|-------------------------------------------------------------------------|
| `colors_and_type.css`    | All foundations as CSS variables — colors, type, spacing, motion, etc.  |
| `assets/`                | Logos, wordmarks, and any imagery                                       |
| `fonts/`                 | Webfont fallbacks (loaded via Google Fonts in `colors_and_type.css`)    |
| `preview/`               | Design-system review cards (colors, type, spacing, components)          |
| `ui_kits/resume/`        | The CV / resume UI kit — Pala's primary surface                         |
| `ui_kits/personal_site/` | Personal site / writing UI kit                                          |
| `slides/`                | Slide deck templates (Title, Section, Content, Quote, End)              |
| `SKILL.md`               | Cross-compatible Agent Skill manifest                                   |

---

## Sources & references

- **Visual reference:** moderncv by xdanaux — https://github.com/xdanaux/moderncv
  - Specifically the *classic* and *casual* styles, which use a single brand color as a hairline / rule accent against typeset body copy, with a grey "hints column" for metadata.
  - Pala translates moderncv's three-color model (color0 = ink, color1 = brand, color2 = grey metadata) directly into CSS tokens (`--ink`, `--pala-blue`, `--ink-soft`).
- **Color anchor:** `#073363` — a deepened, midnight variant of moderncv's default blue, calibrated to feel deep without going black, and to let the mint highlight read clearly on top.
- **Typography:** Source Serif 4 + Source Sans 3 + JetBrains Mono. Source Serif/Sans are sibling families designed by Adobe's Paul D. Hunt; they pair tightly and have the same "typeset document" feel as moderncv's Latin Modern, while being free Google Fonts.

---

## Content Fundamentals — voice, tone, copy

Pala's voice is **precise, calm, and considered.** It reads like a well-typeset document, not a marketing site.

| Dimension      | Pala does                                                  | Pala doesn't                                |
|----------------|------------------------------------------------------------|---------------------------------------------|
| **Voice**      | First-person singular ("I designed…", "My work…")          | Royal "we" or corporate "Our team"          |
| **Address**    | Direct, occasional second-person ("You'll notice…")        | Salesy "you deserve" / "you'll love"        |
| **Tone**       | Understated, factual, lightly literary                     | Hype, exclamation marks, breathless         |
| **Casing**     | Sentence case for headings ("Selected work")               | Title Case Headings, ALL CAPS BANNERS       |
| **Numbers**    | Tabular, precise ("2021 — present", "12 projects")         | Vague ("years of experience", "many years") |
| **Emoji**      | None                                                       | Decorative or in-line emoji                 |
| **Punctuation**| Em-dashes, en-dashes for ranges, oxford comma              | Slashes, ellipses, multiple !!!             |

**Examples of Pala copy in the wild:**

- **Resume header:** "Designer & engineer. Currently building things at home." — *not* "Passionate creator helping brands tell their story."
- **Project blurb:** "A typesetting tool for personal correspondence. 2024." — *not* "🚀 An exciting new way to write letters!"
- **Empty state:** "Nothing here yet." — *not* "Oops! Looks like there's nothing here. Why not create something?"
- **Section header:** "Selected work, 2018–present" — *not* "MY AMAZING PROJECTS"
- **CTA / button:** "Read the case study", "Send a note" — *not* "Click here!", "Get started now"

**Date formatting:** Always year-first or month-year: `2024`, `Jun 2024`, `2021–2024`. Never `06/24/2024`.

---

## Visual Foundations

### Colors (60/30/10)

- **60% — Pure white (`#FFFFFF`)** as the dominant canvas. Pala feels like paper. A faint warm tint (`#FBFAF7`) is allowed for "letter" surfaces (resume page, longform writing) but should be used deliberately, not by default.
- **30% — Pala Blue (`#073363`)** — the brand color. Used for *all* headings, the signature horizontal rule, links, mastheads, and chart fills. Deep enough to anchor full-bleed brand zones (rails, hero panels) at high contrast, but not so dark it reads as black. Never as a background for body text.
- **10% — Mint (`#149966`)** — a deeper, more sophisticated mint than the typical bright variant. Sparing highlight only: a single "Now" tag, a featured-row tint, an active-nav dot, the italic letter inside the wordmark. On Pala Blue surfaces (where Pala Blue itself can't be used as a foreground), the brighter `--pala-mint-bright` (`#4ADEA4`) takes over as the link / italic / accent color. If mint appears more than 2–3 times on any one page, you've used too much.

**Mint contrast rules:**
- Mint on white — use the base `--pala-mint` (`#149966`) for fills and chips, `--pala-mint-ink` (`#0D6A47`) for any text or icon. The brighter mint is for blue surfaces only.
- Mint on Pala Blue — use `--pala-mint-bright` (`#4ADEA4`) so it reads from a distance.
- Pala Blue on Pala Blue is **never** allowed; mint is always the accent color when the surface is the brand color.

Neutrals are a cool gray scale (`--ink`, `--ink-muted`, `--ink-soft`, `--ink-faint`) — these directly map to moderncv's color0 (ink) and color2 (grey metadata).

### Backgrounds

- **Default:** flat white. No gradients. No patterns. No textures.
- **Letter surface:** the warm-tinted `--paper-warm` for documents that are meant to feel printed (resume, longform). Hairline border on three sides optional.
- **Dark inversions are rare.** When used (e.g. a single hero panel), the surface is `var(--pala-blue)` with white type, not a near-black.
- **Imagery, when used, is treated as documentary** — black-and-white preferred, or duotoned in Pala Blue. No bright/saturated photography.

### Typography

- **Source Serif 4** (display + headings) — calm, typographic, evokes typeset documents. Used for h1/h2/h3, the display name, and pull-quotes.
- **Source Sans 3** (body + UI) — humanist, legible, designed to pair with Source Serif. Used for paragraph text, captions, buttons, form labels.
- **JetBrains Mono** (data, code, dates) — used for tabular figures and any keyboard/code reference.
- **Hierarchy via size + weight, not color.** Headings are blue; body is ink. There is no "subhead in muted gray" pattern — it weakens the rhythm.

### Spacing & layout

- **4px grid.** All spacing tokens (`--sp-1` through `--sp-32`) are multiples of 4.
- **Generous outer margin.** Pala leaves lots of paper edge — typically 80–128px on desktop layouts.
- **Two-column patterns** with a narrow left "hints column" (~140–160px) carry directly from moderncv: dates, locations, micro-meta on the left; titles + descriptions on the right.
- **Alignment over ornament.** When in doubt, align to a grid line; don't add a divider.

### Borders & shadow

- **Hairlines (1px, `--rule`) over shadow** for almost all separation work.
- **The signature `.pala-rule`** — a 56×3px Pala Blue bar — appears under names, section starts, and is the brand's strongest visual hook.
- **Shadow is restrained.** `--shadow-sm` for floating elements; `--shadow-md` reserved for menus / popovers; `--shadow-lg` only for modals. No glows, no inner shadows.

### Corner radii

Restrained: 0, 2, 4, 6, 8 px. Pills only on tags/chips. Pala leans **squarer than rounder** because the system is typographic, not bubbly. No 16/24px super-rounded cards.

### Motion

- **Quick, functional, no bounce.** `--dur-fast: 120ms`, `--dur-base: 200ms`.
- Easing is a standard ease-out curve — never elastic or back/overshoot.
- **Hover = color shift** (link color → `--link-hover`), not transform.
- **Press = -1px translateY** at most, or no movement (preferred for buttons).
- Page transitions: simple opacity fades, 200ms.

### Hover & press states

- **Links:** underline gets stronger (color brightens to `--link-hover`).
- **Buttons (primary):** background shifts from `--pala-blue` to `--pala-blue-700`.
- **Buttons (secondary):** ink stays, background goes from transparent to `--surface-2`.
- **Cards / list items:** hairline border darkens from `--rule` to `--rule-strong`, no transform.
- **Press:** `:active` darkens one more step; we don't shrink elements.

### Transparency / blur

Pala does **not** use backdrop blur or glassmorphism. Surfaces are flat. The single exception: a 90% white overlay on imagery for legibility when type sits on a photo.

### Cards

- White or `--surface-2` background.
- Hairline border (`1px solid var(--rule)`).
- 4–6px radius.
- No shadow by default. `--shadow-sm` only when lifted (e.g. hover on a clickable card).
- Padding: 24–32px.
- A featured card may carry a 3px Pala Blue top border instead of a full border — directly inspired by moderncv's section rules.

---

## Iconography

**Pala's icon stance:** restrained, line-based, hairline. The brand barely uses icons — a CV doesn't need them, and most surfaces lean on type. When icons are required, the system uses **[Lucide](https://lucide.dev)** (loaded from CDN) at 1.5px stroke, sized in 16px / 20px / 24px steps.

Why Lucide:
- Open-source (ISC license), no attribution required.
- Hairline aesthetic matches Pala's typographic feel — same stroke weight as our hairline rules.
- Comes as inline SVG, recolorable to `currentColor`, so it inherits the surrounding text color (almost always `--pala-blue` or `--ink-soft`).

**Usage rules:**
- Icons inherit `currentColor` — never standalone-colored.
- Icons should be 1em-aligned with adjacent text via `vertical-align: -0.15em`.
- **Never decorative.** Every icon must replace a label or sit *with* one. We don't sprinkle icons next to headlines for vibes.
- **No emoji.** Ever. Pala uses unicode em-dashes, en-dashes, and the occasional `—` glyph as a typographic seasoning.
- **No icon font.** Lucide ships SVG; we use SVG. Mavrosym (moderncv's icon set) is LaTeX-only and not portable.

**Loading:**
```html
<!-- Lucide via CDN; renders [data-lucide="user"] etc. as SVG -->
<script src="https://unpkg.com/lucide@latest"></script>
<script>lucide.createIcons();</script>
```

**Substitution flag:** Pala does not have a custom icon set. Lucide is the chosen substitute. If you'd like a custom set later, we can commission or hand-draw a small library (~12 icons would cover the system).

---

## Logo

The Pala logo is a **wordmark** — "Pala" set in Source Serif 4 Semibold, ink color, with the signature 3px Pala Blue rule beneath it. The mark file lives at `assets/pala-wordmark.svg`. There is no separate mascot, monogram, or icon-only mark.

---

## Substitutions & flags (please review)

1. **Fonts:** Source Serif 4 + Source Sans 3 + JetBrains Mono are loaded from Google Fonts. No custom font files were provided. If you'd like different families (e.g. a paid display face), let me know.
2. **Icons:** Lucide is the chosen open-source set. Substituted in place of any custom set.
3. **Imagery:** None provided. The system documents how imagery *should* be treated (B&W or duotoned) but contains no actual photos.
4. **Mint highlight (`#1FC888`):** chosen during the *Blue forward* exploration to replace an earlier brass accent. Mint reads more contemporary against the deepened Pala Blue and stays legible on dark blue surfaces (where brass turned muddy). The earlier brass tokens (`--pala-brass*`) remain as deprecated aliases pointing at mint, so any older mockup that still references them keeps working.

---
