# Security Policy

LemonSees is built and maintained by **[Altumptic](https://altumptic.com)**.
We take the security of a security product seriously — thank you for helping keep it safe.

## Reporting a vulnerability

Please **do not open public GitHub issues** for security problems. Report privately:

| Channel | Address |
|---|---|
| Email | thefear078@gmail.com |
| Telegram | [@thefear078](https://t.me/thefear078) |
| Policy | <https://altumptic.com/security> |
| security.txt | <https://altumptic.com/.well-known/security.txt> |

Encrypt sensitive reports with the Altumptic PGP key:

| | |
|---|---|
| Key | [`/.well-known/pgp-key.txt`](https://altumptic.com/.well-known/pgp-key.txt) (also bundled at [`public/.well-known/pgp-key.txt`](public/.well-known/pgp-key.txt)) |
| Fingerprint | `117B A978 F332 80B5 12EE 84B5 D278 3C4F DE43 0CA6` |
| Type | Ed25519 / Cv25519 · expires 13 Oct 2028 |

Please include affected version, steps to reproduce and impact. We aim to acknowledge within 72 hours
and to agree a disclosure timeline with you. Preferred languages: English, Ukrainian.

Every LemonSees instance also serves this contact information at `/.well-known/security.txt`.

## Supported versions

| Version | Supported |
|---|---|
| 3.x | ✅ |
| < 3.0 | ❌ — please upgrade |

## Hardening notes for operators

- The engine binds to `127.0.0.1` by default. To expose the web UI on a network, set **both**
  `LEMONSEES_HOST` and a long random `LEMONSEES_TOKEN`; without a token LemonSees refuses to bind publicly.
- Put the web UI behind TLS (reverse proxy) and set `LEMONSEES_SECURE_COOKIE=1`.
- Prefer SSH keys over passwords; credentials are stored only on the machine running LemonSees.
