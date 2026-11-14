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
| **M3 · Fleet hygiene** | SSH hygiene across the fleet (see below) | Planned |
| **M4 · Easy to adopt** | Auto-discovery of hosts, headless CLI, package managers | Planned |
| **M5 · Independent trust** | External security review; signed Windows and macOS builds | Considering |

## Shipped (v3.2)

- **Rust → WebAssembly core** for the hot paths: SSH auth-log analysis (IPv4 and IPv6, three timestamp formats,
  suspicious logins, hourly histogram), linear-time rules with `group_by`, FIM diff with critical paths.
- **Fallback** to the previous code paths when the core is unavailable (`LEMONSEES_CORE=off`).
- **Suspicious logins** and **48-hour activity chart** on the Threats page.
- **Hardening:** argument-injection fixes, WebSocket payload limits, terminal limit, HTTP timeouts, SSH output cap,
  `no-store` API responses, global per-IP API limit, hash-chained audit log with a verification endpoint.
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

## Planned (M3): SSH hygiene across the fleet

**Why:** this is what a fleet of a few servers actually needs most, and it is the feature that differs most from
agent-based suites. It needs only SSH and read-only commands.

**What:** one table across all connected hosts showing:

- `PermitRootLogin`, `PasswordAuthentication`, `PermitEmptyPasswords`, `X11Forwarding`, `MaxAuthTries`, and other
  sshd settings, with the effective value (`sshd -T`), not just the file.
- Keys in `authorized_keys` for every user, with type, fingerprint, comment and the last login they were used for.
- **Duplicates:** the same key on several servers, or the same key used by several users.
- **Unknown keys:** keys that are not in the analyst's list of expected keys.
- **Stale keys:** keys not used in N days (from the auth log, when available).
- A short finding per issue with a plain explanation and the change to make. The **change is shown, never applied**.

**Phases:**

1. *Read-only sshd audit* — effective settings per host, findings list, export to CSV/JSON.
2. *Key inventory* — keys per host and user, fingerprints, duplicates across the fleet.
3. *Expected keys* — the analyst declares which keys are allowed; deviations become findings.
4. *Last-used and stale keys* — correlate with successful logins from the auth log.
5. *Report* — a dated, shareable hygiene report for a review or an audit trail.

**Principles check:** SSH only, no agent, read-only commands, nothing sent to third parties, no change on a server
without the analyst's explicit action.

**Status:** designed, not started. Implementation waits for the go-ahead.

## Planned (M4): easier to adopt

- **Auto-discovery:** offer hosts from `~/.ssh/config` on first run, with a confirmation step.
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
