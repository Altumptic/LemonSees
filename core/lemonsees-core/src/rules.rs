//! Рушій правил виявлення.
//!
//! Правило = регулярний вираз + поріг + вікно часу (+ групування за IP чи користувачем). Усі правила хоста
//! компілюються в один `RegexSet`, тож журнал проходиться ОДИН раз незалежно від кількості правил.
//!
//! Семантика вікна: правило спрацьовує, якщо за останні `window_min` хвилин (до `now`) знайдено щонайменше
//! `threshold` збігів (для групування — в одній групі). Рядки без розпізнаної мітки часу вважаються «щойно»
//! (так поводились старі правила на основі `grep -c`). Мітки з майбутнього обрізаються до `now`.
//!
//! Безпека: регулярні вирази — лінійного часу (крейт `regex`), тож шаблон, написаний користувачем, і рядки журналу,
//! написані атакуючим, не можуть викликати ReDoS. Розмір скомпільованого автомата, довжина шаблону, кількість
//! правил, груп і рядків обмежені.

use crate::hash::{map, Map};
use crate::ip;
use crate::time::{parse_line_time, TimeCtx};
use crate::{clip, MAX_LINE_BYTES};
use regex::{RegexBuilder, RegexSet, RegexSetBuilder};
use serde::{Deserialize, Serialize};

/// Максимум правил у наборі.
pub const MAX_RULES: usize = 200;
/// Максимальна довжина шаблону, байти.
pub const MAX_PATTERN_BYTES: usize = 500;
const SIZE_LIMIT: usize = 2 << 20;
const SET_SIZE_LIMIT: usize = 16 << 20;
const MAX_TOP_GROUPS: usize = 10;

/// За чим групувати збіги.
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GroupBy {
    /// Без групування.
    #[default]
    None,
    /// За першою IP-адресою в рядку.
    Ip,
    /// За імʼям користувача (евристика: `user=`, `user X`, `for X`).
    User,
}

fn one() -> u32 {
    1
}
fn fifteen() -> u32 {
    15
}

/// Визначення правила.
#[derive(Debug, Clone, Deserialize)]
pub struct RuleDef {
    /// Ідентифікатор (до 64 байтів).
    pub id: String,
    /// Регулярний вираз (синтаксис крейта `regex`).
    pub pattern: String,
    /// Поріг збігів.
    #[serde(default = "one")]
    pub threshold: u32,
    /// Вікно, хвилини (1..=1440).
    #[serde(default = "fifteen")]
    pub window_min: u32,
    /// Групування.
    #[serde(default)]
    pub group_by: GroupBy,
    /// Ігнорувати регістр.
    #[serde(default)]
    pub ignore_case: bool,
}

/// Помилка компіляції правила.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct RuleError {
    /// Яке правило.
    pub rule_id: String,
    /// Що не так.
    pub message: String,
}

/// Скомпільований набір правил.
pub struct RuleSet {
    defs: Vec<RuleDef>,
    set: RegexSet,
}

/// Параметри виконання.
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct EvalOpts {
    /// Поточний час сервера, мс.
    pub now_ms: i64,
    /// Зсув зони сервера, хвилини.
    pub tz_offset_min: i32,
    /// Максимум рядків.
    pub max_lines: u64,
    /// Максимум груп на правило.
    pub max_groups: usize,
    /// Зерно хешера.
    pub seed: u64,
}

impl Default for EvalOpts {
    fn default() -> Self {
        Self { now_ms: 0, tz_offset_min: 0, max_lines: 5_000_000, max_groups: 10_000, seed: 0x9E37_79B9_7F4A_7C15 }
    }
}

/// Група збігів.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct GroupCount {
    /// Значення ключа групування.
    pub key: String,
    /// Збігів у вікні.
    pub count: u32,
}

/// Результат одного правила.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct RuleResult {
    /// Ідентифікатор правила.
    pub id: String,
    /// Усього збігів у наданому тексті.
    pub matches: u64,
    /// Збігів у вікні (усі групи).
    pub in_window: u64,
    /// Найбільша група у вікні (для `group_by = none` дорівнює `in_window`).
    pub top_group: u32,
    /// Чи досягнуто порогу.
    pub triggered: bool,
    /// Перший/останній збіг (мс), якщо відомий час.
    pub first_ms: Option<i64>,
    /// Останній збіг (мс).
    pub last_ms: Option<i64>,
    /// Найбільші групи у вікні.
    pub groups: Vec<GroupCount>,
    /// Збігів, що не помістились у ліміт груп.
    pub overflow: u64,
}

/// Загальний результат.
#[derive(Debug, Clone, Serialize, Default)]
pub struct EvalReport {
    /// По правилах (порядок як у наборі).
    pub results: Vec<RuleResult>,
    /// Розібрано рядків.
    pub lines: u64,
    /// Розбір зупинено через `max_lines`.
    pub truncated: bool,
}

fn err(id: &str, message: impl Into<String>) -> RuleError {
    RuleError { rule_id: id.to_string(), message: message.into() }
}

/// Компілює набір правил з усіма перевірками меж.
pub fn compile(defs: Vec<RuleDef>) -> Result<RuleSet, RuleError> {
    if defs.len() > MAX_RULES {
        return Err(err("", format!("too many rules (max {MAX_RULES})")));
    }
    let mut patterns = Vec::with_capacity(defs.len());
    for d in &defs {
        if d.id.is_empty() || d.id.len() > 64 {
            return Err(err(&d.id, "id must be 1..=64 bytes"));
        }
        if d.pattern.is_empty() || d.pattern.len() > MAX_PATTERN_BYTES {
            return Err(err(&d.id, format!("pattern must be 1..={MAX_PATTERN_BYTES} bytes")));
        }
        if d.threshold == 0 || d.threshold > 1_000_000 {
            return Err(err(&d.id, "threshold must be 1..=1000000"));
        }
        if d.window_min == 0 || d.window_min > 1440 {
            return Err(err(&d.id, "window_min must be 1..=1440"));
        }
        let p = if d.ignore_case { format!("(?i){}", d.pattern) } else { d.pattern.clone() };
        RegexBuilder::new(&p).size_limit(SIZE_LIMIT).dfa_size_limit(SIZE_LIMIT * 2).build().map_err(|e| err(&d.id, e.to_string()))?;
        patterns.push(p);
    }
    let set = RegexSetBuilder::new(&patterns).size_limit(SET_SIZE_LIMIT).dfa_size_limit(SET_SIZE_LIMIT).build().map_err(|e| err("", e.to_string()))?;
    Ok(RuleSet { defs, set })
}

/// Імʼя користувача в рядку (евристика).
pub fn extract_user(line: &str) -> Option<&str> {
    fn tok(s: &str) -> Option<&str> {
        s.split([' ', ';', ',']).next().filter(|t| !t.is_empty())
    }
    if let Some(i) = line.find("user=") {
        if let Some(t) = tok(&line[i + 5..]) {
            return Some(t);
        }
    }
    if let Some(i) = line.find("user ") {
        if let Some(t) = tok(&line[i + 5..]) {
            return Some(t);
        }
    }
    line.find(" for ").and_then(|i| tok(&line[i + 5..]))
}

#[derive(Default)]
struct Acc {
    matches: u64,
    first: Option<i64>,
    last: Option<i64>,
    overflow: u64,
}

impl RuleSet {
    /// Кількість правил.
    pub fn len(&self) -> usize {
        self.defs.len()
    }

    /// Чи набір порожній.
    pub fn is_empty(&self) -> bool {
        self.defs.is_empty()
    }

    /// Виконує правила над текстом журналу.
    pub fn evaluate(&self, text: &str, o: &EvalOpts) -> EvalReport {
        let ctx = TimeCtx { now_ms: o.now_ms, tz_offset_min: o.tz_offset_min };
        let n = self.defs.len();
        let mut accs: Vec<Acc> = (0..n).map(|_| Acc::default()).collect();
        let mut groups: Vec<Map<String, u32>> = (0..n).map(|i| map(o.seed.wrapping_add(i as u64))).collect();
        let mut rep = EvalReport::default();

        for raw in text.lines() {
            rep.lines += 1;
            if rep.lines > o.max_lines {
                rep.lines -= 1;
                rep.truncated = true;
                break;
            }
            let line = clip(raw.trim_end_matches('\r'), MAX_LINE_BYTES);
            if line.is_empty() {
                continue;
            }
            let hits = self.set.matches(line);
            if !hits.matched_any() {
                continue;
            }
            let ts = parse_line_time(line, &ctx);
            let at = ts.map_or(o.now_ms, |t| t.min(o.now_ms));
            for idx in hits.iter() {
                let d = &self.defs[idx];
                let a = &mut accs[idx];
                a.matches += 1;
                if let Some(t) = ts {
                    a.first = Some(a.first.map_or(t, |f| f.min(t)));
                    a.last = Some(a.last.map_or(t, |l| l.max(t)));
                }
                if at < o.now_ms - i64::from(d.window_min) * 60_000 {
                    continue;
                }
                let key = match d.group_by {
                    GroupBy::None => "",
                    GroupBy::Ip => ip::first_ip_in(line).unwrap_or(""),
                    GroupBy::User => extract_user(line).unwrap_or(""),
                };
                let g = &mut groups[idx];
                if let Some(c) = g.get_mut(key) {
                    *c += 1;
                } else if g.len() < o.max_groups {
                    g.insert(clip(key, 64).to_string(), 1);
                } else {
                    a.overflow += 1;
                }
            }
        }

        rep.results = self
            .defs
            .iter()
            .zip(accs)
            .zip(groups)
            .map(|((d, a), g)| {
                let in_window: u64 = g.values().map(|&c| u64::from(c)).sum::<u64>() + a.overflow;
                let mut list: Vec<GroupCount> = g.into_iter().map(|(key, count)| GroupCount { key, count }).collect();
                list.sort_by(|x, y| y.count.cmp(&x.count).then_with(|| x.key.cmp(&y.key)));
                let top = list.first().map_or(0, |x| x.count);
                list.truncate(MAX_TOP_GROUPS);
                let top_group = if d.group_by == GroupBy::None { in_window.min(u64::from(u32::MAX)) as u32 } else { top };
                RuleResult { id: d.id.clone(), matches: a.matches, in_window, top_group, triggered: top_group >= d.threshold, first_ms: a.first, last_ms: a.last, groups: list, overflow: a.overflow }
            })
            .collect();
        rep
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_793_780_101_000; // 2026-11-04T08:15:01Z

    fn def(id: &str, pattern: &str, threshold: u32, window_min: u32, group_by: GroupBy) -> RuleDef {
        RuleDef { id: id.into(), pattern: pattern.into(), threshold, window_min, group_by, ignore_case: false }
    }

    fn eval(defs: Vec<RuleDef>, text: &str) -> EvalReport {
        compile(defs).unwrap().evaluate(text, &EvalOpts { now_ms: NOW, tz_offset_min: 120, ..EvalOpts::default() })
    }

    const LOG: &str = "\
2026-11-04T10:14:00+0200 h sudo: pam_unix(sudo:auth): authentication failure; user=alice rhost=
2026-11-04T10:14:10+0200 h sudo:    bob : 3 incorrect password attempts ; TTY=pts/0
2026-11-04T10:14:20+0200 h sudo: pam_unix(sudo:auth): authentication failure; user=alice rhost=
2026-11-04T10:14:30+0200 h sudo: pam_unix(sudo:auth): authentication failure; user=alice rhost=
2026-11-04T08:00:00+0200 h sudo: pam_unix(sudo:auth): authentication failure; user=carol rhost=
2026-11-04T10:14:40+0200 h sshd[1]: Failed password for root from 203.0.113.9 port 22 ssh2
2026-11-04T10:14:41+0200 h sshd[1]: Failed password for root from 203.0.113.9 port 22 ssh2
2026-11-04T10:14:42+0200 h sshd[1]: Failed password for root from 198.51.100.1 port 22 ssh2
";

    #[test]
    fn threshold_and_trailing_window() {
        let r = eval(vec![def("sudo", "authentication failure", 3, 15, GroupBy::None)], LOG);
        let x = &r.results[0];
        assert_eq!(x.matches, 4);
        assert_eq!(x.in_window, 3, "carol's event is 2 h old and must fall outside the window");
        assert!(x.triggered);
        let r2 = eval(vec![def("sudo", "authentication failure", 4, 15, GroupBy::None)], LOG);
        assert!(!r2.results[0].triggered);
    }

    #[test]
    fn group_by_ip_triggers_per_group() {
        let r = eval(vec![def("ssh", "Failed password", 2, 15, GroupBy::Ip)], LOG);
        let x = &r.results[0];
        assert_eq!(x.in_window, 3);
        assert_eq!(x.top_group, 2);
        assert!(x.triggered);
        assert_eq!(x.groups[0], GroupCount { key: "203.0.113.9".into(), count: 2 });
        // той самий поріг на сумі НЕ мав би розрізняти джерела, а з групуванням 3 → одна група по 2
        let r3 = eval(vec![def("ssh", "Failed password", 3, 15, GroupBy::Ip)], LOG);
        assert!(!r3.results[0].triggered);
    }

    #[test]
    fn group_by_user() {
        let r = eval(vec![def("pam", "authentication failure", 3, 15, GroupBy::User)], LOG);
        assert_eq!(r.results[0].groups[0], GroupCount { key: "alice".into(), count: 3 });
        assert!(r.results[0].triggered);
    }

    #[test]
    fn many_rules_single_pass_and_ignore_case() {
        let mut d = def("ci", "FAILED PASSWORD", 1, 15, GroupBy::None);
        d.ignore_case = true;
        let r = eval(vec![d, def("sudo", "sudo:", 1, 15, GroupBy::None), def("none", "never-matches-xyz", 1, 15, GroupBy::None)], LOG);
        assert_eq!(r.results[0].matches, 3);
        assert_eq!(r.results[1].matches, 5);
        assert!(!r.results[2].triggered);
    }

    #[test]
    fn unparsable_time_counts_as_now() {
        let r = eval(vec![def("x", "boom", 2, 5, GroupBy::None)], "boom one\nboom two\n");
        assert!(r.results[0].triggered);
    }

    #[test]
    fn rejects_bad_rules() {
        let bad = |p: &str| compile(vec![def("r1", p, 1, 5, GroupBy::None)]).err().unwrap();
        assert_eq!(bad("(unclosed").rule_id, "r1");
        assert!(compile(vec![def("r", "", 1, 5, GroupBy::None)]).is_err());
        assert!(compile(vec![def("r", "x", 0, 5, GroupBy::None)]).is_err());
        assert!(compile(vec![def("r", "x", 1, 0, GroupBy::None)]).is_err());
        assert!(compile(vec![def("r", &"a".repeat(MAX_PATTERN_BYTES + 1), 1, 5, GroupBy::None)]).is_err());
        assert!(compile(vec![def("", "x", 1, 5, GroupBy::None)]).is_err());
        // розмір автомата обмежений: «вибухові» шаблони відхиляються, а не з'їдають памʼять
        assert!(compile(vec![def("big", r"(\w{50}){50}\w{200}", 1, 5, GroupBy::None)]).is_err());
        let many: Vec<RuleDef> = (0..=MAX_RULES).map(|i| def(&format!("r{i}"), "x", 1, 5, GroupBy::None)).collect();
        assert!(compile(many).is_err());
    }

    #[test]
    fn catastrophic_backtracking_pattern_is_linear() {
        // (a+)+$ експоненційний у backtracking-рушіях; тут має відпрацювати миттєво
        let rs = compile(vec![def("redos", "^(a+)+$", 1, 5, GroupBy::None)]).unwrap();
        let line = format!("{}!", "a".repeat(3000));
        let t = std::time::Instant::now();
        let rep = rs.evaluate(&line, &EvalOpts { now_ms: NOW, ..EvalOpts::default() });
        assert!(t.elapsed().as_millis() < 500, "took {:?}", t.elapsed());
        assert_eq!(rep.results[0].matches, 0);
    }

    #[test]
    fn caps_groups_and_lines() {
        let mut text = String::new();
        for i in 0..500 {
            text.push_str(&format!("hit from 10.0.{}.{}\n", i / 256, i % 256));
        }
        let rs = compile(vec![def("g", "hit", 1, 5, GroupBy::Ip)]).unwrap();
        let rep = rs.evaluate(&text, &EvalOpts { now_ms: NOW, max_groups: 100, max_lines: 400, ..EvalOpts::default() });
        assert!(rep.truncated);
        assert_eq!(rep.results[0].groups.len(), MAX_TOP_GROUPS);
        assert!(rep.results[0].overflow > 0);
    }
}
