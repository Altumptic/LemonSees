#![no_main]
use libfuzzer_sys::fuzz_target;
use lemonsees_core::ssh::{judge, JudgeInput};

// Вхід — JSON як з Node; невалідний JSON відкидається. Оцінка не має панікувати на будь-яких даних.
fuzz_target!(|data: &[u8]| {
    if let Ok(input) = serde_json::from_slice::<JudgeInput>(data) {
        let r = judge(&input);
        assert!(r.hosts_scanned <= r.hosts_total);
    }
});
