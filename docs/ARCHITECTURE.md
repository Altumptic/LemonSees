# Architecture

How LemonSees is built, why it is built that way, and where to change it. For the file-by-file map read the generated
[ai/REPO_MAP.md](ai/REPO_MAP.md); for the rules a change must respect read [AGENTS.md](../AGENTS.md).

## In one picture

```
 ┌────────────────────┐  HTTP + WebSocket on 127.0.0.1        ┌────────────────────────────────────────────┐
 │ Browser or Electron│ ─────────────────────────────────────►│ Node engine  (server/)                     │
 │ React UI  (src/)   │  Host/Origin guard · CSP · session    │  routes · SSH pool · schedulers · vault    │
 └────────────────────┘                                       │  audit log · integrations                  │
                                                              └───────┬──────────────────────┬─────────────┘
                                                                      │ ssh2                 │ WebAssembly
                                      optional proxy / Tor / bastion  │ (read-only commands) │ (JSON in/out)
                                                                      ▼                      ▼
                                                        ┌──────────────────────┐   ┌──────────────────────┐
                                                        │ Monitored Linux hosts│   │ Rust core  (core/)   │
                                                        │ nothing installed    │   │ parsers · rules · FIM│
                                                        └──────────────────────┘   │ SSH hygiene          │
                                                                                   └──────────────────────┘
        optional, only if you configure them:  integrations (Datadog, Slack, Wazuh …) · geo-IP · uptime URLs
```

LemonSees is **local-first**: the engine, the data and the keys live on the analyst's machine or on a server the analyst
runs. There is no Altumptic backend.

## Components

| Part | Where | Role |
|---|---|---|
| UI | `src/` | React 19, Vite, Tailwind 4. One file per page in `src/pages/`, a typed API client in `src/lib/api.ts`, demo data in `src/lib/demo*.ts`, translations in `src/lib/i18n.ts`. |
| Engine | `server/` | Express routes, WebSockets, the SSH connection pool, schedulers, the secret vault, the audit log, integrations. |
| Core | `core/` | Rust compiled to WebAssembly: parsing and analysis of logs, custom rules, file-integrity diff, SSH hygiene. No I/O, no clock: everything is passed in. |
| Desktop shell | `electron/` | Electron 45 window around the same engine. Sandboxed renderer, context isolation, no Node in the page. |
| Agent (optional) | `server/agent.js` | A read-only POSIX `sh` collector you can install on hosts. Pull over SSH or push over HTTPS with a per-agent token. Never required. |
| Tooling | `scripts/`, `bench/`, `test/` | Builds, generators (repo map, licences), benchmark, tests. |

## Process model

- **Web mode / Docker:** one Node process serves the static UI, the REST API and two WebSocket endpoints. It binds
  `127.0.0.1` by default and refuses to bind elsewhere without an access token.
- **Desktop:** the Electron main process imports the same engine in its own process and opens a window on
  `http://127.0.0.1:<port>`. Data goes to the user profile, or next to the program in portable mode.
- The WebAssembly module is loaded once and called synchronously from the engine. If a call traps, the module is
  re-instantiated and that request falls back or fails cleanly.

## Request path

```
request ─► Host/Origin guard ─► security headers + CSP ─► per-IP rate limit ─► session / token check ─► route
```

1. **Guard** (`guard.js`): only loopback `Host` headers in local mode (DNS-rebinding protection); `Origin` is checked on
   every API call **and on WebSocket upgrades**, because browsers do not apply CORS to WebSockets.
2. **Headers:** a strict CSP (scripts only from self plus the hash of one bootstrap script), `no-store` on API responses.
3. **Rate limit:** a global per-IP limit, plus a stricter login throttle.
4. **Auth** (`auth.js`): with `LEMONSEES_TOKEN` every `/api` and `/ws` call needs a session cookie (HttpOnly,
   SameSite=Strict). Without a token the engine is local-only.
5. **Routes** read from the SSH pool, call the core, and return JSON. Every state-changing action writes an audit entry.

WebSockets: `/ws/state` pushes host state to the UI (payload limit 64 KiB); `/ws/term` carries an interactive SSH terminal
(payload limit 1 MiB, at most 8 at once).

## What happens for a monitored host

1. **Connection** (`ssh.js`): one long-lived SSH connection per host, reused for every command, with back-off on failure.
   It can go through a SOCKS5/Tor/HTTP proxy or a bastion. With the **kill switch** on and a proxy configured but down,
   connections fail instead of going out directly. Host keys are pinned on first use; a changed key blocks the host.
2. **Metrics** (`collector.js`): one command per cycle (default every 5 seconds) returns CPU, memory, disk, load and so on.
3. **Sweeps** (default every 5 minutes, configurable): the SSH brute-force counter, a light check of the last 3 hours for **suspicious logins** (a success after a run of failures from the same address; `suspects.js`; the Rust core is used when present, otherwise the equivalent `authfallback.js`), custom rules, file integrity, and the **scheduled SSH hygiene scan** (default every 24 hours; `hygiene.js`), whose result is compared with the previous scan of the same host (`hygienealerts.js`: new key, worse sshd setting). A finding that
   crosses a threshold becomes an **incident**, deduplicated by a stable key.
4. **Incidents** (`index.js`, `extensions.js`): stored locally, mapped to MITRE ATT&CK by keyword, optionally forwarded to
   the integrations you configured. A failing integration is recorded and never blocks the engine.
5. **Adding hosts:** by hand, or from `~/.ssh/config` (`sshconfig.js`: fixed path, read-only, key files only checked for existence). The chosen entries go through the normal add-host route and its validation.
6. **On-demand scans:** posture, vulnerabilities, compliance, processes, persistence, and SSH hygiene run when you ask.

All commands that run on hosts are fixed templates, read-only, and bounded (timeout and output cap). Values that reach a
remote shell are quoted and validated (see [AGENTS.md](../AGENTS.md) invariants).

## The Rust core

The core exists because the hot paths process **untrusted text at volume**: tens of thousands of log lines, patterns the
analyst typed, key files from servers that may be hostile.

| Operation | Used by | What it does |
|---|---|---|
| 1 `auth` | `threats.js` | SSH log analysis: attackers (IPv4/IPv6), users, accepted logins, suspicious logins, hourly histogram |
| 2 `rules` | `extensions.js` | Custom rules: one pass over the log, linear-time regex, `group_by`, trailing windows |
| 3 `fim` | `fim.js` | Compare a file snapshot with the baseline; flag critical paths |
| 4 `info`, 5 `selftest` | `server/core/index.js` | Version and a self-check done at load |
| 6 `ssh_parse`, 7 `ssh_judge` | `hygiene.js` | SSH hygiene: parse a host, then judge the whole fleet |

How it is kept safe:

- The logic crate has `#![forbid(unsafe_code)]`. The only `unsafe` is the small C-ABI boundary in `lemonsees-wasm`.
- Regular expressions use the Rust `regex` crate: **linear time**, so a hostile pattern cannot stall the engine.
- Hash tables are seeded per call (HashDoS), and everything is capped: line length, lines, IPs, users, groups, hosts,
  keys, findings.
- The ABI is tiny: the host allocates a buffer, calls `ls_call(op, params, text)`, reads a JSON result.
  Status codes: 0 ok, 1 unknown operation, 2 bad parameters, 3 rule error.
- Tests: unit tests, a randomized robustness test, and `cargo-fuzz` targets for every parser, run in CI.

**Fallbacks.** If the module is missing, threats, rules and file integrity fall back to the previous code paths (remote
`awk`, remote `grep -e`, a JavaScript diff). Suspicious-login detection falls back to `server/authfallback.js`, which a differential test keeps equivalent to the Rust code. SSH hygiene has **no** fallback: it reports that the core is required, so hygiene alerts and the scheduled scan are off without it.

**What it does not do:** it is not dramatically faster than a well-written JavaScript parser for plain log counting (see
[PERFORMANCE.md](PERFORMANCE.md)). Its value is linear-time regex, hard caps, identical behaviour on every platform, and
keeping untrusted parsing inside a sandbox.

## Where data lives

All in the configuration directory (`config/` next to the program, the user profile for the desktop app, or
`SHOK_CONFIG_DIR`), with file mode 0600 and directory mode 0700. Which fields are encrypted is in
[security/SECURITY-NOTES.md](security/SECURITY-NOTES.md#3-secrets--data-at-rest-psb-2223-6).

| File | Holds |
|---|---|
| `hosts.json` | Hosts and how to reach them (secrets sealed with the vault) |
| `dbs.json` | Database connections reached through SSH tunnels |
| `network.json` | Proxy, Tor and bastion settings, kill switch |
| `integrations.json` | Outbound and inbound integrations (tokens sealed) |
| `rules.json` | Custom detection rules |
| `monitors.json` | Uptime monitors |
| `agents.json` | Optional agents and their tokens |
| `incidents.json` | Incident register |
| `audit.jsonl` | Audit log, hash-chained (`GET /api/audit/verify`) |
| `fim-baseline.json` | File-integrity baselines |
| `ssh-hygiene.json` | Parsed SSH hygiene results and the expected-keys list (no raw `authorized_keys` text) |
| `attestations.json` | Human attestations for compliance controls |
| `soc.json` | Sweep interval, thresholds, audit retention |

## Trust boundaries

| Boundary | What crosses | Treated as |
|---|---|---|
| Analyst's browser ↔ engine | API calls, WebSocket frames | Authenticated, Origin-checked, rate-limited, size-limited |
| Engine ↔ monitored host | Commands out, text back | **Untrusted text.** Bounded, parsed in the core, rendered escaped; markers carry a per-scan nonce |
| Engine ↔ WebAssembly | JSON and text buffers | Untrusted data in, bounded work, no I/O in the module |
| Engine ↔ third parties | Only what you configure | Through the proxy and the kill switch |
| Build and release | Source → signed artifacts | CI gates, pinned toolchain, Sigstore signature, provenance, SBOM |

The monitored host is **not** trusted. A compromised host can lie about its own files, logs and keys; LemonSees does not
claim to see through that (see [security/THREAT-MODEL.md](security/THREAT-MODEL.md)).

## When something fails

| Failure | What happens |
|---|---|
| Host unreachable | Host shows as offline; scans report it as not scanned; the rest continue |
| Proxy unreachable, kill switch on | SSH and outbound HTTP fail; there is no direct fallback |
| WebAssembly missing or traps | Threats, rules, file integrity use the old paths; SSH hygiene says it is unavailable |
| Log very large | Capped, and the result is marked truncated |
| Integration down | Delivery status is recorded; incidents are still stored locally |
| Audit log edited by hand | `GET /api/audit/verify` reports the first broken entry |
| Output of a host is cut off | Incomplete output is rejected, not trusted |

## Design decisions

- **Agentless over SSH.** Nothing to install, patch or secure on servers, and no new listening port. The cost: no
  real-time events, periodic sweeps instead, Linux with a POSIX shell only.
- **Local-first, no backend.** No accounts, no telemetry, nothing to breach centrally. The cost: no fleet-wide view across
  analysts and no hosted option.
- **WebAssembly instead of a native addon.** One artifact for every platform and architecture, memory-safe sandbox, no
  per-OS compilation in releases. The cost: a JSON boundary and about 1.4 MiB.
- **Rust `regex` for user patterns.** Linear time by construction. The cost: no backreferences or lookaround, which the engine
  rejects when a rule is saved.
- **Read-only, fixed command templates.** The scans cannot damage a host, and the code that builds commands is small enough
  to review. A test fails if an SSH hygiene script gains a write or delete.
- **Detection and reporting, not response.** LemonSees shows the change to make; the analyst makes it.
- **Ukrainian string as the translation key.** Source text is the identity, English and Russian are dictionaries, and a
  missing translation falls back to English.

## Extending LemonSees

| To add… | Touch |
|---|---|
| A log source or analysis | `core/lemonsees-core/src/` (module, tests, a fuzz target), an op in `lemonsees-wasm`, a method in `server/core/index.js` |
| An integration | `server/integrations.js` (`CATALOG`, sender), the integrations page, tests |
| A database engine | `server/engines.js` and `src/lib/engines.ts` |
| A page | `src/pages/<Name>.tsx`, `src/nav.ts`, demo data, `src/lib/i18n.ts` |
| An SSH hygiene finding | `core/lemonsees-core/src/ssh.rs` (rule and test), the catalogue in `src/pages/Hygiene.tsx`, [features/ssh-hygiene.md](features/ssh-hygiene.md) |

Always: a negative test for anything security-relevant, a line in the [CHANGELOG](../CHANGELOG.md), and
`npm run docs:map`.

## Limits

Designed and tested for small fleets (roughly 3–30 servers); larger fleets are not load-tested. File integrity is
periodic, not real-time. Targets are Linux with a POSIX shell. The engine is single-user: one shared token. Web mode
has no per-user separation.

## Build and release

`core/rust-toolchain.toml` pins Rust. CI runs the `core` job (format, clippy `-D warnings`, tests, licence check, wasm,
`cargo audit`), a fuzz job, and the Node job (tests, typecheck, build, CodeQL separately). The WebAssembly module is built
in each release job and bundled into `server/core/`. Release builds also write `THIRD-PARTY-LICENSES.txt` into `dist/`.
Tagging `vX.Y.Z` builds Windows, Linux, macOS and web artifacts, then checksums, Sigstore signature and provenance
([RELEASE.md](RELEASE.md)). The WebAssembly hash is shown in `GET /api/info` → `core`.
