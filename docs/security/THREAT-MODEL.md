# LemonSees — Threat model (short)

PSB-B · version 3.1 · reviewed 2026-10-28

## Assets

1. **Credentials to your servers** — SSH keys (paths), passwords, passphrases; DB and proxy passwords; integration tokens.
2. **Interactive access** — the web terminal and command execution over SSH.
3. **Security findings** — incidents, attacker IPs, audit trail, FIM baselines.
4. **The analyst's identity** — the public IP of the machine running LemonSees (when privacy routing is used).

## Adversaries & mitigations

| # | Threat | Mitigation | Status |
|---|---|---|---|
| T1 | Malicious website talks to the local engine (CSRF, cross-site WebSocket, DNS rebinding) | Host allow-list (loopback in local mode), Origin check on API + WebSocket, `SameSite=Strict`, CSP `frame-ancestors 'none'` | ✅ tested |
| T2 | Network attacker between engine and server (MITM) | SSH host-key pinning (TOFU) with hard block on change; modern SSH algorithms | ✅ |
| T3 | Attacker on the LAN reaches web mode | Bind to 127.0.0.1 by default; non-loopback requires token; rate-limited login; HTTPS + HSTS available | ✅ tested |
| T4 | Theft of the config directory / backup file | Secrets AES-256-GCM with key in OS keychain or passphrase; backups scrypt + AES-256-GCM | ✅ tested · operational data: EX-001 |
| T5 | Proxy/Tor failure leaks the analyst's IP or DNS | Kill switch (no direct fallback), remote DNS via SOCKS5 | ✅ tested |
| T6 | Compromised/hostile server returns crafted output | Output treated as text; bounded parsing; no HTML injection (React escaping, CSP) | ✅ |
| T7 | Forged agent data | Per-agent 192-bit token, constant-time compare, strict sample sanitisation | ✅ tested |
| T8 | Tampered release download | SHA256SUMS signed with Sigstore (keyless, GitHub OIDC) + GitHub build provenance + SBOM | ✅ from v3.1.0 |
| T9 | Vulnerable dependency | `npm audit` gate (critical blocks), Dependabot, lockfile | ✅ |
| T10 | A hostile server forges the structure of scan output (for example a fake `authorized_keys` file that imitates another account) | Markers carry a one-time nonce per scan, so file contents cannot forge them; incomplete output is rejected; output is size-capped | ✅ tested |
| T11 | Injection through exported reports (CSV formulas, Markdown links or images built from names a host controls) | CSV cells that start with a formula character are neutralised; Markdown special characters are escaped; key comments are masked by default | ✅ tested |
| T12 | An SSH hygiene scan changes something on a server | All commands are fixed read-only templates; a test fails if a script gains a write, delete, kill, network or key-generation command | ✅ tested |
| T13 | The host import is used to read arbitrary files or to expose private keys | The path is fixed to `~/.ssh/config` and cannot be chosen by the client; key files are only `stat`-ed, never read; size, line and entry limits; pattern matching without regular expressions; the route requires an authenticated session | ✅ tested |
| T14 | A hostile log injects control characters, escape sequences or oversized names into incident titles and notifications | Names are stripped of control characters and clipped before they reach an incident; React escapes them in the UI; one host can raise at most 20 suspicious-login incidents per sweep | ✅ tested |

## Non-goals — what LemonSees does **not** protect against

* A **compromised analyst machine** (malware, keylogger, admin access) — it can read decrypted secrets in memory.
* A **compromised target server** hiding its activity from read-only commands (rootkits can lie to `ps`, `ss`, `sha256sum`).
  The same applies to SSH hygiene: a server that is controlled by an attacker can hide keys or report false settings.
* Anonymity against a global adversary — proxy/Tor routing hides your IP from servers and services, it is not a guarantee
  of anonymity. We do not claim “100 % anonymous”.
* Multi-user separation — web mode has one shared token; anyone with it has full access.
* Real-time EDR blocking — LemonSees detects and reports; it does not quarantine processes or block traffic.
