#![no_main]
use libfuzzer_sys::fuzz_target;
use lemonsees_core::fim::{diff, DiffInput};

// Вхід — JSON як з Node-хоста; невалідний JSON просто відкидається.
fuzz_target!(|data: &[u8]| {
    if let Ok(input) = serde_json::from_slice::<DiffInput>(data) {
        let r = diff(&input);
        assert!(r.critical_changed <= r.changed);
    }
});
