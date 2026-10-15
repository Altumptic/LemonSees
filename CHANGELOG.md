# Changelog

## v3.0.0 — LemonSees by Altumptic

### Brand & design
- New identity: **LemonSees by Altumptic**, new lemon-eye logo, icons regenerated for all platforms.
- Anthropic-inspired design system: warm **Ivory** (default) and **Graphite** themes, Source Serif 4 display type,
  DM Sans UI, JetBrains Mono for data — all self-hosted (no network fonts).
- Comfortable UI scale by default (110 %) with presets up to 140 %.

### Product
- **Functional top bar**: clickable breadcrumbs with menus, global host switcher, alerts inbox, quick create, live status,
  theme toggle, app menu (language, demo, shortcuts, about).
- **Command palette** (Ctrl K) and `g`-shortcuts; shortcuts reference (`?`).
- **SOC analytics** page: alert volume by severity, MTTA/MTTR, activity heatmap, affected hosts, analyst workload.
- **MITRE ATT&CK** matrix with automatic technique mapping and drill-down.
- **File integrity monitoring (FIM)** over SSH with baselines; drift auto-creates incidents.
- Charts everywhere: overview, incidents, compliance by framework, vulnerabilities radar, hardening radar,
  connections, persistence, containers, endpoint trends, audit activity; dotted world attack map.
- **Demo mode** with realistic data (localised).

### Settings that actually work
- Auto-refresh for scan pages, desktop notifications for new critical incidents, 24-hour clock, sidebar default.
- SOC engine: threat-sweep interval, audit retention, downtime notifications, auto-incidents.
- Backup export / settings import; About section with security contacts.

### Platforms & security
- **Web mode** with token authentication (`LEMONSEES_TOKEN`), refuses to bind publicly without a token; security headers.
- **Portable Windows `.exe`** (+ zip) and **Linux AppImage / tar.gz**; portable data folder next to the executable.
- Dockerfile, CI and tagged release workflow.
- `/.well-known/security.txt` and `SECURITY.md` with Altumptic PGP key.

### Performance
- Lazy-loaded pages and demo engine, idle prefetch, vendor chunk splitting, de-duplicated live state updates.
