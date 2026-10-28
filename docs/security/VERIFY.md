# Verify a LemonSees release

Every release from **v3.1.0** ships with:

| File | What it proves |
|---|---|
| `SHA256SUMS` | checksums of every binary and archive |
| `SHA256SUMS.sigstore.json` | Sigstore signature of `SHA256SUMS`, made by the GitHub Actions release workflow of `Altumptic/LemonSees` (keyless, OIDC) |
| GitHub attestation | build provenance: which workflow, commit and runner produced each binary |
| `LemonSees-<v>-sbom.cdx.json` | CycloneDX SBOM of production dependencies |

Windows builds are **not Authenticode-signed** (see exception EX-003) — SmartScreen may warn. Verify with the steps below.

## 1. Checksums

```bash
sha256sum -c SHA256SUMS --ignore-missing
```

PowerShell:

```powershell
(Get-FileHash .\LemonSees-3.1.0-portable.exe -Algorithm SHA256).Hash.ToLower()
Select-String "portable.exe" .\SHA256SUMS
```

## 2. Signature of the checksums (Sigstore / cosign)

```bash
cosign verify-blob SHA256SUMS \
  --bundle SHA256SUMS.sigstore.json \
  --certificate-identity-regexp '^https://github\.com/Altumptic/LemonSees/\.github/workflows/release\.yml@refs/tags/v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

`Verified OK` means the checksums were signed by the release workflow of this repository for a version tag.

## 3. Build provenance (GitHub attestation)

```bash
gh attestation verify LemonSees-3.1.0-portable.exe --repo Altumptic/LemonSees
gh attestation verify LemonSees-3.1.0-x86_64.AppImage --repo Altumptic/LemonSees
```

## 4. Dependencies (SBOM)

```bash
jq '.components | length' LemonSees-3.1.0-sbom.cdx.json
```

Feed the SBOM to your scanner (e.g. `grype sbom:LemonSees-3.1.0-sbom.cdx.json`).

## 5. From source

```bash
git clone https://github.com/Altumptic/LemonSees.git && cd LemonSees
git checkout v3.1.0
npm ci && npm test && npm run build
```

Builds are not bit-for-bit reproducible yet (Electron packaging); the source build plus tests is the reference.
