# Changelog

## v3.5.0 — Alerts for suspicious logins and SSH hygiene changes

### Added
- **Alerts for SSH hygiene changes.** Each scan is compared with the previous one of the same host. A **new key** in an
  `authorized_keys` file, or a setting that got **worse** (`PermitRootLogin`, `PasswordAuthentication`, `PermitEmptyPasswords`
  turning to `yes`), raises an incident and goes through your notifications. Severity of a new key: weak (1024-bit RSA, DSA) →
  high; a key for `root` → high; a key you declared expected for that host → low; an unlisted key once you keep an expected
  list → high; otherwise medium. `PermitEmptyPasswords` → critical, the other two settings → high. LemonSees changes nothing on
  the server; the incident text says what to check.
  The first scan of a host is only a baseline and raises nothing. To avoid false alarms nothing is compared when it cannot be
  trusted: a failed or truncated scan, accounts whose key file was unreadable in either scan, or settings taken from different
  sources (`sshd -T` versus the config file). Each guard has a negative control in the tests. A removed key is not an alert.
  Names from the host are cleaned; at most 20 incidents per host per scan; an open incident, or one created in the last 24 hours,
  is not raised again.
- **Scheduled hygiene scan** (*Settings → SOC*, default every **24 hours**, 0 = off, up to 168). Without a schedule there would be
  nothing to compare, so the scan now also runs on its own for connected hosts. It is read-only, like the manual scan.
  The Hygiene page says how often it runs.
- **Suspicious-login alerts work without the Rust core.** A JavaScript implementation (`server/authfallback.js`) is used when the
  core is missing or off (`LEMONSEES_CORE=off`); the result says which engine produced it (`rust-wasm` or `js`). It is kept
  equivalent to the Rust code by a differential test on 600 generated logs, and the test was checked with deliberately
  introduced bugs (all detected).
- **Automatic incidents for suspicious logins.** A successful SSH login from an address that had failed many times just before
  now raises an incident and goes through your notifications (Slack, Telegram, webhooks and the rest), like any other incident.
  Until now this was only visible when the Threats page was open. Severity depends on the address and the method:
  public address with a password → critical; public with a key → high; internal with a password → medium; internal with a key →
  low. A light check of the last 3 hours runs on every sweep (default every 5 minutes). One incident per host, address and user;
  the same login is not raised again for 24 hours, even after the incident is closed. Names from the log are cleaned and clipped.
- Strings for the new settings and messages in English, Ukrainian, Polish and Chinese.
- **Automatic incidents for suspicious logins.** A successful SSH login from an address that had failed many times just before
  now raises an incident and goes through your notifications (Slack, Telegram, webhooks and the rest), like any other incident.
  Until now this was only visible when the Threats page was open. Severity depends on the address and the method:
  public address with a password → critical; public with a key → high; internal with a password → medium; internal with a key →
  low. A light check of the last 3 hours runs on every sweep (default every 5 minutes). One incident per host, address and user;
  the same login is not raised again for 24 hours, even after the incident is closed. Names from the log are cleaned and clipped.
- **Setting: suspicious login threshold** (*Settings → SOC*, default **10**, range 3–100): how many failed attempts from one
  address before a success counts. The Threats page uses the same value.
- The suspicious-login record now says whether the address is internal.

### Fixed
- **Attempts were counted twice on hosts that have both journald and an rsyslog `auth.log`** (the default on Debian and Ubuntu):
  the log collection read both sources, and each event is in both. Attack counts on the Threats page were doubled there, and
  the new alert would have fired on half as many real failures. Collection now uses one source: journald, or the log files when
  journald has nothing. Verified with a negative control (the old behaviour gives 12 for 6 real attempts). The fallback
  without the Rust core is fixed the same way. (The brute-force *incident* counter was not affected: it already took the larger
  of the two counts.)

### Known limits
- The threshold counts failures **per address, not per person**. A shared office (NAT) address with several mistyped passwords,
  or automation with wrong credentials, can raise a false alarm; that is why the default is 10 and why internal addresses and
  key logins rank lower. There is no allow-list yet.
- The SSH **hygiene scan itself still needs the Rust core** (it parses keys with it), so hygiene alerts and the scheduled scan
  do nothing without it. Suspicious-login incidents do not need it. The Threats page list still comes from the core only.
- Scheduled scans read the `authorized_keys` files of all connected hosts every N hours (the parsed result is stored locally,
  as before). Set the interval to 0 to turn this off.
- Hygiene alerts are only as good as the baseline: a key added before the first scan is not "new".
- Neither alert type has been validated on a real fleet yet; they are covered by unit, differential and end-to-end tests
  against a simulated host.

## v3.4.0 — Import hosts from ~/.ssh/config

### Added
- **Import from `~/.ssh/config`.** A button on the Hosts page lists the hosts of that file, with address, user, port and key,
  and adds the ones you pick through the normal add-host path. It follows OpenSSH rules (the first value wins, `Host *`
  defaults, `!` negation, wildcards not listed as hosts) and **reports instead of importing silently** what it does not support:
  `Include`, `Match`, `ProxyCommand`, `%`-substitutions, missing keys. Hosts already added are not added twice.
  New route `GET /api/ssh-config` (authenticated). It reads a fixed path on the machine that runs the engine, only checks that
  key files exist and never opens them, and is size- and line-limited. 16 tests.
- **Polish and Chinese** translations of the SSH hygiene page and of the import dialog; two older strings that lacked
  RU/PL/ZH translations were added.

### Docs
- Roadmap, privacy, security notes, threat model (T13), architecture and README describe the import and its limits.

## v3.3.1 — Terminal stability fix and dependency updates

### Security
- **The engine could be stopped by one oversized or malformed frame on the terminal WebSocket (`/ws/term`).** The socket had no
  `error` handler, so Node treated the error as unhandled and exited, which stopped monitoring of every host. Reaching it
  needs an authenticated session (or local access in local mode), so the impact is a denial of service, not data access.
  It affects every earlier version. The terminal now lives in `server/terminal.js`, registers the handler before anything
  else, and closes the shell on any socket error. Found while checking the `ws` update; covered by `test/terminal.test.js`
  on real sockets (the test fails without the fix). Please upgrade.
  Advisory: [GHSA-9wg3-6q3h-7m9c](https://github.com/Altumptic/LemonSees/security/advisories/GHSA-9wg3-6q3h-7m9c) (medium, CVSS 6.5).
- A terminal shell that finished opening after the client had already gone is now closed instead of staying open on the host.

### Dependencies
- Runtime: `ws` 8.23, `mongodb` 7.9, `sql.js` 1.16, `lucide-react` 1.73.
- Build: `electron` 45.3, `vite` 8.3.8, `@tailwindcss/vite` 4.3, `@vitejs/plugin-react` 6.3, `d3-geo` 3.1.2.
- CI: `actions/download-artifact` 8, `actions/cache` 6, `sigstore/cosign-installer` 4.1.3, `github/codeql-action` 4.

### Changed
- `THIRD-PARTY-LICENSES.md` no longer lists versions, so a routine dependency bump (for example a Dependabot pull request)
  does not make the licence check fail. The file changes when a package is added or removed or a licence changes; the full
  texts shipped in releases still carry exact versions. A new package without a permissive licence still fails CI.

## v3.3.0 — SSH hygiene, project documentation, security triage

### Added
- **SSH hygiene across the fleet (beta).** One page (*Endpoints → SSH hygiene*) shows the effective `sshd` settings of every
  host, every key that can log in with its SHA-256 fingerprint, when each key was last used, and findings with the change
  to make: root login, password login, empty passwords, weak RSA and DSA keys, keys not on your expected list, one key
  under several accounts, stale keys. The change is shown, never applied. The scan is read-only; the raw `authorized_keys`
  text is not stored; exports mask key comments by default. Needs the Rust core. **Not yet validated on a real fleet.**
  Design, limits and API: `docs/features/ssh-hygiene.md`.
- Rust core: `ssh` module (parsers for `sshd -T`, config files and `authorized_keys`; fingerprints checked against
  `ssh-keygen`), two new WebAssembly operations, a randomized robustness test and two more fuzz targets (`ssh_keys`,
  `ssh_judge`) run in CI.
- New page translated to English and Russian; Polish and Chinese fall back to English until translated.
- **Legal and licences.** `NOTICE`; `THIRD-PARTY-LICENSES.md`, generated from `package-lock.json` and `cargo metadata`
  (`npm run legal`); release builds now ship the **full licence texts** (`THIRD-PARTY-LICENSES.txt`) inside the installers
  and the web bundle, together with `LICENSE` and `NOTICE`. CI fails on an out-of-date list and on any unknown or copyleft
  licence in the production dependencies. New: `docs/legal/PRIVACY.md` (what data is handled and where it can go) and
  `docs/legal/TRADEMARKS.md` (use of the names and logos).

### Changed
- Security contact: reports now go through **GitHub private vulnerability reporting**. The personal mailbox and messenger
  handle have been removed from `SECURITY.md` and `security.txt`.
- Documentation rewritten around a narrow promise (small Linux fleets, agentless, local-first) with an explicit beta
  status. New: documentation index (`docs/README.md`), development guide, release process, validation page (no results
  yet), testing guide for real-server runs, and the design of the next feature (`docs/features/ssh-hygiene.md`).
- Roadmap restructured into milestones with explicit statuses; "out of scope" is listed in full.
- `docs/ARCHITECTURE.md` rewritten: components, process model, request path, data stores, trust boundaries, failure
  modes, design decisions and extension points. The threat model gains three SSH-hygiene threats (forged output markers,
  report injection, a scan that changes a server). `CONTRIBUTING.md` states the contribution licence and dependency policy.

### Added
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue forms (bug report, feature request), pull request template, and
  issue chooser with links to Discussions and private security reporting.

### Security
- Tool names are checked against the allowlist with `Object.hasOwn`; prototype keys such as `constructor` are rejected.
- CEF syslog export escapes `|` in the signature name.
- The request-line parser of the HTTP database console is linear-time (no overlapping whitespace and wildcard matching).
- Mongo console filters and sort specifications refuse server-side JavaScript operators (`$where`, `$function`,
  `$accumulator`) at any depth.
- Regression tests for each fix in `test/hardening.test.js`.
- The first CI fuzz run found a panic in the **fuzz harness** for `ssh_keys` (splitting a string inside a multi-byte
  character), not in the core. The harness is fixed and the input is kept as a regression test.

## v3.2.1 — Windows installer fix

- The Windows NSIS installer (`LemonSees-<v>-setup.exe`) was missing from v3.2.0 because the build script listed only portable/zip targets; it is now built and published. No other changes in the product; v3.2.0 artifacts remain valid.
- Global per-IP API rate limit; GitHub secret scanning/push protection and Dependabot alerts enabled for the repository.

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
