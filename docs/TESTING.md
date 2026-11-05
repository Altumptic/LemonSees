# Help us test LemonSees (beta)

LemonSees has been tested on synthetic logs and a fake SSH host. What we need most is a run on **real** Linux servers,
because real logs look different from ours: different distributions, syslog setups and time formats.

## What a useful test looks like

1. Run LemonSees on your own machine (portable build, AppImage, `.dmg`, or `npm start`).
2. Add one or two of your servers over SSH with a read-only account. Nothing is installed on them.
3. Let it run for a day. Check: are the attacker list, the failed/successful logins and the file-integrity list correct?
4. Report what you saw, even if it was "nothing happened" — that is a result too.

Time from install to the first useful screen is one of the things we want to measure. Please note roughly how long it
took.

## What to report

Open an issue with the details below. Please **do not** attach raw logs or real IP addresses.

- Distribution and version (`cat /etc/os-release`), OpenSSH version (`ssh -V`).
- Whether logs come from journald, `/var/log/auth.log`, `/var/log/secure`, or elsewhere.
- Expected vs. actual, e.g. "10 failed logins in auth.log, LemonSees shows 7".
- The timestamp format of a few lines, with IPs and usernames replaced by `X`.
- Screenshots of the relevant screen, with real data blurred.

## Never share

- Passwords, tokens, private keys, `known_hosts` contents, vault files, the audit log.
- Unredacted IP addresses or usernames from your fleet.
- Anything from a production system you are not allowed to share.

If you are not sure, describe the shape of the data instead of pasting it.

## Known limits (beta)

- Designed for small fleets (roughly 3–30 servers). Larger fleets are not tested.
- File-integrity checks are periodic sweeps, not real-time.
- No independent security audit has been done yet (`AUDIT:NONE`).
- Windows and macOS builds are not signed by a certificate authority; see [VERIFY.md](security/VERIFY.md).

Security issues: do not open a public issue. Follow [SECURITY.md](../SECURITY.md).
