# Contributing to LemonSees

Thank you for helping. LemonSees is a security tool that runs commands on servers, so we hold changes to a higher
standard than a typical web app. This page explains how to get a change merged quickly.

Start with [AGENTS.md](AGENTS.md) (the map of the codebase and its invariants) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Ways to help, in order of impact

1. **Test on real servers** and report what differs from reality: see [docs/TESTING.md](docs/TESTING.md).
2. **Report bugs** with the bug form. Include the distribution, OpenSSH version and the log format (redacted).
3. **Propose features** that fit the principles in the [roadmap](docs/ROADMAP.md). Features that conflict with the
   principles (cloud accounts, telemetry, mandatory agents, auto-remediation) will be declined, however popular.
4. **Improve docs** and translations (`src/lib/i18n.ts`: the Ukrainian string is the key).
5. **Fix bugs** and implement accepted roadmap items.

For a non-trivial change, open a Discussion or an issue first, so that effort is not wasted.

## Development setup

```bash
npm ci
npm run build:core          # Rust core -> server/core/*.wasm (needs rustup, see docs/DEVELOPMENT.md)
npm test                    # must pass
npm run typecheck
npm run docs:check          # repo map is up to date (run npm run docs:map if it fails)
cd core && cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
```

Windows users: if Cargo linking fails on paths with spaces or non-ASCII characters, set `CARGO_TARGET_DIR` to an ASCII
path (see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)).

## Pull requests

- Branch from `main`. Keep a PR to one logical change.
- Use a clear title and fill in the PR template. Link the issue.
- Add or update tests. Security-relevant changes need a **negative** test (the attack must fail).
- Update `CHANGELOG.md` for user-visible changes and run `npm run docs:map` if you added or moved files.
- CI must be green: Rust (fmt, clippy, tests, wasm, `cargo audit`), fuzz, Node tests, build, CodeQL.

### Non-negotiable rules

These come from the security invariants in [AGENTS.md](AGENTS.md):

1. **Nothing reaches a remote shell unquoted or unvalidated.** Use the existing quoting helpers and allowlists.
   Reject leading `-`; use `--` or `-e` before user values.
2. **User-supplied regular expressions run only in the Rust `regex` engine** (linear time), never in JavaScript on
   untrusted logs.
3. **Bound every input**: lines, rows, groups, output size, connections.
4. **No secrets** in logs, URLs, responses or tests. Secrets belong in the vault.
5. **Honest labels.** Do not claim certification, audit status or performance you have not measured and documented.

Changes that touch these rules will get extra review. Please say in the PR how you verified them.

## Commit messages

We use short, imperative subjects, optionally with a scope: `fix(ssh): quote remote path`, `docs: add testing guide`.
Explain the *why* in the body when it is not obvious.

## Licensing of contributions

There is no CLA and no sign-off requirement. By opening a pull request you confirm that you wrote the change or have the
right to submit it, and that it is licensed under the project's license (see [LICENSE](LICENSE)). Do not copy code from
projects whose licence is incompatible with MIT. New dependencies must have a permissive licence: `npm run legal:check`
fails the build on an unknown or copyleft licence (GPL, LGPL, AGPL, MPL and similar).

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security issues

Do **not** open a public issue or PR for a vulnerability. Follow [SECURITY.md](SECURITY.md).
