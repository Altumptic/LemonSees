

---

### Verify this release

```bash
sha256sum -c SHA256SUMS --ignore-missing
cosign verify-blob SHA256SUMS --bundle SHA256SUMS.sigstore.json \
  --certificate-identity-regexp '^https://github\.com/Altumptic/LemonSees/\.github/workflows/release\.yml@refs/tags/v' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify <file> --repo Altumptic/LemonSees
```

Full guide: [docs/security/VERIFY.md](https://github.com/Altumptic/LemonSees/blob/main/docs/security/VERIFY.md) ·
Windows binaries are not Authenticode-signed (EX-003) — verify with the commands above.

`PSB-B` · `SIGNED (Sigstore)` · `ATTESTED` · `SBOM` · `NO-TELEMETRY` · `LOCAL-FIRST` · `FAIL-CLOSED` · `TOR-CAPABLE` · `AUDIT:NONE` · `DISCLOSURE:OK`
