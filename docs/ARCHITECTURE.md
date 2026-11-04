# Architecture

```
 Browser / Electron ──HTTP+WS (127.0.0.1, token, Host/Origin guard)──► Node engine (server/)
                                                                           │ ssh2 (optional proxy/Tor/bastion)
                                                                           ▼
                                                                   monitored hosts (agentless)
 Node engine ──► core facade (server/core/index.js) ──► Rust/WASM core (core/)
```

## Hot paths
1. **Threats** (`server/threats.js`): one SSH command prints `@@NOW@@ <epoch> <tz>` plus the sshd lines of the last 48 h (journald `-o short-iso` + auth.log/secure, pre-filtered, ≤400k lines, ≤64 MiB). The engine passes the text to `core.auth` with the *server's* clock and zone. Result: attackers (IPv4/IPv6), users, accepted logins, **suspects** (success after ≥N failures), hourly histogram. Fallback: legacy remote awk (`engine: "awk"`).
2. **Rules** (`server/extensions.js`): raw journal/file text is fetched (capped); `core.rules` evaluates the pattern with the Rust `regex` engine (linear time; lookaround/backreferences are rejected when the rule is saved) and counts matches in the trailing `windowMin`. Fallback: remote `grep -cE -e`.
3. **FIM** (`server/fim.js`): the host prints `sha256` + `stat`; `core.fim` diffs against the local baseline and flags critical globs (`FIM_CRITICAL`). Fallback: JS diff with the same semantics.

## Core ABI (`core/lemonsees-wasm`)
`ls_alloc(len)` / `ls_free(ptr,len)` — buffers owned by the host. `ls_call(op, a_ptr,a_len, b_ptr,b_len) -> status`: `a` = JSON params, `b` = raw log text; the JSON result is read via `ls_out_ptr/ls_out_len`. Ops: 1 auth, 2 rules, 3 fim, 4 info, 5 selftest. Status: 0 ok, 1 unknown op, 2 bad params, 3 rule error. A trap re-instantiates the module; that request falls back to the legacy path.

## Safety properties of the core
`forbid(unsafe_code)` in the logic crate; seeded SipHash maps (HashDoS); regex size limits; caps on rules/patterns/groups/IPs/users/lines; line clipping at char boundaries; no I/O, clock or randomness inside the module (time is passed in).

## Engine security layers
Host/Origin guard + CSP (`guard.js`), token auth, AES-256-GCM vault, hardened SSH algorithms, kill switch, proxy/Tor routing, hash-chained audit log (tamper-**evident**, not tamper-proof — forward to an external SIEM for stronger guarantees), `no-store` API, bounded WS/HTTP/SSH output. See `docs/security/*`.

## Build & release
`core/rust-toolchain.toml` pins Rust. CI job `core` (fmt, clippy `-D warnings`, tests, wasm, `cargo audit`) feeds the wasm artifact to the `build` job; release builds the wasm and bundles it in `server/core/` (electron-builder `files: server/**`). The wasm sha256 is exposed in `GET /api/info` → `core`.
