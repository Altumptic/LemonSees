# Validation on real servers

This page records how LemonSees behaves on real Linux servers. It is the evidence behind the claims in the README.

**Status: no results yet.** Until the first runs are published here, treat every claim about real-world accuracy as
unverified. The engine has been tested on synthetic logs and a fake SSH host only.

## Method

For each host:

1. Record the environment: distribution, kernel, OpenSSH version (`ssh -V`), where SSH logs live
   (journald, `auth.log`, `secure`), and timezone.
2. Count events in the raw logs for a fixed window (for example, the last 48 hours): failed logins, invalid users,
   successful logins, and PAM failures.
3. Count the same events in LemonSees for the same window.
4. Compare. Differences are issues. A difference is either a parsing bug, a window or timezone bug, or an intentional
   rule. Write down which.
5. Check file-integrity results for the critical paths listed in the README: is each change real?

Counts are compared exactly where the log is complete. Where the log rotated during the window, say so.

## Results

| Date | Distribution and version | OpenSSH | Log source | Window | Events in logs | Events in LemonSees | Difference and cause |
|---|---|---|---|---|---|---|---|

_No entries yet. See [TESTING.md](TESTING.md) to contribute a run._

## Known differences

None confirmed on real servers yet.

## What we measure next

- Time from install to the first useful screen.
- Accuracy of timestamp parsing for each distribution's default log format.
- Behaviour when the log is very large (a rotated, multi-gigabyte `auth.log`).
