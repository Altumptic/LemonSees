# SSH hygiene across the fleet

**Status:** implemented in v3.3.0 (beta). Not yet validated on a real fleet: see [VALIDATION.md](../VALIDATION.md).
**Owner:** maintainers. Changes to this design are made here, with the reason in the commit message.

## Problem

Small fleets accumulate SSH debt: root logins left enabled, password authentication on a host that should only accept
keys, keys copied between servers and never removed, and keys of people who left the team. Each server looks fine when
checked alone. The risk is visible only across the fleet.

Agent-based suites can report this, but they need an agent everywhere. LemonSees already connects to every host over SSH,
so it answers the question with read-only commands.

## What you get

Open **Endpoints · EDR → SSH hygiene** and press **Scan fleet**. You see:

- **Findings**, most severe first, each with a plain explanation and the change to make. The change is shown, never applied.
- **sshd settings** per host: `PermitRootLogin`, `PasswordAuthentication`, `PermitEmptyPasswords`, `MaxAuthTries`,
  `X11Forwarding`, and where the value came from.
- **Keys** per host and account: type, size, SHA-256 fingerprint, comment, when it was last used, and whether it is on your
  expected list.
- **Expected keys:** you mark the keys that should exist. From then on, any other key is a finding.
- **Export** of the report as Markdown, CSV or JSON. Key comments are masked unless you ask for them.

## Goals and non-goals

Goals: show the **effective** sshd configuration; inventory every key that can log in, with fingerprints; find
duplicated, unknown, weak and stale keys; explain each finding and show the fix; produce a dated, shareable report.

Non-goals: applying any change to a server; installing anything on servers; scanning hosts the analyst has not added;
scoring against a compliance framework; storing private keys (only public keys and fingerprints are read).

## How it works

Two steps, so that the expensive part runs once and the judgement can be repeated for free:

```
host (SSH, read-only)         Node engine                    Rust core (WebAssembly)
  keys script  ───────────►  parse markers  ───────────►  ssh_parse  (op 6)
  usage script ───────────►  usage lines    ───────────►    sshd settings, keys, fingerprints, last use
                                  │                              │ ParsedHost (no raw text)
                                  ▼                              ▼
                       config/ssh-hygiene.json  ◄──────  stored parsed hosts + expected keys
                                  │
                                  ▼
                              ssh_judge (op 7)  ───────►  Report: findings, shared keys, counts
```

1. **Scan** (`POST /api/hygiene/scan`): for each connected host, two scripts run over the existing SSH connection (with
   limited concurrency). The Rust core parses the raw output into a `ParsedHost`. Only the parsed result is stored; the raw
   `authorized_keys` text is not.
2. **Judge** (`GET /api/hygiene`): the stored hosts and your expected-keys list are evaluated by the core. Changing the
   expected list or the stale threshold re-evaluates instantly, with no new scan.

3. **Compare** (since v3.5.0): the new scan of a host is compared with the previous one (`server/hygienealerts.js`). A new key, or
   `PermitRootLogin`, `PasswordAuthentication` or `PermitEmptyPasswords` turning to `yes`, raises an incident and goes through
   notifications. The first scan is only a baseline. Nothing is compared after a failed or truncated scan, for accounts whose
   key file was unreadable, or when the settings came from different sources. A scan also runs on a schedule (*Settings → SOC*,
   default every 24 hours, 0 = off). A failed scan keeps the last good data for the next comparison.

The fingerprint is computed in the core (SHA-256 of the key blob, base64 without padding), as `ssh-keygen -l` does. Tests
compare it with `ssh-keygen` output for Ed25519, ECDSA and RSA keys.

## Data collected (read-only)

| Data | Source | Notes |
|---|---|---|
| Effective sshd settings | `sshd -T`; fallback: the `sshd_config.d/*.conf` files then `sshd_config` | With `sshd -T` all values are real. From files, OpenSSH defaults fill missing keys and are marked as defaults. |
| Login accounts | `getent passwd`, uid 0 or ≥ 1000, with a real shell and an absolute home | Only names and home paths are used. |
| Authorized keys | `~/.ssh/authorized_keys` and `authorized_keys2` of each account | Read up to 256 KiB per file; unreadable files are reported, not skipped silently. |
| Last use of keys | `Accepted publickey` lines from journald and `auth.log`/`secure` (up to 400 days) | The lines name the account and the key fingerprint. |
| Log history depth | Oldest sshd log line available | Needed to decide whether "stale" can be judged at all. |

`sudo -n` is used only when it works without a password (as in the file-integrity scan). Otherwise the scan reads what the
connecting account may read, and reports what it could not.

## Findings

| Code | Severity | Meaning | Suggested change (shown, not applied) |
|---|---|---|---|
| `EMPTY_PASSWORDS` | critical | `PermitEmptyPasswords yes` | `PermitEmptyPasswords no` |
| `ROOT_LOGIN` | high | `PermitRootLogin yes` | `PermitRootLogin no`, or `prohibit-password` |
| `PASSWORD_AUTH` | high | `PasswordAuthentication yes` | `PasswordAuthentication no`, after confirming keys work |
| `KEY_WEAK_RSA` | high | RSA key shorter than 2048 bits | Replace with Ed25519 |
| `KEY_DSA` | high | DSA key (deprecated) | Replace with Ed25519 |
| `KEY_UNKNOWN` | high | Key is not on the expected list (only when a list exists) | Find the owner; add it to the list or remove it |
| `KEY_WRONG_HOST` | high | Key is on the list but not allowed on this host | Remove it here, or widen its allowed hosts |
| `KEY_SHARED_USERS` | medium | One key authorised for several accounts | One key per account |
| `MAX_AUTH_TRIES` | low | `MaxAuthTries` above 6 | Lower to 4 or less |
| `KEY_STALE` | low | Not used for the threshold (default 180 days) | Confirm; remove if not needed |
| `X11_FORWARDING` | info | `X11Forwarding yes` | `X11Forwarding no` unless needed |
| `KEY_ON_MANY_HOSTS` | info | Same key on several hosts | Normal for one person's admin key; review if it is a shared service key |
| `KEY_NO_COMMENT` | info | Key without a comment | Add owner and purpose |
| `AUTHKEYS_UNREADABLE` | info | A file or home directory could not be read | Grant read access, or accept the gap |
| `SSHD_UNAVAILABLE` | info | No sshd configuration could be read | Scan with an account that may read it |
| `LOG_COVERAGE_SHORT` | info | Logs cover fewer days than the stale threshold | Keep logs longer |
| `HOST_UNSCANNED` | info | Host not connected or scan failed | Check the connection |

Severities are advice, not a score. The same key on several hosts is **info**, not a problem: one admin key everywhere is
normal. The same key under several accounts is **medium**, because logins can no longer be attributed to a person.

### How "stale" is decided

A key is reported stale only when the available logs reach back at least as far as the threshold. If the logs are shorter,
LemonSees says so (`LOG_COVERAGE_SHORT`) instead of guessing. "Not seen in the logs" is not proof that a key is unused, and
the finding says that.

## Expected keys

You keep a list of keys that should exist: fingerprint, owner, purpose, and optionally the hosts where each is allowed. It
lives in local configuration with the rest of the LemonSees data. With no list, the "unknown key" check is off and the page
says so. The UI offers **Mark as expected** next to every key.

## Privacy

- Usernames, hostnames and fingerprints stay on the analyst's machine. Nothing is sent to third parties; there is no telemetry.
- Key comments often contain names or email addresses. They are shown in the UI, and **masked in exports** by default.
- Only parsed results are stored. Raw `authorized_keys` text is processed in memory and discarded.

## Safety of the commands

- Both scripts are fixed templates. The only variable part is a one-time marker (nonce), generated per scan.
- The output markers contain that nonce, so the content of a file cannot forge them. A test covers this.
- No script writes to a server. A test fails if a script gains any write, delete, kill, network or key-generation command.
- Output is capped per file (256 KiB), per host (24 MiB for keys, 48 MiB for logs) and in the core (hosts, keys, findings).
- User names and paths come from the host itself and are only treated as data. They are never put into a shell command.

## HTTP API

All routes require an authenticated session.

| Method and path | Purpose |
|---|---|
| `GET /api/hygiene` | Current view: hosts, keys, expected list, and the judged report |
| `POST /api/hygiene/scan` | Scan all hosts, or `{ "hostIds": [...] }`. One scan at a time (409 otherwise). |
| `PUT /api/hygiene/expected` | Replace the expected list and optionally `staleDays` |
| `GET /api/hygiene/export?format=md\|csv\|json&comments=0\|1` | Download the report |

Audit-log entries: `hygiene.scan`, `hygiene.expected`, `hygiene.export`.

## Known limits

- **Only the global scope of sshd is evaluated.** `Match` blocks can override a value for some users or addresses; they are
  not evaluated. With `sshd -T` the settings are exact for the default context.
- **Default key files only.** Custom `AuthorizedKeysFile`, `AuthorizedKeysCommand`, certificate authorities and
  `AuthorizedPrincipalsFile` are not analysed yet.
- **`sshd -T` usually needs root.** Without root or passwordless sudo the settings come from the config files, which is
  less exact (defaults are marked), and other users' keys may be unreadable (reported).
- **Last use comes from logs.** It needs `Accepted publickey` lines in journald or `auth.log`/`secure`, and the
  `LogLevel` must be at least `INFO` (the default) for the key fingerprint to be logged.
- **POSIX shell and Linux only**, like the rest of LemonSees.
- **Needs the Rust core.** Without it the feature is off and says why; there is no slower fallback. This includes the change alerts and the scheduled scan.
- **Change alerts depend on the baseline.** A key added before the first scan is not "new". Removed keys and other setting changes are not alerted.
- **Not validated on a real fleet yet.** The scripts were run under a strict POSIX shell with stub commands, and the
  parsers are tested with real keys and fuzzed, but a run on real servers from several distributions is the next
  milestone ([ROADMAP.md](../ROADMAP.md)).

## Decisions taken while building

- **Key on several hosts is `info`, not `medium`.** The first design said "medium", which would flag every admin's
  personal key. The risky case is the same key under several accounts, which stays `medium`.
- **The expected list is edited in the UI only** for now. Importing it from a file is on the roadmap.
- **Stale threshold defaults to 180 days**, configurable from 7 to 3650.
- **Parsed results are stored, raw text is not**, so the judgement can be repeated without a scan and without keeping
  `authorized_keys` content on disk.

## Tests

- Core (Rust): parsers for `sshd -T`, config files with `Match` and defaults, `authorized_keys` lines with options and
  quoting, fingerprints against `ssh-keygen`, key sizes, usage matching, every finding, caps, and garbage input.
- Core: randomized robustness test and two `cargo-fuzz` targets (`ssh_keys`, `ssh_judge`), run in CI.
- Node: read-only guarantee for the scripts, nonce protection against forged markers, incomplete output, end to end
  through the core, unreachable hosts, expected-list validation, export masking and CSV formula neutralisation.
