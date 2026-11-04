//! WebAssembly-обгортка над `lemonsees-core`.
//!
//! Це ЄДИНИЙ крейт воркспейсу з `unsafe` — лише те, що потрібно для передачі байтів через межу WASM ↔ JS.
//! Вся логіка живе в безпечному `lemonsees-core`.
//!
//! ABI (усе — лінійна памʼять модуля):
//!   * `ls_alloc(len) -> ptr` / `ls_free(ptr, len)` — буфери для вхідних даних (виділяє й звільняє хост);
//!   * `ls_call(op, a_ptr, a_len, b_ptr, b_len) -> status` — виклик операції:
//!     `a` — параметри JSON (UTF-8), `b` — великий сирий текст журналу (UTF-8, може бути порожнім);
//!   * `ls_out_ptr() / ls_out_len()` — результат останнього виклику (JSON), діє до наступного виклику;
//!   * статуси: 0 — ок; 1 — невідома операція; 2 — некоректні параметри; 3 — помилка правила (у виводі `{rule_id, message}`).
//!
//! Операції: 1 = аналіз auth-журналу, 2 = виконання правил, 3 = FIM-diff, 4 = інформація про ядро, 5 = самоперевірка.
#![allow(unsafe_code)]

use lemonsees_core as core;
use std::cell::RefCell;

const OP_AUTH: u32 = 1;
const OP_RULES: u32 = 2;
const OP_FIM: u32 = 3;
const OP_INFO: u32 = 4;
const OP_SELFTEST: u32 = 5;

const OK: i32 = 0;
const E_OP: i32 = 1;
const E_PARAMS: i32 = 2;
const E_RULE: i32 = 3;

thread_local! {
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static RULES: RefCell<Option<(String, core::rules::RuleSet)>> = const { RefCell::new(None) };
}

fn set_out(bytes: Vec<u8>) {
    OUT.with(|o| *o.borrow_mut() = bytes);
}

fn ok_json<T: serde::Serialize>(v: &T) -> i32 {
    match serde_json::to_vec(v) {
        Ok(b) => {
            set_out(b);
            OK
        }
        Err(_) => fail(E_PARAMS, "serialization failed"),
    }
}

fn fail(code: i32, msg: &str) -> i32 {
    set_out(serde_json::to_vec(&serde_json::json!({ "message": msg })).unwrap_or_default());
    code
}

/// Виділяє буфер `len` байтів для хоста (точно `len`, тож `ls_free` коректно його поверне).
#[no_mangle]
pub extern "C" fn ls_alloc(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()).cast::<u8>()
}

/// Звільняє буфер, виділений `ls_alloc`.
///
/// # Safety
/// `ptr` і `len` мають точно збігатися з результатом і аргументом попереднього `ls_alloc`; повторний виклик заборонений.
#[no_mangle]
pub unsafe extern "C" fn ls_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
    }
}

/// Вказівник на результат останнього виклику.
#[no_mangle]
pub extern "C" fn ls_out_ptr() -> *const u8 {
    OUT.with(|o| o.borrow().as_ptr())
}

/// Довжина результату останнього виклику.
#[no_mangle]
pub extern "C" fn ls_out_len() -> usize {
    OUT.with(|o| o.borrow().len())
}

unsafe fn bytes<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if ptr.is_null() || len == 0 {
        &[]
    } else {
        std::slice::from_raw_parts(ptr, len)
    }
}

/// Виконує операцію.
///
/// # Safety
/// `a_ptr..a_ptr+a_len` і `b_ptr..b_ptr+b_len` мають бути валідними буферами, виділеними `ls_alloc` (або нульової довжини).
#[no_mangle]
pub unsafe extern "C" fn ls_call(op: u32, a_ptr: *const u8, a_len: usize, b_ptr: *const u8, b_len: usize) -> i32 {
    let params = bytes(a_ptr, a_len);
    let text = String::from_utf8_lossy(bytes(b_ptr, b_len));
    call(op, params, &text)
}

fn call(op: u32, params: &[u8], text: &str) -> i32 {
    match op {
        OP_AUTH => match serde_json::from_slice::<core::auth::AuthOpts>(params) {
            Ok(o) => ok_json(&core::auth::analyze(text, &o)),
            Err(e) => fail(E_PARAMS, &e.to_string()),
        },
        OP_RULES => rules(params, text),
        OP_FIM => match serde_json::from_slice::<core::fim::DiffInput>(params) {
            Ok(i) => ok_json(&core::fim::diff(&i)),
            Err(e) => fail(E_PARAMS, &e.to_string()),
        },
        OP_INFO => ok_json(&serde_json::json!({ "name": "lemonsees-core", "version": core::VERSION, "max_line_bytes": core::MAX_LINE_BYTES, "max_rules": core::rules::MAX_RULES })),
        OP_SELFTEST => selftest(),
        _ => fail(E_OP, "unknown operation"),
    }
}

#[derive(serde::Deserialize)]
struct RulesParams {
    rules: Vec<core::rules::RuleDef>,
    #[serde(flatten)]
    opts: core::rules::EvalOpts,
}

fn rules(params: &[u8], text: &str) -> i32 {
    let p: RulesParams = match serde_json::from_slice(params) {
        Ok(p) => p,
        Err(e) => return fail(E_PARAMS, &e.to_string()),
    };
    // Компіляція набору дорога — кешуємо останній (ключ — канонічний JSON правил)
    let key = serde_json::to_string(&p.rules.iter().map(|r| (&r.id, &r.pattern, r.threshold, r.window_min, r.group_by, r.ignore_case)).collect::<Vec<_>>()).unwrap_or_default();
    let hit = RULES.with(|c| c.borrow().as_ref().is_some_and(|(k, _)| *k == key));
    if !hit {
        match core::rules::compile(p.rules) {
            Ok(set) => RULES.with(|c| *c.borrow_mut() = Some((key, set))),
            Err(e) => {
                set_out(serde_json::to_vec(&e).unwrap_or_default());
                return E_RULE;
            }
        }
    }
    RULES.with(|c| match c.borrow().as_ref() {
        Some((_, set)) => ok_json(&set.evaluate(text, &p.opts)),
        None => fail(E_PARAMS, "rule set unavailable"),
    })
}

/// Самоперевірка після завантаження: детермінований мінімальний сценарій на всіх трьох модулях.
fn selftest() -> i32 {
    let log = "2026-11-04T10:10:01+0200 h sshd[1]: Failed password for root from 203.0.113.9 port 1 ssh2\n";
    let a = core::auth::analyze(log, &core::auth::AuthOpts { now_ms: 1_793_780_101_000, tz_offset_min: 120, ..Default::default() });
    let r =
        core::rules::compile(vec![core::rules::RuleDef { id: "t".into(), pattern: "Failed password".into(), threshold: 1, window_min: 60, group_by: core::rules::GroupBy::Ip, ignore_case: false }])
            .map(|s| s.evaluate(log, &core::rules::EvalOpts { now_ms: 1_793_780_101_000, tz_offset_min: 120, ..Default::default() }));
    let good = a.total == 1 && a.attackers.first().is_some_and(|x| x.ip == "203.0.113.9") && r.is_ok_and(|x| x.results[0].triggered) && core::fim::glob_match("/a/*", "/a/b");
    ok_json(&serde_json::json!({ "ok": good, "version": core::VERSION }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(op: u32, params: &str, text: &str) -> (i32, serde_json::Value) {
        let code = call(op, params.as_bytes(), text);
        let v = OUT.with(|o| serde_json::from_slice(&o.borrow()).unwrap());
        (code, v)
    }

    #[test]
    fn selftest_passes() {
        let (c, v) = run(OP_SELFTEST, "", "");
        assert_eq!(c, OK);
        assert_eq!(v["ok"], true);
    }

    #[test]
    fn auth_roundtrip_through_abi() {
        let (c, v) = run(OP_AUTH, r#"{"now_ms":1793780101000,"tz_offset_min":120}"#, "2026-11-04T10:10:01+0200 h sshd[1]: Failed password for root from 2001:db8::7 port 1 ssh2\n");
        assert_eq!(c, OK);
        assert_eq!(v["attackers"][0]["ip"], "2001:db8::7");
    }

    #[test]
    fn rules_cache_and_errors() {
        let p = r#"{"now_ms":1793780101000,"rules":[{"id":"a","pattern":"boom","threshold":2,"window_min":5}]}"#;
        assert_eq!(run(OP_RULES, p, "boom\nboom\n").1["results"][0]["triggered"], true);
        assert_eq!(run(OP_RULES, p, "boom\n").1["results"][0]["triggered"], false);
        let (c, v) = run(OP_RULES, r#"{"rules":[{"id":"bad","pattern":"(x"}]}"#, "");
        assert_eq!(c, E_RULE);
        assert_eq!(v["rule_id"], "bad");
    }

    #[test]
    fn bad_input_is_rejected_not_fatal() {
        assert_eq!(run(OP_AUTH, "not json", "").0, E_PARAMS);
        assert_eq!(run(OP_FIM, "1", "").0, E_PARAMS);
        assert_eq!(run(99, "", "").0, E_OP);
        assert_eq!(call(OP_AUTH, b"{}", "\u{0}\u{fffd}garbage").min(0), 0);
    }

    #[test]
    fn alloc_free_roundtrip() {
        let p = ls_alloc(1024);
        assert!(!p.is_null());
        unsafe { ls_free(p, 1024) };
    }
}
