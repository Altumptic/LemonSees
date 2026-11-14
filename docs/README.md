# LemonSees documentation

Start here. Pick the path that matches what you want to do.

## I want to use LemonSees

| Document | What it covers |
|---|---|
| [../README.md](../README.md) | What LemonSees is, who it is for, install options, quick start |
| [TESTING.md](TESTING.md) | Help us test on real servers and how to report results safely |
| [VALIDATION.md](VALIDATION.md) | Results from testing on real servers (status and open differences) |
| [security/VERIFY.md](security/VERIFY.md) | How to verify a release: checksums, Sigstore, provenance, SBOM |
| [security/THREAT-MODEL.md](security/THREAT-MODEL.md) | What LemonSees protects against, and what it does not |
| [security/SECURITY-NOTES.md](security/SECURITY-NOTES.md) | Security design, data inventory, known limits and exceptions |

## I want to contribute

| Document | What it covers |
|---|---|
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | How to propose, write and submit a change |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local setup, build, tests, Rust core, troubleshooting |
| [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Community standards |
| [../AGENTS.md](../AGENTS.md) | Map of the codebase and its invariants (also for AI coding tools) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the parts fit together: engine, core, UI, Electron |

## I want to know where the project is going

| Document | What it covers |
|---|---|
| [ROADMAP.md](ROADMAP.md) | Shipped, next, planned, considered, and out of scope |
| [features/ssh-hygiene.md](features/ssh-hygiene.md) | Design of the next major feature |
| [PERFORMANCE.md](PERFORMANCE.md) | Benchmarks, method, and honest limits |
| [../CHANGELOG.md](../CHANGELOG.md) | What changed in each release |

## I maintain or release LemonSees

| Document | What it covers |
|---|---|
| [RELEASE.md](RELEASE.md) | Versioning, release steps, what CI produces and signs |
| [ai/REPO_MAP.md](ai/REPO_MAP.md) | Generated file map (checked in CI) |
| [../SECURITY.md](../SECURITY.md) | How vulnerabilities are reported and handled |

## Conventions

- Documents describe the **current** behaviour. Plans live in the roadmap, designs in `features/`.
- Every claim about performance, security or coverage links to the method or the evidence.
- If a document and the code disagree, the code is right and the document is a bug: please open an issue.
