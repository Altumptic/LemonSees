# Roadmap

Principles: agentless first, local-first, calm UI, privacy by default, claims only when proven. Dates are intentions, not promises.

## Done (v3.2 line)
- Rust → WASM core: auth-log analysis (IPv4/IPv6, 3 timestamp formats, suspects, hourly histogram), linear-time rules (`group_by`, trailing windows), FIM diff with critical globs.
- Fallback paths when the core is unavailable; `LEMONSEES_CORE=off`.
- Hardening: argument-injection fixes, ws payload limits, terminal limit, HTTP timeouts, SSH output cap, `no-store` API, hash-chained audit log + verify endpoint.
- CI: Rust fmt/clippy/tests/`cargo audit`, CodeQL, wasm artifact into the Node job; AI-first docs with a drift-checked repo map.

## Next (v3.3)
- UI for new data: suspects and hourly histogram on Threats, `group_by` in Rules, extra FIM paths in Settings (strict validation).
- Differential tests against a reference corpus (real anonymised logs) and `cargo-fuzz` targets for the parsers.
- Faster auth path: allocation-free IP keys, cheaper timestamp parsing, optional SIMD (`wasm32` `simd128`).
- Reproducible builds for the wasm and published hash in release notes.
- Pin GitHub Actions by commit SHA; `npm ci --ignore-scripts` in gates; Electron fuses.

## Later
- More log sources (nginx/apache access, sudo, auditd) in the same core, same caps.
- Sigma-style rule import (subset) compiled into the core rule set.
- Streaming analysis (no full-text transfer) and incremental baselines.
- Signed release hash verification inside the app; independent security review (status stays `AUDIT:NONE` until one is done).

## Explicitly out of scope
Cloud/SaaS backend, telemetry, mandatory agents, active exploitation, auto-remediation without analyst action, claiming Wazuh parity.
