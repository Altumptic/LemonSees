# LemonSees — Design Spec

Single source of truth for the UI. Reference feel: **BetterStack** (polished dark SaaS,
data-dense, calm). Goal: professional and human — **no generic "AI" look** (no purple
gradients, no dot-matrix novelty fonts, no lonely centered empty states, no glassmorphism).

Tokens live in `src/styles.css` (`:root` = dark, `[data-theme="light"]` = light). Two themes only.

## 1. Color

Dark (default):
- Backdrop `--ink #08080a`, page `--background #0a0a0b` — deep charcoal, **not** pure black.
- Surfaces `--surface #141417`, raised `--surface-raised #1c1c20` — layered depth.
- Text `--foreground #ededee`, secondary `--muted-foreground #9a9aa3`, display `#ffffff`.
- Hairlines `--hairline #212124`, strong `--hairline-strong #323238`.
- Accent (single signal): `--primary #e5484d` confident red — active nav, KPIs, CTAs.
- Semantics: success `#30a46c`, warning `#e2a336`, danger `#e5484d`, interactive `#6e8bff`.

Light mirrors the same roles on warm off-white (`#fafafa` / `#ffffff`).

Rule: color carries meaning. Neutral tone = muted; only status/risk uses green/amber/red.

## 2. Typography

- Sans / display: **Space Grotesk** (distinctive, not Inter). Numbers use `.doto`
  = Space Grotesk + `tabular-nums` (dot-matrix Doto font removed).
- Mono: **Space Mono** — code, log lines, technical `eyebrow` labels only.
- Scale: page title 23–26 / section 15 / body 13–14 / label 11. Tight tracking on headings.

## 3. Components (`src/components/ui.tsx`)

- `Panel` / `.glass`: surface + 1px hairline + soft `--shadow-card`, radius 12px.
- `PageHeader`: red tick + eyebrow + title + short lede. One per page (no duplicate title bar).
- `Kpi` / `StatCard`: tone bar on top, big tabular number, hover raises border.
- `EmptyState`: solid card, tinted rounded icon badge, title, hint, **primary CTA** — never a bare icon.
- `PrimaryButton`: light fill, radius 8px, subtle shadow. `Pill`/`Tag`: soft tinted status chips.
- Charts: `AreaChart` (gradient fill), `StatusBars`, `Histogram`, `BarList`, `MapPlot`, `ScoreRing`.

## 4. Layout

- App shell: left nav (sections + nested Cloudflare-style subsections) + thin top bar (status only).
- Main content centered, `max-w-[1600px]`, `px-6 lg:px-10`. Card grids gap 16–24.

## 5. Motion

- 150–200ms ease. `fade-in` on route change; `live-dot` pulse for active status. No slides/bounce.
- Respects `data-motion="reduced"`.

## 6. Depth

Depth from surface elevation + soft shadows + a faint top brand glow (`.app-bg::before`),
not blur or heavy drop-shadows. Glow toggle in Settings.

## 7. Do / Don't

- Do: tabular numerals, real data density, semantic color, subtle hover, one clear title per page.
- Don't: pure-black voids, novelty fonts, everything-uppercase, purple AI gradients, empty hero cards.

## 8. Responsive

Sidebar `lg:` and up; below that content is full-width. Grids collapse 3→1 on small screens.
Tables and charts scroll inside their own container; the page never scrolls horizontally.

## 9. Accessibility

Text/background contrast ≥ WCAG AA on both themes. Status never encoded by color alone
(dot + label). Focus ring `--ring`. Hit targets ≥ 28px.
