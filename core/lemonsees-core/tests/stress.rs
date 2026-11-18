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

#[test]
fn ssh_parsers_survive_mutated_key_files() {
    use lemonsees_core::ssh::{judge, parse_host, HostEntry, JudgeInput, KeyFile, ParseInput};
    const KEYS: &[&str] = &[
        "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOsaPnH+kDs2S8IZea60Y+gd2+FeoTvbpM+ECev87Q4g alice@laptop",
        "from=\"10.0.0.0/8\",command=\"echo a b\",no-pty ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOsaPnH+kDs2S8IZea60Y+gd2+FeoTvbpM+ECev87Q4g x",
        "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBDPW7fodqxG5H2HDLpeq4YhvkOgUad3nxkxbSOlLG7OjRgFLxHhL/U+RrJ5INlM9SqrhHheDZnObyvKiUy5cY80= carol@ci",
        "PermitRootLogin yes\nPasswordAuthentication=no\nMatch User x\n  PasswordAuthentication yes",
    ];
    let mut rng = Rng(0xABCD_EF01_2345_6789);
    for _ in 0..400 {
        let mut text = String::new();
        for _ in 0..1 + rng.below(8) {
            let k = rng.below(KEYS.len());
            text.push_str(&mutate(&mut rng, KEYS[k]));
            text.push('\n');
        }
        let source = ["file", "sshd -T", "unavailable", "x"][rng.below(4)];
        let input = ParseInput {
            sshd_text: text.clone(),
            sshd_source: source.into(),
            keys: vec![KeyFile { user: "u".into(), path: "/p".into(), text: text.clone(), unreadable: rng.below(10) == 0, truncated: false }],
            oldest_line: mutate(&mut rng, SEEDS[0]),
            now_ms: 1_793_780_101_000,
            tz_offset_min: 0,
            seed: rng.next(),
        };
        let host = parse_host(&input, &text);
        assert!(host.keys.len() <= 20_000);
        let r = judge(&JudgeInput { hosts: vec![HostEntry { id: "h".into(), name: "h".into(), error: None, host }], expected: vec![], stale_days: rng.below(400) as u32, now_ms: 1_793_780_101_000 });
        assert!(r.keys_total >= r.unique_keys);
    }
}

/// Вхід, на якому перший запуск cargo-fuzz у CI впав (байти `0B C0`): `from_utf8_lossy` дає багатобайтовий U+FFFD.
/// Падала обгортка фаззера, а не ядро; цей тест фіксує, що ядро на такому вході працює, у т.ч. при поділі по межі символа.
#[test]
fn ssh_parsers_handle_replacement_characters() {
    use lemonsees_core::ssh::{judge, parse_host, HostEntry, JudgeInput, KeyFile, ParseInput};
    let text = String::from_utf8_lossy(&[0x0b, 0xc0]).into_owned();
    assert_eq!(text.len(), 4, "U+FFFD takes three bytes");
    for mid in 0..=text.len() {
        if !text.is_char_boundary(mid) {
            continue;
        }
        let (a, b) = text.split_at(mid);
        let input = ParseInput {
            sshd_text: a.into(),
            sshd_source: "file".into(),
            keys: vec![KeyFile { user: "u".into(), path: "/p".into(), text: a.into(), unreadable: false, truncated: false }],
            oldest_line: b.into(),
            now_ms: 1_793_780_101_000,
            tz_offset_min: 0,
            seed: 1,
        };
        let host = parse_host(&input, b);
        let r = judge(&JudgeInput { hosts: vec![HostEntry { id: "h".into(), name: "h".into(), error: None, host }], expected: vec![], stale_days: 0, now_ms: 1_793_780_101_000 });
        assert!(r.hosts_scanned <= r.hosts_total);
    }
}
