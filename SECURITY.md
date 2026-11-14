# Security Policy

LemonSees is built and maintained by **[Altumptic](https://altumptic.com)**.
We take the security of a security product seriously — thank you for helping keep it safe.

## Reporting a vulnerability

Please **do not open public GitHub issues** for security problems. Report privately through
**[GitHub private vulnerability reporting](https://github.com/Altumptic/LemonSees/security/advisories/new)**.
The report stays visible only to maintainers until a fix and advisory are published.

If you need to send encrypted material, mention it in the advisory and we will agree a channel. Our public key:

| | |
|---|---|
| Key | [`public/.well-known/pgp-key.txt`](public/.well-known/pgp-key.txt) |
| Fingerprint | `117B A978 F332 80B5 12EE 84B5 D278 3C4F DE43 0CA6` |

Please include the affected version, steps to reproduce and the impact. We aim to acknowledge a report within
**72 hours** and to agree a disclosure timeline with you (default: 90 days, shorter if the issue is being exploited).
Preferred languages: English, Ukrainian.

Every LemonSees instance also serves this contact information at `/.well-known/security.txt`.

## Evidence

- [Security design notes](docs/security/SECURITY-NOTES.md) — trust boundaries, cryptography, data inventory, known limits & exceptions
- [Threat model and non-goals](docs/security/THREAT-MODEL.md)
- [Verify a release](docs/security/VERIFY.md) — SHA256SUMS, Sigstore signature, GitHub attestation, SBOM

Product class under the Altumptic Product Security Baseline: **PSB-B**. Independent audit: **none yet** (`AUDIT:NONE`).

## Supported versions

| Version | Supported |
|---|---|
| 3.1.x | ✅ |
| 3.0.x | ⚠️ security fixes only |
| < 3.0 | ❌ — please upgrade |

## Hardening notes for operators

- The engine binds to `127.0.0.1` by default. To expose the web UI on a network, set **both**
  `LEMONSEES_HOST` and a long random `LEMONSEES_TOKEN`; without a token LemonSees refuses to bind publicly.
- Put the web UI behind TLS (reverse proxy) and set `LEMONSEES_SECURE_COOKIE=1`.
- Prefer SSH keys over passwords; credentials are stored only on the machine running LemonSees and are encrypted at rest
  (AES-256-GCM). On servers set `LEMONSEES_MASTER_KEY`; the desktop app keeps the key in the OS keychain.
- Serve HTTPS with `LEMONSEES_TLS=self` or `LEMONSEES_TLS_CERT` / `LEMONSEES_TLS_KEY`.
- To hide the analyst's IP, route through Tor/SOCKS5/HTTP proxy with the kill switch enabled (*System → Security & network*).
- Host keys are pinned on first connection; a changed key blocks the connection until an operator resets it.
