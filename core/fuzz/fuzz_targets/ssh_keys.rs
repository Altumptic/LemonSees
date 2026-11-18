#![no_main]
use libfuzzer_sys::fuzz_target;
use lemonsees_core::ssh::{judge, parse_host, HostEntry, JudgeInput, KeyFile, ParseInput};

// Вхід: перша половина — authorized_keys і sshd_config, друга — журнал `Accepted publickey`. Паніки бути не може.
fuzz_target!(|data: &[u8]| {
    let text = String::from_utf8_lossy(data);
    let (a, b) = text.split_at(text.len() / 2);
    let a = a.to_string();
    let input = ParseInput {
        sshd_text: a.clone(),
        sshd_source: if data.first().is_some_and(|x| x % 2 == 0) { "file".into() } else { "sshd -T".into() },
        keys: vec![KeyFile { user: "u".into(), path: "/p".into(), text: a, unreadable: false, truncated: false }],
        oldest_line: b.lines().next().unwrap_or("").to_string(),
        now_ms: 1_793_780_101_000,
        tz_offset_min: 120,
        seed: 1,
    };
    let host = parse_host(&input, b);
    let rep = judge(&JudgeInput { hosts: vec![HostEntry { id: "h".into(), name: "h".into(), error: None, host }], expected: vec![], stale_days: 0, now_ms: 1_793_780_101_000 });
    assert!(rep.hosts_scanned <= rep.hosts_total);
});
