# Privacy

This page says what data LemonSees handles, where it goes, and what you control. It describes the software, not a
service: **Altumptic operates no server that LemonSees talks to**, there are no accounts, and there is no telemetry.

It is a technical statement, not legal advice. If you monitor systems that hold other people's data, you decide how and
why, and you are responsible for doing it lawfully (see "Your responsibilities" below).

## The short version

- LemonSees runs on your machine or your own server. Your data stays there.
- Nothing is sent to Altumptic. There is no analytics, crash reporting or update check.
- The only network connections are the ones **you** set up or trigger. They are listed below, and the app shows them live
  under *System → Security & network*.
- Secrets (SSH passwords, passphrases, integration tokens) are encrypted at rest. SSH private keys are never copied: only
  their path is stored.

## What LemonSees reads from your servers

Over SSH, for the hosts you add, and only with the account you give it:

| Area | What is read | Used for |
|---|---|---|
| Metrics and processes | CPU, memory, disk, process list, listening ports, connections | Dashboard, endpoint view |
| Authentication logs | SSH login attempts (account names, source IP addresses, times) from journald or `auth.log`/`secure` | Threat view, rules, incidents |
| File integrity | SHA-256, size, mode, owner, modification time of a fixed list of system files | Integrity monitoring |
| SSH hygiene | Effective `sshd` settings; the public keys in `authorized_keys` (type, size, fingerprint, comment) and account names; times of key logins; re-read every 24 hours by default (a setting, 0 = off) so that changes can be detected | SSH hygiene page, incidents |
| Configuration and exposure | Settings that affect security (a lightweight, Lynis-style scan) | Posture and vulnerability pages |

The scans are read-only. Some commands use `sudo -n`, which works only if the account may run it without a password.

Log lines, usernames and key comments can contain personal data of other people (for example a person's name in a key
comment, or IP addresses of people who log in).

## Where the data is stored

On the machine that runs LemonSees, in its configuration directory (next to the program in portable mode, in your user
profile for the desktop app, or `SHOK_CONFIG_DIR` if set). The exact inventory, file modes and which files are encrypted
is in [security/SECURITY-NOTES.md](../security/SECURITY-NOTES.md#3-secrets--data-at-rest-psb-2223-6).

- Secrets are encrypted (AES-256-GCM). Operational data (incidents, audit log, baselines, parsed SSH hygiene results) is
  stored with restrictive file permissions but **not encrypted** at rest: use full-disk encryption. This is a documented
  exception (EX-001).
- The raw `authorized_keys` text is processed in memory and not stored. Only the parsed result is kept.
- The audit log is retained for a configurable number of days (*Settings → retention*), then pruned.
- UI preferences live in your browser's local storage and contain no secrets.
- **Import from `~/.ssh/config`** reads that one file on the machine that runs LemonSees, only when you open the import dialog. It lists host names, addresses, users, ports and key *paths*; it checks that key files exist but never opens them. Nothing is sent anywhere, and nothing is stored until you choose to add a host.

## Where the data can go

| Destination | What is sent | When |
|---|---|---|
| Your servers (SSH) | Commands that read data; terminal input you type | For hosts you add |
| `ipwho.is` | **Attacker** IP addresses, to look up country and ISP | Only if you turn on geo-IP. **Off by default.** That provider's own privacy policy applies. |
| `api.ipify.org` | Nothing about you except the request itself; it returns the public IP the servers see | Only when you press the check button |
| Your uptime URLs | An HTTP request | For monitors you add |
| Integrations (Datadog, Slack, Teams, Telegram, webhooks, Splunk, Elastic, Syslog, PagerDuty, Wazuh) | Incident and alert details, including host names and source IP addresses | Only for integrations you configure |

Everything above honours your proxy settings and the **kill switch**: if a proxy is configured and unavailable, outbound
connections fail instead of going out directly. Route through Tor or a SOCKS5/HTTP proxy to hide your own IP address from
the servers and services you contact.

## Your responsibilities

If you use LemonSees on systems that process personal data, you are the party that decides the purpose and means. In
practice, that means you should have a lawful basis and a legitimate purpose for monitoring, inform the people affected
where the law requires it, keep access to the LemonSees machine under control, and not keep data longer than needed (use
the retention setting and delete exports you no longer need).

When you export an SSH hygiene report, key comments are masked by default because they often contain names or email
addresses. Include them only if you need to.

## What Altumptic sees

- **The software:** nothing.
- **This repository:** GitHub processes visits, issues, discussions and downloads under
  [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
  Do not put server logs, IP addresses or secrets in issues. [TESTING.md](../TESTING.md) shows how to redact.

## Questions and changes

Questions: [GitHub Discussions](https://github.com/Altumptic/LemonSees/discussions). Security issues:
[SECURITY.md](../../SECURITY.md). This page changes in the same commit as the behaviour it describes; the history is in git.
