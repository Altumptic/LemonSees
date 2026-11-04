#![no_main]
use libfuzzer_sys::fuzz_target;
use lemonsees_core::auth::{analyze, AuthOpts};

fuzz_target!(|data: &[u8]| {
    let text = String::from_utf8_lossy(data);
    let o = AuthOpts { now_ms: 1_793_780_101_000, tz_offset_min: 120, max_ips: 64, ..AuthOpts::default() };
    let r = analyze(&text, &o);
    assert!(r.attackers.iter().map(|a| u64::from(a.count)).sum::<u64>() <= r.total);
});
