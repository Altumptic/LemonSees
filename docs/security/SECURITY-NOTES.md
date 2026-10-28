# LemonSees — Security design notes

**Product class:** PSB-B (Security ops / infrastructure) under the Altumptic Product Security Baseline v1.0.
**Applies to:** LemonSees 3.1.x (engine, web UI, Electron desktop app, optional agent).
**Audit status:** `AUDIT:NONE` — no independent security audit has been performed yet.

This note describes what LemonSees trusts, which primitives it uses, where keys live, and what it does **not** protect.
Plain language, no marketing. If something here is wrong, please report it — see [SECURITY.md](../../SECURITY.md).

---

## 1. Trust boundaries

```
 ┌──────────────────────── Analyst's machine (TRUSTED) ────────────────────────┐
 │                                                                              │
 │  Browser / Electron renderer (sandboxed, CSP)                                │
 │        │  HTTP+WS, same origin only (Host + Origin checked)                  │
 │        ▼                                                                     │
 │  LemonSees engine (Node.js, binds 127.0.0.1 by default)                      │
 │   ├─ vault layer:  secrets ⇄ AES-256-GCM, key from OS keychain / passphrase  │
 │   └─ network layer: SSH client, HTTP client ── proxy / Tor / bastion ──┐     │
 │                                                                        │     │
 └────────────────────────────────────────────────────────────────────────┼─────┘
                                     network starts here (UNTRUSTED)      │
                      ┌───────────────────────────────────────────────────┼──────────┐
                      ▼                                                   ▼          ▼
            Your Linux servers (SSH)                         Optional third parties   Proxy/Tor
            — authenticated by pinned host key              (only if you enable them):
            — output is parsed as untrusted text            geo-IP, integrations, uptime URLs
```

* The **vault layer** (encryption/decryption of secrets) never talks to the network. The **network layer** receives
  decrypted credentials only at connect time and never logs them.
* Data coming back from servers (command output, logs, Wazuh alerts, agent pushes) is **untrusted input**: it is parsed,
  bounded and rendered as text — never executed or injected as HTML.
* In **web mode** the engine may listen on a network interface; then every API and WebSocket request requires a session
  created with `LEMONSEES_TOKEN`, and HTTPS is strongly recommended.

## 2. Cryptography (PSB §2.1)

| Purpose | Primitive | Where |
|---|---|---|
| Secrets at rest | **AES-256-GCM**, 96-bit random IV, 128-bit tag, versioned `enc:v1:` format | `server/vault.js` |
| Vault key | 256-bit random key; stored by **Electron safeStorage** (DPAPI / Keychain / libsecret) on desktop, derived with **scrypt** from `LEMONSEES_MASTER_KEY` on servers, or a 0600 key file as fallback | `server/vault.js`, `electron/main.js` |
| Encrypted backups | **scrypt** (N=2¹⁵, r=8, p=1) → **AES-256-GCM**, versioned format | `server/vault.js` |
| Integrity monitoring (FIM) | **SHA-256** of file content + mode/owner | `server/fim.js` |
| Host-key pinning | **SHA-256** fingerprint, trust on first use | `server/ssh.js` |
| Webhook signatures | **HMAC-SHA256** (`X-LemonSees-Signature`) | `server/integrations.js` |
| SSH transport (default “modern” mode) | kex: curve25519 / ECDH / DH-group14+ (SHA-2) · ciphers: chacha20-poly1305, AES-GCM, AES-CTR · MAC: HMAC-SHA2 (ETM) · host keys: Ed25519, ECDSA, RSA-SHA2 | `server/netproxy.js` |
| Web TLS | TLS ≥ 1.2 (Node defaults, modern suites); certificate supplied by you or auto self-signed RSA-2048/SHA-256 | `server/index.js` |
| Tokens / sessions | 256-bit random session IDs, constant-time token comparison | `server/auth.js` |

No MD5, SHA-1, RC4, 3DES, CBC-without-MAC or RSA < 2048 on any path we control. Turning **off** “Modern SSH crypto” lets the
SSH library negotiate legacy algorithms for old servers — that is an explicit, visible operator choice.

## 3. Secrets & data at rest (PSB §2.2–2.3, §6)

| Data | Stored | Protection |
|---|---|---|
| SSH passwords, key passphrases, DB passwords, proxy passwords, integration tokens/API keys | config dir | **encrypted** (AES-256-GCM), file mode 0600 |
| SSH private keys | wherever you keep them | LemonSees stores only the **path**, never the key |
| Hosts, incidents, audit log, FIM baselines, rules, monitors | config dir | file mode 0600, dir 0700 — **not encrypted** (see exception EX-001) |
| UI preferences | browser localStorage | no secrets |
| Telemetry to Altumptic | — | **none** (`NO-TELEMETRY`) |

Secrets never appear in logs, API responses (masked as `••••••`), backups or audit entries.

**Data inventory / outbound connections** — the app lists them live under *System → Security & network*:

| Destination | Why | When |
|---|---|---|
| Your servers over SSH | telemetry, scans, terminal | for hosts you add |
| `https://ipwho.is` | country/ISP of **attacker** IPs | **opt-in** (off by default) |
| `https://api.ipify.org` | show which IP servers see | only when you press the button |
| Your uptime URLs | availability checks | for monitors you add |
| Integrations (Datadog, Slack, Wazuh…) | forward / import alerts | only those you configure |

All of the above honour the proxy / Tor route and the kill switch.

## 4. Network privacy & fail-closed behaviour (PSB P4)

* **Route:** global or per-host SOCKS5 (incl. Tor) or HTTP CONNECT proxy, or a bastion (jump host) chained over SSH.
* **Remote DNS:** with SOCKS5 the hostname is sent to the proxy; the analyst's machine does not resolve server names.
* **Kill switch (default on):** when a proxy is configured and unreachable, SSH and outbound HTTP **fail**; there is no
  direct fallback. Covered by tests in `test/security.test.js`.
* **Host keys:** pinned on first connect; a changed key blocks the connection until an operator resets it.
* **Limits:** the kill switch only applies when a proxy is configured. LemonSees does not route traffic of other apps and
  is not a VPN. Tor is supported (`TOR-CAPABLE`), not enabled by default.

## 5. Web & desktop hardening (PSB §5)

* Engine binds **127.0.0.1** by default; binding elsewhere without `LEMONSEES_TOKEN` is refused.
* **DNS-rebinding protection:** in local mode only loopback `Host` headers are accepted.
* **Origin checks** on all API calls and on **WebSocket upgrades** (browsers do not apply CORS to WebSockets).
* **CSP:** `script-src 'self'` + SHA-256 hash of the single inline bootstrap script — no `unsafe-inline`, no `eval`;
  `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`. Also COOP/CORP, `X-Frame-Options: DENY`,
  `nosniff`, `no-referrer`, restrictive `Permissions-Policy`, HSTS when served over HTTPS.
* **Sessions:** HttpOnly, `SameSite=Strict`, `Secure` over HTTPS, 12 h sliding expiry; login rate-limited (10 / 10 min / IP).
* **Electron:** `contextIsolation`, `sandbox`, no Node in the renderer, only *notifications* and *clipboard-write*
  permissions, navigation locked to the local engine, external links open in the system browser only if `https:`.
* **No auto-update** channel exists; updates are manual downloads you can verify ([VERIFY.md](VERIFY.md)).

## 6. Agentless by default, optional agent (PSB §4.1)

* Default collection runs read-only commands over SSH; FIM writes nothing on the host (no temp files).
* Use a **dedicated non-root SSH user**. Some checks (e.g. hashing `/etc/shadow`) use `sudo -n` only if passwordless sudo
  is already allowed; otherwise they are skipped and shown as such.
* The optional agent is a single POSIX `sh` script in `~/.lemonsees-agent`, scheduled via the user crontab, no root, no
  listening ports. Push mode authenticates with a per-agent 192-bit token; use HTTPS for push.

## 7. Known limits (PSB P6)

* `AUDIT:NONE` — not independently audited.
* **EX-001:** operational data (incidents, audit, baselines) is not encrypted at rest — compensating controls: 0600/0700
  permissions; use full-disk encryption. Expires: **2027-03-31** (planned: encrypt with the vault key).
* **EX-002:** `style-src 'unsafe-inline'` is required by the terminal and chart libraries. Scripts remain hash-locked.
  Expires: **2027-03-31**. Trusted Types are not enforced yet.
* **EX-003:** Windows builds are **not Authenticode-signed**; verify via SHA256SUMS + Sigstore signature + build
  attestation. Expires: when an Altumptic code-signing certificate is available.
* Targets must be **Linux** with a POSIX shell; Windows/macOS endpoints are not monitored.
* FIM is **periodic** (every sweep, default 5 min), not real-time (no inotify/auditd agent).
* MITRE ATT&CK mapping of LemonSees' own incidents is **heuristic** (category keywords). Wazuh-imported alerts keep
  Wazuh's own MITRE IDs.
* Compliance checks cover a **subset** of CIS/NIST/ISO controls; they are evidence helpers, not a certification.
* Integrations with “allow self-signed certificate” disable TLS verification for that integration only (opt-in, shown in UI).
* Web mode has a **single shared access token** — no per-user accounts or RBAC yet.
