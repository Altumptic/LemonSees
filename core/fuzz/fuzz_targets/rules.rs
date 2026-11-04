#![no_main]
use libfuzzer_sys::fuzz_target;
use lemonsees_core::rules::{compile, EvalOpts, GroupBy, RuleDef};

// Вхід: перший рядок — шаблон правила (довільний!), решта — журнал. Некоректні шаблони мають відхилятись, а не падати.
fuzz_target!(|data: &[u8]| {
    let text = String::from_utf8_lossy(data);
    let (pat, log) = text.split_once('\n').unwrap_or((&text, ""));
    let def = RuleDef { id: "f".into(), pattern: pat.into(), threshold: 1, window_min: 60, group_by: GroupBy::Ip, ignore_case: true };
    if let Ok(set) = compile(vec![def]) {
        let r = set.evaluate(log, &EvalOpts { now_ms: 1_793_780_101_000, tz_offset_min: 0, ..EvalOpts::default() });
        assert!(r.results[0].in_window <= r.results[0].matches);
    }
});
