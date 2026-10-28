# Changelog

## v3.1.0 — Privacy, integrations, agents

### Privacy & encryption
- Route SSH and all outbound requests through **Tor / SOCKS5 / HTTP CONNECT** proxies (global or per host), **bastion / jump hosts**.
- **Kill switch** (no direct fallback), **remote DNS** through the proxy, **egress IP check**.
- **Host-key pinning** (trust on first use, blocks changed keys), modern-only SSH algorithms.
- **Secrets encrypted at rest** (AES-256-GCM): SSH/DB/proxy passwords, passphrases, integration tokens; automatic migration of
  plaintext config. Key from OS keychain (Electron safeStorage), `LEMONSEES_MASTER_KEY`, or a 0600 key file.
- **HTTPS** for web mode (`LEMONSEES_TLS=self` or own certificate), HSTS.

### Integrations (optional)
- Outbound: Datadog (Events + Logs), Slack, Microsoft Teams, Telegram, HMAC-signed webhooks, Splunk HEC, Elastic/OpenSearch,
  Syslog CEF (UDP/TCP/TLS), PagerDuty — per-integration severity and event filters, test button, delivery status.
- Inbound: **Wazuh** manager API agents and indexer alerts; level 12+ alerts become incidents. New **Console → Wazuh** page.

### Detection & agents
- **Custom detection rules** (regex, threshold, window, MITRE technique, host scope) with templates and live test.
- **Optional LemonSees agent**: read-only POSIX sh, no root, pull or push mode with per-agent token; deploy/sync/remove UI.

### Analytics & UX
- Sankey incident flow, response SLA gauge, handling funnel, activity calendar, treemaps (threat countries, Wazuh rules).
- Customisable overview widgets; host tags; demo data for every new module; English translations.

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
