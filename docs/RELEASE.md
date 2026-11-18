# Release process

Maintainers only. Contributors do not need this page.

## Versioning

Semantic versioning: `MAJOR.MINOR.PATCH`.

- **PATCH** — fixes and dependency updates with no behaviour change for users (example: v3.2.1 added the Windows
  installer that v3.2.0 was missing).
- **MINOR** — new features that keep existing behaviour and configuration working.
- **MAJOR** — changes that break configuration, data files, or the API.

While the project is in beta, a breaking change in a minor version is allowed only if the CHANGELOG says so at the top.

## Before tagging

1. `main` is green in CI (Rust, fuzz, Node tests, build, CodeQL, licence check).
2. `package.json` version is bumped; `npm run docs:map` and `npm run docs:check` pass.
3. `CHANGELOG.md` has a section `## vX.Y.Z — <short title>` at the top. The release notes are generated from that section.
4. New known limits are added to `docs/security/SECURITY-NOTES.md` if the release adds any.
5. If a Windows or macOS installer is touched, check the build locally or in a draft release.

## Cut the release

```bash
git tag -a vX.Y.Z -m "LemonSees vX.Y.Z"
git push origin vX.Y.Z
```

Pushing a `v*` tag runs `.github/workflows/release.yml`:

1. **gate** — Node tests, TypeScript typecheck and the critical-CVE audit (`npm audit --audit-level=critical`). The desktop and web jobs then build the Rust core and the UI.
2. **desktop** — Windows (installer, portable, zip), Linux (AppImage, deb, tarball), macOS (dmg and zip for x64 and arm64).
3. **web** — web tarball and the CycloneDX SBOM.
4. **publish** — `SHA256SUMS`, Sigstore keyless signature of the checksums, GitHub build provenance attestation, and a
   GitHub release with the CHANGELOG section as notes.

## Licences

`npm run build` writes `dist/THIRD-PARTY-LICENSES.txt` (full texts), which ends up in every installer and in the web bundle.
If a new dependency has an unknown or copyleft licence, the build and CI fail. After adding or updating dependencies run
`npm run legal` and commit `THIRD-PARTY-LICENSES.md`.

## After the release

- Check that every expected asset is present: `gh release view vX.Y.Z --json assets`.
- Verify one artifact yourself with [security/VERIFY.md](security/VERIFY.md).
- If an asset is missing, fix the workflow and cut a new PATCH version. Do not replace assets on an existing release.

## What is not signed yet

Windows binaries are not Authenticode-signed and macOS builds are not notarized (exception EX-003 in
[SECURITY-NOTES.md](security/SECURITY-NOTES.md)). Users verify with checksums, the Sigstore signature and the
attestation. When a code-signing certificate is available, this section changes and so does the notice in the README.
