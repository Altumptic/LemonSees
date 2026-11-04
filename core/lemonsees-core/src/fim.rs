//! Контроль цілісності файлів: порівняння знімка з базовою лінією.
//!
//! Знімок збирається на сервері (`sha256sum` + `stat`), порівняння виконується тут — тож перевірка тисяч файлів
//! не навантажує сервер і однакова на всіх платформах.
//!
//! Семантика статусів (стабільна, перенесена зі старої JS-реалізації):
//!   `ok` — без змін; `modified` — змінився вміст, права або власник; `added` — зʼявився після базової лінії;
//!   `missing` — зник (або недоступний); `new` — базової лінії ще немає.
//! Новий вміст рахується зміненим лише коли ОБИДВА хеші відомі: хеш `?` означає «не вдалося прочитати»
//! (наприклад, немає `sudo`) і не є доказом зміни.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Максимум записів, що порівнюються з кожного боку.
pub const MAX_ENTRIES: usize = 200_000;

/// Запис про файл.
#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(default)]
pub struct Entry {
    /// Абсолютний шлях.
    pub path: String,
    /// SHA-256 (hex) або `?`.
    pub sha256: String,
    /// Розмір, байти.
    pub size: u64,
    /// Права (вісімково, як `644`).
    pub mode: String,
    /// Власник.
    pub owner: String,
    /// Час зміни, мс.
    pub mtime: i64,
    /// Файл відсутній.
    pub missing: bool,
}

/// Базова лінія.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Baseline {
    /// Коли знята, мс.
    pub at: i64,
    /// Файли.
    pub files: Vec<Entry>,
}

/// Вхід порівняння.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct DiffInput {
    /// Базова лінія (немає — перший запуск).
    pub baseline: Option<Baseline>,
    /// Поточний знімок.
    pub current: Vec<Entry>,
    /// Шаблони критичних шляхів (`*` — будь-що крім `/`; суфікс `/**` — усе піддерево).
    pub critical: Vec<String>,
    /// Поточний час, мс (потрапляє у звіт).
    pub now_ms: i64,
}

/// Результат по файлу.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FileDiff {
    /// Шлях.
    pub path: String,
    /// SHA-256.
    pub sha256: String,
    /// Розмір.
    pub size: u64,
    /// Права.
    pub mode: String,
    /// Власник.
    pub owner: String,
    /// Час зміни.
    pub mtime: i64,
    /// Статус.
    pub status: &'static str,
    /// Що саме змінилось: `content`, `mode`, `owner`.
    pub kinds: Vec<&'static str>,
    /// Шлях входить до критичних.
    pub critical: bool,
}

/// Звіт.
#[derive(Debug, Clone, Serialize, Default)]
pub struct DiffReport {
    /// Час базової лінії.
    pub baseline_at: Option<i64>,
    /// Час перевірки.
    pub at: i64,
    /// Файли.
    pub files: Vec<FileDiff>,
    /// Кількість змін (modified + added + нові зникнення).
    pub changed: u32,
    /// З них — у критичних шляхах.
    pub critical_changed: u32,
    /// Вхід обрізано через [`MAX_ENTRIES`].
    pub truncated: bool,
}

/// Порівняння шляху з шаблоном (`*` не перетинає `/`, `/**` — піддерево).
pub fn glob_match(pattern: &str, path: &str) -> bool {
    if let Some(prefix) = pattern.strip_suffix("**") {
        return path.starts_with(prefix);
    }
    let (p, s) = (pattern.as_bytes(), path.as_bytes());
    let (mut pi, mut si) = (0usize, 0usize);
    let mut star: Option<(usize, usize)> = None;
    while si < s.len() {
        if pi < p.len() && p[pi] == b'*' {
            star = Some((pi, si));
            pi += 1;
        } else if pi < p.len() && p[pi] == s[si] {
            pi += 1;
            si += 1;
        } else if let Some((sp, ss)) = star {
            if s[ss] == b'/' {
                return false;
            }
            pi = sp + 1;
            si = ss + 1;
            star = Some((sp, ss + 1));
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == b'*' {
        pi += 1;
    }
    pi == p.len()
}

fn known(h: &str) -> bool {
    !h.is_empty() && h != "?"
}

/// Порівнює знімок із базовою лінією.
pub fn diff(input: &DiffInput) -> DiffReport {
    let mut rep = DiffReport { at: input.now_ms, baseline_at: input.baseline.as_ref().map(|b| b.at), ..DiffReport::default() };
    let current = if input.current.len() > MAX_ENTRIES {
        rep.truncated = true;
        &input.current[..MAX_ENTRIES]
    } else {
        &input.current[..]
    };
    let base: HashMap<&str, &Entry> = input.baseline.as_ref().map(|b| b.files.iter().take(MAX_ENTRIES).map(|e| (e.path.as_str(), e)).collect()).unwrap_or_default();
    let has_base = input.baseline.is_some();
    let is_critical = |p: &str| input.critical.iter().any(|g| glob_match(g, p));

    let mut seen: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for f in current {
        seen.insert(f.path.as_str());
        let b = base.get(f.path.as_str()).copied();
        let mut kinds: Vec<&'static str> = Vec::new();
        let status = if !has_base {
            if f.missing {
                "missing"
            } else {
                "new"
            }
        } else if f.missing {
            "missing" // чи це нова зміна, вирішує `changed` нижче: зник раніше й досі відсутній — не зміна
        } else if b.is_none_or(|b| b.missing) {
            "added"
        } else {
            let b = b.expect("checked above");
            if known(&b.sha256) && known(&f.sha256) && b.sha256 != f.sha256 {
                kinds.push("content");
            }
            if b.mode != f.mode {
                kinds.push("mode");
            }
            if b.owner != f.owner {
                kinds.push("owner");
            }
            if kinds.is_empty() {
                "ok"
            } else {
                "modified"
            }
        };
        let changed = has_base && (status == "modified" || status == "added" || (status == "missing" && b.is_some_and(|b| !b.missing)));
        let critical = is_critical(&f.path);
        if changed {
            rep.changed += 1;
            if critical {
                rep.critical_changed += 1;
            }
        }
        rep.files.push(FileDiff { path: f.path.clone(), sha256: f.sha256.clone(), size: f.size, mode: f.mode.clone(), owner: f.owner.clone(), mtime: f.mtime, status, kinds, critical });
    }
    if has_base {
        let mut gone: Vec<&&Entry> = base.values().filter(|b| !seen.contains(b.path.as_str()) && !b.missing).collect();
        gone.sort_by(|a, b| a.path.cmp(&b.path));
        for b in gone {
            let critical = is_critical(&b.path);
            rep.changed += 1;
            if critical {
                rep.critical_changed += 1;
            }
            rep.files.push(FileDiff {
                path: b.path.clone(),
                sha256: b.sha256.clone(),
                size: b.size,
                mode: b.mode.clone(),
                owner: b.owner.clone(),
                mtime: b.mtime,
                status: "missing",
                kinds: Vec::new(),
                critical,
            });
        }
    }
    rep
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(path: &str, sha: &str, mode: &str, owner: &str) -> Entry {
        Entry { path: path.into(), sha256: sha.into(), mode: mode.into(), owner: owner.into(), ..Entry::default() }
    }

    fn input(base: Option<Vec<Entry>>, cur: Vec<Entry>) -> DiffInput {
        DiffInput { baseline: base.map(|files| Baseline { at: 1, files }), current: cur, critical: vec!["/etc/shadow".into(), "/etc/sudoers.d/*".into(), "/root/**".into()], now_ms: 9 }
    }

    fn status(r: &DiffReport, p: &str) -> &'static str {
        r.files.iter().find(|f| f.path == p).unwrap().status
    }

    #[test]
    fn classifies_changes() {
        let base = vec![e("/etc/a", "1", "644", "root"), e("/etc/b", "2", "644", "root"), e("/etc/shadow", "3", "640", "root"), e("/etc/m", "4", "644", "root")];
        let cur = vec![e("/etc/a", "X", "644", "root"), e("/etc/c", "9", "644", "root"), e("/etc/shadow", "3", "666", "root"), e("/etc/m", "4", "644", "root")];
        let r = diff(&input(Some(base), cur));
        assert_eq!(status(&r, "/etc/a"), "modified");
        assert_eq!(status(&r, "/etc/c"), "added");
        assert_eq!(status(&r, "/etc/b"), "missing");
        assert_eq!(status(&r, "/etc/m"), "ok");
        let shadow = r.files.iter().find(|f| f.path == "/etc/shadow").unwrap();
        assert_eq!(shadow.kinds, vec!["mode"]);
        assert!(shadow.critical);
        assert_eq!(r.changed, 4);
        assert_eq!(r.critical_changed, 1);
    }

    #[test]
    fn unreadable_hash_is_not_a_change() {
        let r = diff(&input(Some(vec![e("/etc/shadow", "abc", "640", "root")]), vec![e("/etc/shadow", "?", "640", "root")]));
        assert_eq!(status(&r, "/etc/shadow"), "ok");
        assert_eq!(r.changed, 0);
    }

    #[test]
    fn first_run_has_no_changes() {
        let r = diff(&input(None, vec![e("/etc/a", "1", "644", "root"), Entry { path: "/etc/gone".into(), missing: true, ..Entry::default() }]));
        assert_eq!(status(&r, "/etc/a"), "new");
        assert_eq!(status(&r, "/etc/gone"), "missing");
        assert_eq!((r.changed, r.baseline_at), (0, None));
    }

    #[test]
    fn missing_before_and_now_is_not_a_change() {
        let gone = Entry { path: "/etc/x".into(), missing: true, ..Entry::default() };
        let r = diff(&input(Some(vec![gone.clone()]), vec![gone]));
        assert_eq!(status(&r, "/etc/x"), "missing");
        assert_eq!(r.changed, 0);
    }

    #[test]
    fn glob_rules() {
        assert!(glob_match("/etc/shadow", "/etc/shadow"));
        assert!(glob_match("/etc/sudoers.d/*", "/etc/sudoers.d/90-cloud"));
        assert!(!glob_match("/etc/sudoers.d/*", "/etc/sudoers.d/x/y"));
        assert!(glob_match("/root/**", "/root/.ssh/authorized_keys"));
        assert!(glob_match("/etc/*.conf", "/etc/a.conf"));
        assert!(!glob_match("/etc/*.conf", "/etc/a.confx"));
        assert!(!glob_match("/etc/shadow", "/etc/shadow-"));
        assert!(glob_match("*", "abc") && !glob_match("*", "a/b"));
    }

    #[test]
    fn handles_large_input_and_caps() {
        let cur: Vec<Entry> = (0..MAX_ENTRIES + 10).map(|i| e(&format!("/f/{i}"), "h", "644", "root")).collect();
        let r = diff(&input(None, cur));
        assert!(r.truncated);
        assert_eq!(r.files.len(), MAX_ENTRIES);
    }
}
