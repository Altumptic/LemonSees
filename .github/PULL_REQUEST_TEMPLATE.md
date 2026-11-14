## What and why

<!-- One or two sentences. Link the issue: Fixes #123 -->

## How it was verified

- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run docs:check` passes (or `docs:map` was run)
- [ ] Rust changes: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` pass
- [ ] Tested by hand on a real or fake SSH host (describe below)

<!-- Describe what you ran and what you saw. -->

## Security impact

- [ ] No change to security-relevant code, **or** I added a negative test (the attack fails)
- [ ] Any new value that reaches a remote shell is quoted and validated (see AGENTS.md invariant 1)
- [ ] No new secrets in logs, URLs, responses or tests

## Docs and changelog

- [ ] `CHANGELOG.md` updated for user-visible changes
- [ ] User-visible strings added to `src/lib/i18n.ts` (EN at least)
- [ ] Documentation updated where behaviour changed
