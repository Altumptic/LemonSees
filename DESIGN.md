# LemonSees by Altumptic — Design Spec

Single source of truth for the UI. Reference feel: **Anthropic / Claude** — warm ivory paper,
editorial serif headings, calm clay accent, generous spacing. Breadth of modules like **Wazuh**,
but quiet and readable for long SOC shifts. No neon, no purple gradients, no ALL-CAPS mono labels.

Tokens live in `src/styles.css` (`:root` = Ivory light, default; `[data-theme="dark"]` = Graphite).

## 1. Color

Ivory (default):
- Shell/sidebar `--ink #f0eee6`, page `--background #faf9f5`, cards `--surface #fffefb`, nested `--surface-raised #f5f4ee`.
- Text `--foreground #1f1e1d`, secondary `--muted-foreground #6b6963`, display `#141413`.
- Hairlines `--hairline #e8e5da`, strong `--hairline-strong #d6d2c4`.
- Accent (single signal): clay `--primary #c15f3c` — active nav, primary buttons, eyebrows.
- Semantics: success `#4f7a3a`, warning `#a8741a`, danger `#b4322a`, info `#56688c`.

Graphite mirrors the same roles on warm charcoal (`#1f1e1c` / `#262624`) with clay `#d97757`.

Rule: color carries meaning. Neutral is warm grey; only status/risk uses green/amber/red.

## 2. Typography (self-hosted via @fontsource — works offline in Electron)

- UI sans: **DM Sans** (variable). Body 14.5–15.5px.
- Display serif: **Source Serif 4** — page titles (32–38px), modal titles, KPI numbers (`.doto`), empty states.
- Mono: **JetBrains Mono** — code, logs, IPs, terminal only. Never for labels.
- Labels (`.eyebrow`) are sentence case, 12.5px, medium weight.

## 3. Scale

Default UI scale is **110 %** (“Comfortable”), presets 95 / 110 / 125 / 140 in Settings.
Scale is CSS `zoom`; shell heights use `.h-app` / `.min-h-app` (`100dvh / --zoom`) so nothing overflows.
Hit targets ≥ 36px (icon buttons 36, inputs/buttons ~40).

## 4. Components (`src/components/ui.tsx`)

- `Panel` / `.glass`: surface + 1px hairline + soft shadow, radius 16px, padding 24px.
- `PageHeader`: clay eyebrow + serif title + lede. One per page.
- `Kpi` / `StatCard`: tinted icon badge, tone dot, serif number.
- `Pill` / badges: soft tinted rounded-full chips, sentence case.
- `PrimaryButton`: clay fill; `GhostButton`: surface + strong hairline.
- `Modal` / `Drawer`: warm scrim, Esc to close. `PageSkeleton` while a page chunk loads.
- `CommandPalette` (Ctrl/⌘+K): jump to any module/tab or run an action.

## 5. Layout

- Sidebar 272px (collapsible to 76px rail, Ctrl/⌘+B, remembered). Below `lg` it becomes a slide-in drawer.
- Top bar (`src/components/Topbar.tsx`): clickable breadcrumbs with menus, global host switcher, alerts inbox, quick create (+), live/demo status, search, theme, app menu.
- Sub-tabs show in the sidebar when expanded, as a horizontal tab strip when collapsed or on narrow screens.
- Content centered, `max-w-[1680px]`, gutters 16 / 24 / 40px.

## 6. Charts (`src/components/charts.tsx`)

Dependency-free SVG: `LineChart` (multi-series, crosshair tooltip), `StackedBars`, `Donut` (hover legend),
`Heatmap`, `Radar`, `MiniTrend` (inside `Kpi`); `charts2.tsx`: `Sankey`, `Treemap`, `Funnel`, `CalendarHeatmap`, `Gauge`. Severity colours come from `SEV_COLOR`, categorical
series from `--c1…--c6` (theme-aware). Rendered at real pixel width for crisp labels.

## 7. Brand

Mark: lemon-eye on clay (`public/logo.svg` — single source; `npm run assets` regenerates PNGs).
Wordmark: “LemonSees” in serif + “by Altumptic”. Never recolour the mark outside the clay/ivory pair.

## 8. Performance

- Every page is a lazy chunk; nav hover prefetches, and all chunks warm up on idle after start.
- Heavy libs split (`xterm`, `sql.js`, `icons`, `react`).
- Live state via `useSyncExternalStore`; identical WebSocket frames are dropped (no re-render).
- Stable translator function per language.

## 9. Motion

160–220ms ease-out fades; `live-dot` pulse for live status. Respects `data-motion="reduced"`.

## 10. Accessibility

Text contrast ≥ WCAG AA on both themes. Status never by color alone (dot + label).
Visible `:focus-visible` ring in clay. Dialogs have `role="dialog"` + Esc.
