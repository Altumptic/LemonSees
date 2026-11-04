//! Randomized robustness tests (deterministic seed, no extra dependencies).
//! Mutated and random input must never panic, and basic invariants must hold.
//! For coverage-guided fuzzing run `cargo fuzz` against the same entry points (see docs/ROADMAP.md).

use lemonsees_core::auth::{analyze, AuthOpts};
use lemonsees_core::fim::{diff, Baseline, DiffInput, Entry};
use lemonsees_core::rules::{compile, EvalOpts, GroupBy, RuleDef};
use lemonsees_core::time::{parse_line_time, TimeCtx};

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n.max(1) as u64) as usize
    }
}

const SEEDS: &[&str] = &[
    "2026-11-04T10:10:01+0200 srv sshd[10]: Invalid user admin from 203.0.113.9 port 40001 [preauth]",
    "2026-11-04T10:10:01+0200 srv sshd[10]: pam_unix(sshd:auth): authentication failure; logname= uid=0 euid=0 tty=ssh ruser= rhost=203.0.113.9 user=root",
    "Nov  4 10:11:00 srv sshd[11]: Failed password for invalid user test from 2001:db8::7 port 40002 ssh2",
    "Nov  4 10:14:00 srv sshd[14]: Accepted publickey for deploy from 10.0.0.5 port 50000 ssh2: ED25519 SHA256:xx",
    "203.0.113.5 - - [04/Nov/2026:10:15:01 +0200] \"GET / HTTP/1.1\" 200 12",
];

fn mutate(rng: &mut Rng, s: &str) -> String {
    let mut b: Vec<u8> = s.as_bytes().to_vec();
    for _ in 0..1 + rng.below(6) {
        match rng.below(5) {
            0 if !b.is_empty() => {
                let i = rng.below(b.len());
                b[i] = rng.next() as u8;
            }
            1 if !b.is_empty() => {
                let i = rng.below(b.len());
                b.truncate(i);
            }
            2 => {
                let i = rng.below(b.len() + 1);
                b.insert(i, b" \t:/[]=\"'\xC3\xA9\xE2\x82\xAC"[rng.below(14)]);
            }
            3 if !b.is_empty() => {
                let i = rng.below(b.len());
                b.remove(i);
            }
            _ => {
                let d = b.clone();
                b.extend_from_slice(&d);
            }
        }
    }
    String::from_utf8_lossy(&b).into_owned()
}

fn corpus(rng: &mut Rng, lines: usize) -> String {
    let mut out = String::new();
    for _ in 0..lines {
        let k = rng.below(SEEDS.len());
        out.push_str(&mutate(rng, SEEDS[k]));
        out.push('\n');
    }
    out
}

#[test]
fn auth_survives_mutated_logs_and_keeps_invariants() {
    let mut rng = Rng(0x1234_5678_9ABC_DEF1);
    for round in 0..300 {
        let n = 1 + rng.below(60);
        let text = corpus(&mut rng, n);
        let o = AuthOpts { now_ms: 1_793_780_101_000, tz_offset_min: 120, max_ips: 1 + rng.below(40), ..AuthOpts::default() };
        let r = analyze(&text, &o);
        assert!(r.attackers.windows(2).all(|w| w[0].count >= w[1].count), "round {round}: attackers must be sorted");
        assert!(r.attackers.iter().map(|a| u64::from(a.count)).sum::<u64>() <= r.total, "round {round}");
        assert!(r.attackers.len() as u32 <= r.unique_ips.max(r.attackers.len() as u32));
        assert!(r.lines <= text.lines().count() as u64);
    }
}

#[test]
fn rules_survive_mutated_logs() {
    let mut rng = Rng(0xDEAD_BEEF_CAFE_F00D);
    let defs = |g| vec![RuleDef { id: "a".into(), pattern: "Failed|Invalid user|[0-9]{1,3}(\\.[0-9]{1,3}){3}".into(), threshold: 2, window_min: 60, group_by: g, ignore_case: true }];
    for g in [GroupBy::None, GroupBy::Ip, GroupBy::User] {
        let set = compile(defs(g)).expect("valid rule");
        for _ in 0..200 {
            let n = 1 + rng.below(80);
            let text = corpus(&mut rng, n);
            let r = set.evaluate(&text, &EvalOpts { now_ms: 1_793_780_101_000, tz_offset_min: 120, max_groups: 1 + rng.below(20), ..EvalOpts::default() });
            let x = &r.results[0];
            assert!(x.in_window <= x.matches);
            assert!(u64::from(x.top_group) <= x.in_window);
        }
    }
}

#[test]
fn time_parser_never_panics_on_arbitrary_bytes() {
    let mut rng = Rng(42);
    let ctx = TimeCtx { now_ms: 1_793_780_101_000, tz_offset_min: -330 };
    for _ in 0..20_000 {
        let len = rng.below(80);
        let bytes: Vec<u8> = (0..len).map(|_| rng.next() as u8).collect();
        let s = String::from_utf8_lossy(&bytes);
        let _ = parse_line_time(&s, &ctx);
        let k = rng.below(SEEDS.len());
        let m = mutate(&mut rng, SEEDS[k]);
        let _ = parse_line_time(&m, &ctx);
    }
}

#[test]
fn fim_diff_is_consistent_on_random_snapshots() {
    let mut rng = Rng(7);
    let mk = |rng: &mut Rng, n: usize| -> Vec<Entry> {
        (0..n)
            .map(|_| Entry {
                path: format!("/etc/f{}", rng.below(30)),
                sha256: format!("h{}", rng.below(3)),
                mode: format!("{}", 600 + rng.below(2)),
                owner: "root".into(),
                missing: rng.below(8) == 0,
                ..Entry::default()
            })
            .collect()
    };
    for _ in 0..500 {
        let (nb, nc) = (rng.below(40), rng.below(40));
        let (b, c) = (mk(&mut rng, nb), mk(&mut rng, nc));
        let r = diff(&DiffInput { baseline: Some(Baseline { at: 1, files: b }), current: c.clone(), critical: vec!["/etc/f1*".into()], now_ms: 5 });
        assert!(r.critical_changed <= r.changed);
        assert!(r.files.len() >= c.len());
        let counted = r.files.iter().filter(|f| f.status == "modified" || f.status == "added").count() as u32;
        assert!(counted <= r.changed);
    }
}
