# Design: SSH hygiene across the fleet

**Status:** designed, not implemented. Milestone M3 in the [roadmap](../ROADMAP.md).
**Owner:** maintainers. Changes to this design are made here, with the reason in the commit message.

## Problem

Small fleets accumulate SSH debt: root logins left enabled, password authentication on a host that should only accept
keys, keys copied between servers and never removed, and keys of people who left the team. Each server looks fine when
checked alone. The risk is visible only across the fleet.

Agent-based suites can report this, but they need an agent everywhere. LemonSees already connects to every host over SSH,
so it can answer the question with read-only commands.

## Goals

1. Show the **effective** sshd configuration for each host, not only the file on disk.
2. Inventory the keys that can log in to each host, per user, with fingerprints.
3. Show keys that are **duplicated** across hosts or users, **unknown** (not on the analyst's list), or **stale**.
4. For each finding, explain the risk in plain words and show the change to make. The analyst applies it.
5. Produce a dated report that can be shared.

## Non-goals

- Applying any change to a server. Remediation stays with the analyst.
- Installing software or agents on servers.
- Scanning hosts that the analyst has not added.
- Scoring against a compliance framework. Mapping to CIS or NIST controls can come later, as evidence only.
- Storing private keys. The tool only reads public keys and fingerprints.

## Data collected (read-only)

Each command runs over the existing SSH connection, with a timeout and an output cap.

| Data | Source | Notes |
|---|---|---|
| Effective sshd settings | `sshd -T` (fallback: parse `sshd_config` and `sshd_config.d/*`) | `sshd -T` needs root or the right to read the config; record which path was used |
| Login users with a home directory | `getent passwd`, filtered to real login shells | Only names and home paths are kept |
| Authorized keys per user | `authorized_keys` and `authorized_keys2` in each home directory, as configured by `AuthorizedKeysFile` | Read as far as the account can read; unreadable files are reported, not skipped silently |
| Last successful logins | Existing auth-log analysis (`core.auth`) | Used only for the stale-key check, when logs are available |

Key lines are reduced on the host to: key type, base64 length, fingerprint (SHA256) and comment. The full key blob is not
sent back, and the comment is shown only after redaction rules are applied (see Privacy).

## Findings

| Finding | Severity | Example text | Suggested change (shown, not applied) |
|---|---|---|---|
| Root login allowed | high | `PermitRootLogin yes` on web-01 | `PermitRootLogin no` (or `prohibit-password` if keys are required) |
| Password login allowed | high | `PasswordAuthentication yes` | `PasswordAuthentication no`, after confirming keys work |
| Empty passwords allowed | critical | `PermitEmptyPasswords yes` | `PermitEmptyPasswords no` |
| Same key on several hosts | medium | key `SHA256:…` on 4 hosts | Use a separate key per host, or per role |
| Same key used by several users | medium | key `SHA256:…` for `deploy` and `ops` | Give each person their own key |
| Unknown key | high | key on db-01 is not in the expected list | Confirm the owner; remove the key if nobody claims it |
| Stale key | low | key unused for 180 days (from auth log) | Confirm, then remove |
| Key without a comment | info | cannot tell whose key this is | Add an identifying comment |
| Unreadable authorized_keys | info | `/home/x/.ssh/authorized_keys` not readable with this account | Grant read access or accept the gap, and say so |

Severities are advice, not a score. The report explains each one; the analyst decides.

## Expected keys list

The analyst keeps a list of expected keys: fingerprint, owner, purpose, hosts allowed. Deviations from this list are
the main "unknown key" signal. The list lives in local configuration, like all other LemonSees data, and is exported with
the rest of the configuration.

## Privacy

- Usernames, hostnames and fingerprints stay on the analyst's machine, like all other data.
- Comments in keys often contain email addresses or names. They are shown in the UI, but the **exported report** masks
  them by default, with an option to include them.
- Nothing is sent to third parties, and there is no telemetry.

## Safety of the commands

- Every command is a fixed template in the code. The only variable parts are a user name and a path that the host itself
  reported; both are validated against the same rules as the other remote paths (quoting, no leading `-`, length limits).
- No command writes to the server. The implementation must never use `>`, `tee`, `sed -i`, `chmod`, or `ssh-keygen`
  against remote paths.
- Output is capped per host and per command. A host that returns megabytes of keys is reported as truncated.

## Phases

1. **Read-only sshd audit.** Effective settings per host, findings for root and password login, CSV and JSON export.
2. **Key inventory.** Keys per user and host, fingerprints, duplicates across the fleet.
3. **Expected keys.** The analyst's list, deviations as findings.
4. **Stale keys.** Correlate with successful logins from the auth log, when available.
5. **Report.** A dated, shareable hygiene report with masked comments by default.

Each phase ships on its own, with tests:

- Parsers for `sshd -T` output and `authorized_keys` lines, including options (`from=`, `command=`, `no-pty`) and
  malformed lines, as negative tests.
- A fleet test on the fake SSH host with one host of each finding.
- Confirmation that no command in the implementation writes to a server.

## Open questions

- Should the expected keys list be importable from a file in the repository, or only from the UI?
- How should keys that appear in `AuthorizedKeysFile` paths outside the home directory be shown?
- What is the right "stale" threshold by default: 90, 180 or 365 days?

These are decided before phase 3 starts.
