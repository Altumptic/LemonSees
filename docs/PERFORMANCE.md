# Performance (measured, reproducible)

Run `npm run build:core && npm run bench`. Numbers below: Node 22.14, Intel i5-12450H (12 threads), Windows 11, 1,000,000 synthetic sshd lines (95 MiB), median of 5 runs after warm-up, one core, in-process. They vary run to run by ±20 % on a desktop machine.

| Test | Median | Throughput |
|---|---|---|
| auth analysis, naive JS (one RegExp per line + Map) | ~1.6–2.0 s | ~0.5–0.6 M lines/s |
| auth analysis, Rust/WASM core | ~1.5–1.6 s | ~0.6–0.7 M lines/s |
| rules: 1 rule, `group_by ip` | ~1.0 s | ~1.0 M lines/s |
| rules: 50 rules in one pass | ~1.0 s | ~1.0 M lines/s |
| FIM diff, 50k files | 0.4–1.1 s (noisy) | — |

## Honest reading
- The core is **not dramatically faster than a well-written JS parser** for auth analysis (×1.1–1.3 here; the corpus has ~1M unique IPs, which stresses the per-IP map and the `max_ips` cap). Moving 95 MiB across the WASM boundary alone costs ~0.16 s.
- What the core *does* buy: **50 rules cost the same as 1** (single-pass `RegexSet`), **linear-time regex** (a `^(a+)+$` pattern cannot stall the engine — covered by a test), hard caps against memory blow-up, identical semantics on every platform, and no regex execution on the monitored host.
- The remaining time is dominated by per-line timestamp parsing and hashing (SipHash is kept on purpose for HashDoS resistance). Known next steps are in [ROADMAP.md](ROADMAP.md).
- Real-world latency of a threat sweep is dominated by SSH transfer of the log text, not by parsing.
- This is **not** a comparison with Wazuh. Wazuh is a distributed agent/manager/indexer platform; LemonSees is an agentless single-operator tool. No claim of equal capacity is made.
