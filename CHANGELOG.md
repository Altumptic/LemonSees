# Changelog

## v3.2.0 — Rust core, hardening, AI-first docs

### Added
- **Installers:** Windows NSIS installer (`-setup.exe`) next to the portable `.exe` and zip; Linux `.deb` next to AppImage and tar.gz. Release artifacts are checksummed, signed with Sigstore (keyless, Altumptic GitHub identity) and carry build-provenance attestations. They are **not** Authenticode/GPG-signed (no code-signing certificate yet), so Windows SmartScreen may warn — verify with `docs/security/VERIFY.md`.
- **macOS:** `.dmg` and `.zip` for Apple Silicon and Intel (unsigned and not notarized — open via right-click → Open, or verify checksums/Sigstore first).
- UI: suspicious logins and 48 h activity chart on Threats; `group_by` in rules.
- Fuzz targets (`core/fuzz`, cargo-fuzz) run in CI.
- **Rust → WebAssembly core** (`core/`) for the hot paths: SSH auth-log analysis (IPv4/IPv6, ISO/BSD/CLF timestamps, "success after brute force" suspects, hourly histogram), custom rules in a linear-time regex engine (no ReDoS; `group_by` ip/user; trailing windows by the server clock) and FIM diff with critical paths. Optional: without the `.wasm` the engine falls back to the previous paths. `LEMONSEES_CORE=off` disables it; `GET /api/info` reports backend, version and wasm sha256.
- Tamper-evident audit log (hash chain) and `GET /api/audit/verify`.
- `AGENTS.md`, `docs/ARCHITECTURE.md`, generated `docs/ai/REPO_MAP.md`, `docs/ROADMAP.md`, `docs/PERFORMANCE.md`; `npm run build:core | bench | docs:map`.
- CI: Rust job (fmt, clippy, tests, wasm, `cargo audit`), CodeQL.

### Security
- Argument injection: docker container names can no longer start with `-` (and `--` is used), tool targets cannot start with `-`, rule patterns use `grep -e`.
- `docker logs` container names and remote SQLite file paths can no longer be parsed as command options; oversized remote SQLite files are refused instead of being silently truncated. `GET /api/audit/verify` requires authentication.
- WebSocket `maxPayload` limits, concurrent terminal limit, explicit HTTP timeouts, SSH output size cap, `Cache-Control: no-store` for the API.
- FIM: an unreadable hash (`?`) is no longer reported as a modification.
- Independent audit status is unchanged: `AUDIT:NONE`.

### Honest note
Measured speed-up of auth parsing over a naive JS parser is modest (see `docs/PERFORMANCE.md`); the main gains are linear-time rules, caps and consistent semantics.

## v3.1.1 — Dependency refresh

### Security-relevant
- Self-signed HTTPS certificate generation moved to `server/tls.js` for `selfsigned` 5 (async API). The signature
  algorithm is now pinned to **SHA-256** explicitly (the library defaults to SHA-1) and covered by new tests.
- `undici` stays on the patched 6.x line: 8.x requires Node ≥ 22.19; Dependabot now ignores undici majors until the
  minimum Node version is raised. `engines.node` is declared as `>=22.12`.

- **Desktop SSH fix:** with Electron 45 the optional native crypto module of `ssh2` is no longer rebuilt; the hardened
  algorithm list is now intersected with what `ssh2` supports at runtime (AES-GCM is used when ChaCha20-Poly1305 is not
  available) instead of failing every connection. New test guards this.
- Desktop builds no longer compile optional native modules (`npmRebuild: false`, `cpu-features` / `sshcrypto` excluded).

### Dependencies
- Electron 45. Updated: React / React DOM, `@xterm/xterm` 6, `@xterm/addon-fit`, `lucide-react` 1.x, `ioredis` 6, `mongodb`, `pg`,
  `mysql2`, `ws`, `sql.js`, `selfsigned` 5, dev tooling; GitHub Actions (`checkout`, `download-artifact`,
  `attest-build-provenance`, `cosign-installer`). `npm audit`: 0 vulnerabilities.
- Datadog Synthetics workflow (manual) moved to action v4.1.1 with the renamed inputs and a clear error when secrets are missing.


## v3.1.0 — Privacy, integrations, agents · Altumptic PSB-B

### Security fixes (please upgrade)
- **Cross-site WebSocket / DNS rebinding (high):** a malicious web page open in the analyst's browser could connect to the
  local engine's WebSocket endpoints (incl. the SSH terminal). The engine now validates `Host` (loopback-only in local
  mode) and `Origin` on every API call and WebSocket upgrade. Affects ≤ 3.0.0.
- Dependency updates: `undici` 6.29.1, transitive `proxy-addr`, `body-parser`, `qs` — `npm audit` reports 0 vulnerabilities.

### Altumptic Product Security Baseline (PSB-B)
- Strict CSP (scripts by hash, no `unsafe-inline`/`eval`), COOP/CORP, Permissions-Policy; fonts served as files.
- Electron: sandboxed renderer, OS permissions limited to notifications + clipboard write, navigation lock.
- Geo-IP is now **opt-in** and HTTPS-only (`ipwho.is`), previously on by default over HTTP.
- Encrypted backups (scrypt + AES-256-GCM); data files 0600 / directory 0700; scheduled FIM; FIM no longer writes temp files.
- Outbound-connections inventory in the UI (no telemetry).
- Release artifacts: `SHA256SUMS`, Sigstore keyless signature, GitHub build provenance, CycloneDX SBOM.
- Security tests (`npm test`), CI audit gate, Dependabot. Docs: security notes, threat model, verify guide.

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
