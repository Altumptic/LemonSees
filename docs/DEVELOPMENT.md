# Development

This page is for people who build or change LemonSees. For using it, see the [README](../README.md).

## Requirements

| Tool | Version | Why |
|---|---|---|
| Node.js | 22.12 or newer | Engine, UI build, tests |
| npm | bundled with Node | Dependencies |
| Rust | version pinned in `core/rust-toolchain.toml` (via rustup) | WebAssembly core |
| Git | any recent | Source and release tags |

Electron builds additionally need the platform toolchain that `electron-builder` expects. CI builds all targets, so you
rarely need to build installers locally.

## First run

```bash
npm ci
npm run build:core   # Rust -> server/core/lemonsees_core.wasm
npm test
npm run server       # engine on http://127.0.0.1:5199
npm run dev          # UI with hot reload (in a second terminal)
```

Without `build:core` the engine still works: it uses the fallback code paths, and `GET /api/info` reports
`core.backend: "none"` with the reason. Build the core before benchmarking or before releasing.

## Checks before you push

```bash
npm test                    # Node tests: security, auth, TLS, core, hardening
npm run typecheck           # TypeScript
npm run docs:check          # repository map is current (npm run docs:map to regenerate)
cd core
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

CI runs the same checks plus `cargo audit`, the fuzz targets, CodeQL and the production build.

## Rust core

- `core/lemonsees-core` — safe Rust (`#![forbid(unsafe_code)]`): parsing, rules, FIM diff.
- `core/lemonsees-wasm` — the only crate with `unsafe`: the C-ABI boundary for Node.
- `core/fuzz` — `cargo-fuzz` targets; they need nightly: `cargo +nightly fuzz run auth`.

Benchmarks: `npm run bench`. Method and limits are in [PERFORMANCE.md](PERFORMANCE.md).

### Windows: linker and paths

The MinGW linker fails when the target directory contains spaces or non-ASCII characters. Put the Cargo target directory
on an ASCII path:

```powershell
$env:CARGO_TARGET_DIR = "D:/rust/ls-target"
$env:LS_CORE_TARGET_DIR = "D:/rust/ls-target"
npm run build:core
```

## Environment variables for development

| Variable | Purpose |
|---|---|
| `LEMONSEES_PORT` | Engine port (default 5199) |
| `LEMONSEES_HOST` | Bind address (default 127.0.0.1). Non-loopback needs a token. |
| `LEMONSEES_TOKEN` | Access token for the web UI and API |
| `SHOK_CONFIG_DIR` | Where configuration and the audit log live. Use a temporary directory for experiments. |
| `LEMONSEES_CORE=off` | Disable the WebAssembly core and use the fallback paths |

Full list: the variable table in [README → Docker](../README.md#docker).

## Conventions

- Read [AGENTS.md](../AGENTS.md) for the invariants. The short version: quote and validate everything that reaches a
  remote shell, keep user regular expressions inside the Rust engine, bound every input, keep secrets in the vault.
- New user-visible text goes into `src/lib/i18n.ts`. The Ukrainian string is the key; add at least English.
- A new page needs demo data in `src/lib/demo.ts` or `demoExt.ts`.
- Security-relevant changes need a negative test: the attack must fail.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `npm run build:core` fails on Windows with a linker error | Non-ASCII or spaces in the target path. See "Windows: linker and paths". |
| `docs:check` fails | Files were added or moved. Run `npm run docs:map` and commit the result. |
| `GET /api/info` shows `core.backend: "none"` | The `.wasm` is not built, or it failed its self-test. The reason is in the response. |
