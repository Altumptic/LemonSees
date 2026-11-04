#![no_main]
use libfuzzer_sys::fuzz_target;
use lemonsees_core::time::{parse_line_time, TimeCtx};

fuzz_target!(|data: &[u8]| {
    let s = String::from_utf8_lossy(data);
    let _ = parse_line_time(&s, &TimeCtx { now_ms: 1_793_780_101_000, tz_offset_min: -330 });
});
