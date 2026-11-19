# Roadmap

LemonSees is in **beta**. This roadmap says what is shipped, what is next, and what we deliberately will not build.
Dates are intentions, not promises. Each item has a status:

- **Shipped** — in a released version.
- **Next** — accepted, scheduled, design agreed.
- **Planned** — accepted, not yet scheduled.
- **Considering** — needs more evidence or user demand.
- **Out of scope** — conflicts with the product principles.

Principles: agentless first, local-first, no telemetry, calm UI, privacy by default, claims only when measured.

## Milestones

| Milestone | Goal | Status |
|---|---|---|
| **M1 · Trustworthy core** | Analysis engine tested on synthetic data, fuzzed, fallback paths | Shipped |
| **M2 · Real-world validation** | Run on real Linux servers from ≥5 distributions; publish redacted results | **Next** |
| **M3 · Fleet hygiene** | SSH hygiene across the fleet: [design and status](features/ssh-hygiene.md) | **Shipped in v3.3.0 (beta)**; follow-ups below |
| **M4 · Easy to adopt** | Host import from `~/.ssh/config` (shipped in v3.4.0), headless CLI, package managers | In progress |
| **M5 · Independent trust** | External security review; signed Windows and macOS builds | Considering |

## Shipped (v3.2 to v3.5)

- **Rust → WebAssembly core** for the hot paths: SSH auth-log analysis (IPv4 and IPv6, three timestamp formats,
  suspicious logins, hourly histogram), linear-time rules with `group_by`, FIM diff with critical paths.
- **Fallback** to the previous code paths when the core is unavailable (`LEMONSEES_CORE=off`).
- **Suspicious logins** and **48-hour activity chart** on the Threats page.
- **Hardening:** argument-injection fixes, WebSocket payload limits, terminal limit, HTTP timeouts, SSH output cap,
  `no-store` API responses, global per-IP API limit, hash-chained audit log with a verification endpoint.
- **Suspicious-login incidents** (v3.5): a success after a run of failures from the same address raises an incident and a notification. Threshold in Settings (default 10); severity by address and method; no repeat for 24 hours.
- **Import from `~/.ssh/config`** (v3.4): a button on the Hosts page lists the hosts of the file on the machine that runs LemonSees, with user, port, address and key, and adds the ones you choose. Read-only; key contents are never opened.
- **Polish and Chinese** translations of the SSH hygiene page and the import dialog.
- **SSH hygiene** for the whole fleet (beta): effective sshd settings, key inventory with fingerprints, last use, expected keys, export. See [features/ssh-hygiene.md](features/ssh-hygiene.md).
- **Fuzz targets** for the parsers (`core/fuzz`) and randomized robustness tests, both run in CI.
- **Installers:** Windows installer, portable build and zip; Linux AppImage, `.deb` and tarball; macOS `.dmg`
  for Apple Silicon and Intel; web tarball. Every release has checksums, a Sigstore signature, build provenance and an SBOM.
- **CI:** Rust formatting, clippy, tests, wasm build and `cargo audit`; Node tests; CodeQL; a drift check for the
  generated repository map.

## Next (M2): validation on real servers

- Run LemonSees against real servers from at least five distributions (Debian, Ubuntu, RHEL family, Alpine, Arch).
- Compare what LemonSees reports with what the logs contain. Record the differences as issues.
- Publish redacted results in `docs/VALIDATION.md`: versions tested, counts matched, and open differences.
- Measure time from install to the first useful screen.

See [TESTING.md](TESTING.md) for how to take part.

## Shipped (v3.3): SSH hygiene across the fleet

One page for the whole fleet: effective `sshd` settings, every key that can log in (with SHA-256 fingerprints), the
last time each key was used, and findings with the change to make. The change is shown, never applied. Details, limits
and API: [features/ssh-hygiene.md](features/ssh-hygiene.md).

It is a **beta feature that has not yet been validated on a real fleet**: see [M2](#next-m2-validation-on-real-servers).

## Planned: SSH hygiene follow-ups

- **Import the expected-keys list from a file** (today it is edited in the UI).
- **Per-user `Match` evaluation** with `sshd -T -C`, so overrides for some users or addresses are judged too.
- **Custom `AuthorizedKeysFile`**, `AuthorizedKeysCommand` and certificate authorities.
- **Hygiene history:** compare two scans and show what changed since the last one.

## Planned (M4): easier to adopt

- **Import follow-ups:** offer the import on first run; map `ProxyJump` to a bastion host; follow `Include`; evaluate `Match` blocks.
- **Headless CLI:** `lemonsees check <host>` for cron and CI, with JSON output and an exit code.
- **Shared rule sets as files:** import and export rules as YAML; community rule sets in a git repository. No telemetry.
- **Packages:** Homebrew cask (macOS), AUR (Arch), Docker Hub image. Winget after code signing (M5).
- **Discussions and good-first-issue** labels, to make contributing easy to start.

## Considering (M5): independent trust

- **Independent security review** of the engine and the SSH path. Until one is complete the status stays `AUDIT:NONE`.
- **Code signing:** Authenticode for Windows and notarization for macOS, when a certificate is available.
- **Reproducible builds** for the WebAssembly core, with the hash published in each release.
- **Pin GitHub Actions by commit SHA**, `npm ci --ignore-scripts` in the gate, Electron fuses.

## Considering: more log sources

- nginx and Apache access logs, sudo, auditd, using the same core and the same caps.
- Sigma-style rule import (a documented subset) compiled into the core rule set.
- Streaming analysis (no full-text transfer) and incremental baselines for FIM.

## Out of scope

These conflict with the product principles. We will decline them, however popular:

- Cloud accounts, SaaS backends, or any service that stores analyst data for us.
- Telemetry or analytics of any kind, opt-in or not.
- Mandatory agents on monitored servers.
- Active exploitation, attack features, or offensive tooling.
- Automatic remediation that changes servers without the analyst's explicit action.
- Claims of Wazuh parity, certification, or performance we have not measured.
