# AGENTS.md — LemonSees (read this first, then stop exploring)

LemonSees by Altumptic: **agentless** SSH-based security/infrastructure monitor (SOC view, FIM, threat intel, rules, incidents, integrations). Local-first: no cloud, no telemetry, config stays on the analyst machine. Security class **PSB-B**, independent audit **AUDIT:NONE** (keep it honest; never claim certification).

Full file map: [docs/ai/REPO_MAP.md](docs/ai/REPO_MAP.md) (generated). Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Plans: [docs/ROADMAP.md](docs/ROADMAP.md). Numbers: [docs/PERFORMANCE.md](docs/PERFORMANCE.md). Threats: [docs/security/THREAT-MODEL.md](docs/security/THREAT-MODEL.md).

## Stack in one paragraph
Node 22 ESM server (`server/`, Express + `ssh2` + `ws`) → React 19 + Vite + Tailwind 4 UI (`src/`) → optional Electron 45 shell (`electron/`). Hot paths (auth-log analysis, rule evaluation, FIM diff) live in a **Rust → WebAssembly core** (`core/`), loaded by `server/core/index.js`. No remote agent is required; optional pull/push shell agents exist (`server/agent.js`).

## Commands
```
npm ci                      # install
npm run build:core          # Rust -> server/core/lemonsees_core.wasm (needs rustup)
npm run server              # engine on 127.0.0.1:5199  (npm run dev for the Vite UI)
npm test                    # node --test (security, auth, tls, core) — must stay green
npm run typecheck           # tsc
npm run bench               # core benchmark (honest numbers, see PERFORMANCE.md)
npm run docs:map            # regenerate docs/ai/REPO_MAP.md (CI checks drift)
cd core && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --check
```
Windows: mingw linking fails on paths with spaces/Cyrillic — set `LS_CORE_TARGET_DIR=D:/rust/ls-target` (ASCII, no spaces) and `CARGO_TARGET_DIR` for raw cargo runs.

Env: `LEMONSEES_PORT`(5199) `LEMONSEES_HOST`(127.0.0.1) `LEMONSEES_TOKEN` `LEMONSEES_ALLOWED_HOSTS` `SHOK_CONFIG_DIR` `LEMONSEES_CORE=off` (disable wasm, use fallback paths).

## Where things are
- `server/index.js` routes + WebSockets; `guard.js` Host/Origin/CSP; `auth.js` token/session; `vault.js` AES-256-GCM secrets; `config.js` persistence + **hash-chained audit log** (`GET /api/audit/verify`); `ssh.js` connections (proxy/Tor/SOCKS5/bastion, kill switch, output cap); `threats.js`, `fim.js`, `extensions.js` (rules, integrations, agents) call `core`.
- `server/core/index.js` facade: `core.available()`, `core.auth/rules/fim`. Returns `null` when wasm is missing or trapped → the caller uses the legacy path (remote awk / JS diff / remote `grep -e`).
- `core/lemonsees-core` safe Rust (`#![forbid(unsafe_code)]`); `core/lemonsees-wasm` is the ONLY crate with `unsafe` (C-ABI: `ls_alloc/ls_free/ls_call/ls_out_*`).
- UI: `src/pages/*` one file per page; `src/lib/api.ts` client; `src/lib/demo.ts` + `demoExt.ts` demo data; `src/lib/i18n.ts` (**the Ukrainian string is the key**, EN dictionary + fallback).

## Invariants (do not break)
1. Fail closed. Everything reaching a remote shell is quoted (`shq`/`q`) and allowlisted; reject leading `-`; use `--` / `-e`. Never interpolate raw input.
2. User regexes run only in the Rust `regex` engine (linear time). No JS `RegExp.exec` of an untrusted pattern on untrusted logs.
3. Bounded everything: line length (4096), line/IP/user/group caps, ws `maxPayload`, SSH output cap, terminal limit, HTTP timeouts.
4. Secrets only in the vault; never in logs, URLs or responses. API responses are `Cache-Control: no-store`.
5. Honest labelling: PSB labels, `AUDIT:NONE`, no unverifiable claims (no "military-grade", no "Wazuh-equivalent" in product copy). Benchmarks must be reproducible.
6. Core semantics (documented in `auth.rs`/`rules.rs` headers): attempts = `max(Failed*, Invalid user, PAM)` per IP/user (not a sum); rule windows are trailing windows relative to the SERVER clock; an unreadable hash `?` is not a FIM change.
7. New user-visible string → add EN to `src/lib/i18n.ts`; new page → add demo data.

## Product principles — do NOT add
Cloud accounts/SaaS backends, telemetry/analytics, mandatory agents on monitored hosts, active exploitation/attack features, auto-remediation that changes hosts without an explicit analyst action, noisy/gamified UI (the UI is calm, cream, Anthropic-style), anything that sends analyst data to third parties by default.

## Workflow rules
- Tests first for security-relevant changes (`test/security.test.js` style). Keep `npm test` and `cargo test` green.
- Rust changes: rebuild wasm (`npm run build:core`); Node tests exercise the real binary.
- Update CHANGELOG.md (user-facing, honest) and docs/ROADMAP.md when scope changes; run `npm run docs:map`.
- Commits end with the Co-Authored-By trailer required by the environment. Only `main` exists on GitHub (Altumptic/LemonSees); tags `vX.Y.Z` trigger `release.yml` (Sigstore, SBOM, attestation).
