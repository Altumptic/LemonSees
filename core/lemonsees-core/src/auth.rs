//! Аналіз журналів SSH-автентифікації (journald / auth.log / secure).
//!
//! Що рахується. Одна невдала спроба пише до журналу до трьох рядків (`Invalid user …`, PAM `authentication failure`,
//! `Failed password …`). Тому «кількість спроб» на IP/користувача — це `max(Failed*, Invalid user, PAM)`, а не сума:
//! так одна спроба не рахується двічі, а сканери за ключовою автентифікацією (лише `Invalid user`) не губляться.
//!
//! Додатково: вікно часу, погодинна гістограма, IPv6, і виявлення «вдалий вхід після брутфорсу».
//!
//! Недовірений ввід: рядки обрізаються, кількість IP/користувачів обмежена, мапи сидовані (див. [`crate::hash`]).

use crate::hash::{map, Map};
use crate::ip;
use crate::time::{parse_line_time, TimeCtx};
use crate::{clip, MAX_LINE_BYTES};
use aho_corasick::{AhoCorasick, MatchKind};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

const MARKERS: [&str; 6] = ["Failed password for ", "Failed publickey for ", "Failed keyboard-interactive/pam for ", "Invalid user ", "Accepted ", "authentication failure"];
const K_FAILED: usize = 0;
const K_INVALID: usize = 1;
const K_PAM: usize = 2;
const MAX_USERS: usize = 50_000;
const MAX_USERS_PER_IP: usize = 50;
const MAX_USER_LEN: usize = 64;
const MAX_SUSPECTS: usize = 50;
const MAX_WINDOW_HOURS: usize = 168;

fn matcher() -> &'static AhoCorasick {
    static AC: OnceLock<AhoCorasick> = OnceLock::new();
    AC.get_or_init(|| AhoCorasick::builder().match_kind(MatchKind::LeftmostFirst).build(MARKERS).expect("static marker set is valid"))
}

/// Параметри аналізу.
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct AuthOpts {
    /// Поточний час сервера, мс (UTC).
    pub now_ms: i64,
    /// Зсув зони сервера, хвилини.
    pub tz_offset_min: i32,
    /// Вікно аналізу в годинах (0 — без вікна й без гістограми). Максимум 168.
    pub window_hours: u32,
    /// Скільки атакуючих IP повертати.
    pub top_attackers: usize,
    /// Скільки користувачів повертати.
    pub top_users: usize,
    /// Скільки джерел успішних входів повертати.
    pub top_accepted: usize,
    /// Скільки невдалих спроб з IP має передувати вдалому входу, щоб він вважався підозрілим.
    pub suspect_threshold: u32,
    /// Максимум рядків, що розбираються.
    pub max_lines: u64,
    /// Максимум різних IP в памʼяті.
    pub max_ips: usize,
    /// Зерно хешера (див. [`crate::hash`]).
    pub seed: u64,
}

impl Default for AuthOpts {
    fn default() -> Self {
        Self {
            now_ms: 0,
            tz_offset_min: 0,
            window_hours: 48,
            top_attackers: 50,
            top_users: 15,
            top_accepted: 10,
            suspect_threshold: 5,
            max_lines: 5_000_000,
            max_ips: 100_000,
            seed: 0x9E37_79B9_7F4A_7C15,
        }
    }
}

/// Атакуючий IP.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Attacker {
    /// Адреса.
    pub ip: String,
    /// Кількість спроб (див. модуль).
    pub count: u32,
    /// Рядків `Failed *`.
    pub failed: u32,
    /// Рядків `Invalid user`.
    pub invalid: u32,
    /// Рядків PAM `authentication failure`.
    pub pam: u32,
    /// Перша спроба (мс), якщо відомий час.
    pub first_ms: Option<i64>,
    /// Остання спроба (мс).
    pub last_ms: Option<i64>,
    /// Скільки різних імен користувачів пробував (до 50).
    pub users: u32,
    /// Адреса з внутрішньої мережі.
    pub private: bool,
}

/// Підібране імʼя користувача.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct UserCount {
    /// Імʼя (`(empty)` для порожнього).
    pub user: String,
    /// Кількість спроб.
    pub count: u32,
}

/// Джерело успішних входів.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Accepted {
    /// Адреса.
    pub ip: String,
    /// Кількість входів.
    pub count: u32,
    /// Останній вхід (мс).
    pub last_ms: Option<i64>,
    /// Останній користувач.
    pub user: String,
    /// Останній метод (`password`, `publickey`, …).
    pub method: String,
    /// Внутрішня адреса.
    pub private: bool,
}

/// Підозрілий вхід: успіх з IP, який перед тим багато разів невдало намагався.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Suspect {
    /// Адреса.
    pub ip: String,
    /// Користувач успішного входу.
    pub user: String,
    /// Метод.
    pub method: String,
    /// Час успішного входу (мс).
    pub accepted_ms: Option<i64>,
    /// Скільки спроб було до успіху.
    pub failures_before: u32,
}

/// Підсумок аналізу.
#[derive(Debug, Clone, Serialize, Default)]
pub struct AuthReport {
    /// Загальна кількість спроб (сума по IP).
    pub total: u64,
    /// Кількість різних IP з спробами (усіх, не лише top).
    pub unique_ips: u32,
    /// Топ атакуючих.
    pub attackers: Vec<Attacker>,
    /// Топ підібраних імен.
    pub users: Vec<UserCount>,
    /// Топ джерел успішних входів.
    pub accepted: Vec<Accepted>,
    /// Успішні входи після брутфорсу.
    pub suspects: Vec<Suspect>,
    /// Спроби по годинах, від найстарішої до найновішої (довжина = `window_hours`).
    pub hourly: Vec<u32>,
    /// Розібрано рядків усього.
    pub lines: u64,
    /// Рядків, що стали подіями.
    pub parsed: u64,
    /// Подій старіших за вікно.
    pub skipped_old: u64,
    /// Подій з IP, відкинутих через ліміт памʼяті.
    pub overflow: u64,
    /// Розбір зупинено через `max_lines`.
    pub truncated: bool,
}

#[derive(Default)]
struct IpStat {
    c: [u32; 3],
    first: Option<i64>,
    last: Option<i64>,
    users: Vec<String>,
}

impl IpStat {
    fn attempts(&self) -> u32 {
        self.c[0].max(self.c[1]).max(self.c[2])
    }
}

struct AccStat {
    count: u32,
    last: Option<i64>,
    user: String,
    method: String,
}

struct State {
    o: AuthOpts,
    wh: usize,
    ips: Map<String, IpStat>,
    users: Map<String, [u32; 3]>,
    acc: Map<String, AccStat>,
    suspects: Vec<Suspect>,
    hist: [Vec<u32>; 3],
    r: AuthReport,
}

fn label(u: &str) -> &str {
    if u.is_empty() {
        "(empty)"
    } else {
        clip(u, MAX_USER_LEN)
    }
}

/// `"<user> from <ip> …"` → (користувач, ip).
fn user_from_ip(rest: &str) -> Option<(&str, &str)> {
    let pos = rest.rfind(" from ")?;
    let tok = rest[pos + 6..].split(' ').next()?;
    ip::parse_ip(tok)?;
    Some((&rest[..pos], tok))
}

impl State {
    fn new(o: &AuthOpts) -> Self {
        let wh = (o.window_hours as usize).min(MAX_WINDOW_HOURS);
        Self {
            ips: map(o.seed),
            users: map(o.seed ^ 0xA5A5_A5A5_A5A5_A5A5),
            acc: map(o.seed ^ 0x5A5A_5A5A_5A5A_5A5A),
            suspects: Vec::new(),
            hist: [vec![0; wh], vec![0; wh], vec![0; wh]],
            r: AuthReport::default(),
            wh,
            o: o.clone(),
        }
    }

    fn bucket(&self, ts: Option<i64>) -> Option<usize> {
        if self.wh == 0 {
            return None;
        }
        let from = self.o.now_ms - self.wh as i64 * 3_600_000;
        let idx = (ts? - from) / 3_600_000;
        Some(idx.clamp(0, self.wh as i64 - 1) as usize)
    }

    fn bump(&mut self, kind: usize, ip: &str, user: Option<&str>, ts: Option<i64>) {
        let bucket = self.bucket(ts);
        if !self.ips.contains_key(ip) {
            if self.ips.len() >= self.o.max_ips {
                self.r.overflow += 1;
                return;
            }
            self.ips.insert(ip.to_string(), IpStat::default());
        }
        let u = user.map(label);
        let Some(s) = self.ips.get_mut(ip) else { return };
        s.c[kind] += 1;
        if let Some(t) = ts {
            s.first = Some(s.first.map_or(t, |f| f.min(t)));
            s.last = Some(s.last.map_or(t, |l| l.max(t)));
        }
        if let Some(u) = u {
            if s.users.len() < MAX_USERS_PER_IP && !s.users.iter().any(|x| x == u) {
                s.users.push(u.to_string());
            }
            if let Some(c) = self.users.get_mut(u) {
                c[kind] += 1;
            } else if self.users.len() < MAX_USERS {
                let mut c = [0u32; 3];
                c[kind] = 1;
                self.users.insert(u.to_string(), c);
            }
        }
        if let Some(b) = bucket {
            self.hist[kind][b] += 1;
        }
    }

    fn accepted(&mut self, ip: &str, user: &str, method: &str, ts: Option<i64>) {
        let before = self.ips.get(ip).map_or(0, IpStat::attempts);
        if before >= self.o.suspect_threshold && self.suspects.len() < MAX_SUSPECTS && !self.suspects.iter().any(|s| s.ip == ip && s.user == user) {
            self.suspects.push(Suspect { ip: ip.to_string(), user: label(user).to_string(), method: method.to_string(), accepted_ms: ts, failures_before: before });
        }
        if !self.acc.contains_key(ip) && self.acc.len() >= self.o.max_ips {
            self.r.overflow += 1;
            return;
        }
        let a = self.acc.entry(ip.to_string()).or_insert(AccStat { count: 0, last: None, user: String::new(), method: String::new() });
        a.count += 1;
        a.last = match (a.last, ts) {
            (Some(l), Some(t)) => Some(l.max(t)),
            (l, t) => l.or(t),
        };
        a.user = label(user).to_string();
        a.method = clip(method, 32).to_string();
    }

    fn line(&mut self, line: &str, ctx: &TimeCtx) {
        let Some(m) = matcher().find(line) else { return };
        if !line.contains("sshd") {
            return;
        }
        let rest = &line[m.end()..];
        let ts = parse_line_time(line, ctx);
        if self.wh > 0 {
            if let Some(t) = ts {
                if t < self.o.now_ms - self.wh as i64 * 3_600_000 {
                    self.r.skipped_old += 1;
                    return;
                }
            }
        }
        match m.pattern().as_usize() {
            0..=2 => {
                let rest = rest.strip_prefix("invalid user ").unwrap_or(rest);
                if let Some((u, ip)) = user_from_ip(rest) {
                    self.r.parsed += 1;
                    self.bump(K_FAILED, ip, Some(u), ts);
                }
            }
            3 => {
                if let Some((u, ip)) = user_from_ip(rest) {
                    self.r.parsed += 1;
                    self.bump(K_INVALID, ip, Some(u), ts);
                }
            }
            4 => {
                let Some(sp) = rest.find(' ') else { return };
                let Some(after) = rest[sp + 1..].strip_prefix("for ") else { return };
                if let Some((u, ip)) = user_from_ip(after) {
                    self.r.parsed += 1;
                    self.accepted(ip, u, &rest[..sp], ts);
                }
            }
            _ => {
                let Some(i) = line.find("rhost=") else { return };
                let tok = line[i + 6..].split(' ').next().unwrap_or("");
                if ip::parse_ip(tok).is_none() {
                    return;
                }
                let user = line.find(" user=").map(|j| line[j + 6..].split(' ').next().unwrap_or(""));
                self.r.parsed += 1;
                self.bump(K_PAM, tok, user.filter(|u| !u.is_empty()), ts);
            }
        }
    }

    fn finish(mut self) -> AuthReport {
        let mut atk: Vec<(&String, &IpStat)> = self.ips.iter().filter(|(_, s)| s.attempts() > 0).collect();
        atk.sort_by(|a, b| b.1.attempts().cmp(&a.1.attempts()).then_with(|| a.0.cmp(b.0)));
        self.r.unique_ips = atk.len() as u32;
        self.r.total = atk.iter().map(|(_, s)| u64::from(s.attempts())).sum();
        self.r.attackers = atk
            .iter()
            .take(self.o.top_attackers)
            .map(|(ip, s)| Attacker {
                ip: (*ip).clone(),
                count: s.attempts(),
                failed: s.c[K_FAILED],
                invalid: s.c[K_INVALID],
                pam: s.c[K_PAM],
                first_ms: s.first,
                last_ms: s.last,
                users: s.users.len() as u32,
                private: ip::parse_ip(ip).is_some_and(|a| ip::is_private(&a)),
            })
            .collect();

        let mut users: Vec<(&String, u32)> = self.users.iter().map(|(u, c)| (u, c[0].max(c[1]).max(c[2]))).collect();
        users.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
        self.r.users = users.into_iter().take(self.o.top_users).map(|(u, c)| UserCount { user: u.clone(), count: c }).collect();

        let mut acc: Vec<(&String, &AccStat)> = self.acc.iter().collect();
        acc.sort_by(|a, b| b.1.count.cmp(&a.1.count).then_with(|| a.0.cmp(b.0)));
        self.r.accepted = acc
            .into_iter()
            .take(self.o.top_accepted)
            .map(|(ip, a)| Accepted { ip: ip.clone(), count: a.count, last_ms: a.last, user: a.user.clone(), method: a.method.clone(), private: ip::parse_ip(ip).is_some_and(|x| ip::is_private(&x)) })
            .collect();

        self.r.suspects = std::mem::take(&mut self.suspects);
        self.r.hourly = (0..self.wh).map(|i| self.hist[0][i].max(self.hist[1][i]).max(self.hist[2][i])).collect();
        self.r
    }
}

/// Аналізує текст журналу.
pub fn analyze(text: &str, o: &AuthOpts) -> AuthReport {
    let ctx = TimeCtx { now_ms: o.now_ms, tz_offset_min: o.tz_offset_min };
    let mut st = State::new(o);
    for raw in text.lines() {
        st.r.lines += 1;
        if st.r.lines > o.max_lines {
            st.r.truncated = true;
            st.r.lines -= 1;
            break;
        }
        let line = clip(raw.trim_end_matches('\r'), MAX_LINE_BYTES);
        if line.len() >= 10 {
            st.line(line, &ctx);
        }
    }
    st.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-11-04T08:15:01Z
    const NOW: i64 = 1_793_780_101_000;

    fn opts() -> AuthOpts {
        AuthOpts { now_ms: NOW, tz_offset_min: 120, ..AuthOpts::default() }
    }

    const SAMPLE: &str = "\
2026-11-04T10:10:01+0200 srv sshd[10]: Invalid user admin from 203.0.113.9 port 40001
2026-11-04T10:10:01+0200 srv sshd[10]: pam_unix(sshd:auth): authentication failure; logname= uid=0 euid=0 tty=ssh ruser= rhost=203.0.113.9
2026-11-04T10:10:03+0200 srv sshd[10]: Failed password for invalid user admin from 203.0.113.9 port 40001 ssh2
2026-11-04T10:11:00+0200 srv sshd[11]: Failed password for root from 203.0.113.9 port 40002 ssh2
2026-11-04T10:11:02+0200 srv sshd[11]: Failed password for root from 203.0.113.9 port 40002 ssh2
2026-11-04T10:12:00+0200 srv sshd[12]: Failed password for root from 2001:db8::7 port 40003 ssh2
2026-11-04T10:13:00+0200 srv sshd[13]: Invalid user test from 198.51.100.4 port 1 [preauth]
2026-11-04T10:14:00+0200 srv sshd[14]: Accepted publickey for deploy from 10.0.0.5 port 50000 ssh2: ED25519 SHA256:xx
2026-11-04T10:14:30+0200 srv sshd[15]: Failed password for root from 203.0.113.9 port 40009 ssh2
2026-11-04T10:14:40+0200 srv sshd[15]: Failed password for root from 203.0.113.9 port 40009 ssh2
2026-11-04T10:15:00+0200 srv sshd[16]: Accepted password for root from 203.0.113.9 port 40010 ssh2
2026-11-04T10:15:01+0200 srv cron[99]: Accepted nothing from 1.2.3.4
2026-11-02T10:15:01+0200 srv sshd[17]: Failed password for root from 192.0.2.77 port 1 ssh2
";

    #[test]
    fn counts_attempts_without_double_counting() {
        let r = analyze(SAMPLE, &opts());
        let a = &r.attackers;
        // 203.0.113.9: invalid 1 / pam 1 / failed (1 + 2 + 2 + 1 = для invalid admin: 1; root: 2 + 2) = 5 → max = 5
        let first = a.iter().find(|x| x.ip == "203.0.113.9").unwrap();
        assert_eq!((first.failed, first.invalid, first.pam), (5, 1, 1));
        assert_eq!(first.count, 5);
        // IPv6 розпізнається
        assert_eq!(a.iter().find(|x| x.ip == "2001:db8::7").unwrap().count, 1);
        // сканер лише з "Invalid user"
        assert_eq!(a.iter().find(|x| x.ip == "198.51.100.4").unwrap().count, 1);
        // подія 2 дні тому — поза вікном 48 год (2026-11-02T10:15 за 46 год до now → у вікні!) перевіряємо окремо нижче
        assert_eq!(r.unique_ips as usize, a.len());
    }

    #[test]
    fn window_excludes_old_events() {
        let r = analyze(SAMPLE, &AuthOpts { window_hours: 24, ..opts() });
        assert!(r.attackers.iter().all(|x| x.ip != "192.0.2.77"));
        assert_eq!(r.skipped_old, 1);
        let r48 = analyze(SAMPLE, &opts());
        assert!(r48.attackers.iter().any(|x| x.ip == "192.0.2.77"));
    }

    #[test]
    fn detects_success_after_bruteforce() {
        let r = analyze(SAMPLE, &opts());
        assert_eq!(r.suspects.len(), 1, "{:?}", r.suspects);
        let s = &r.suspects[0];
        assert_eq!((s.ip.as_str(), s.user.as_str(), s.method.as_str()), ("203.0.113.9", "root", "password"));
        assert!(s.failures_before >= 5);
        // легітимний вхід з внутрішньої адреси не підозрілий
        assert!(r.accepted.iter().any(|a| a.ip == "10.0.0.5" && a.private));
        // рядок не від sshd ігнорується
        assert!(r.accepted.iter().all(|a| a.ip != "1.2.3.4"));
    }

    #[test]
    fn users_use_max_not_sum() {
        let r = analyze(SAMPLE, &opts());
        let root = r.users.iter().find(|u| u.user == "root").unwrap();
        assert_eq!(root.count, 6); // 4 (203.0.113.9) + 1 (IPv6) + 1 (192.0.2.77, 46 год тому — у вікні 48 год)
        let admin = r.users.iter().find(|u| u.user == "admin").unwrap();
        assert_eq!(admin.count, 1); // Invalid + PAM + Failed → одна спроба
    }

    #[test]
    fn hourly_histogram_has_window_length() {
        let r = analyze(SAMPLE, &opts());
        assert_eq!(r.hourly.len(), 48);
        assert_eq!(r.hourly.iter().sum::<u32>(), r.hourly.iter().copied().sum::<u32>());
        assert!(r.hourly[47] > 0, "recent events land in the newest bucket");
    }

    #[test]
    fn bsd_syslog_format() {
        let log = "Nov  4 10:11:00 srv sshd[1]: Failed password for root from 203.0.113.50 port 22 ssh2\nNov  4 10:11:01 srv sshd[1]: Failed password for root from 203.0.113.50 port 22 ssh2\n";
        let r = analyze(log, &opts());
        assert_eq!(r.attackers[0].count, 2);
        assert!(r.attackers[0].first_ms.is_some());
    }

    #[test]
    fn caps_and_garbage_do_not_panic() {
        let mut log = String::new();
        for i in 0..2000 {
            log.push_str(&format!("2026-11-04T10:10:01+0200 s sshd[1]: Failed password for u{i} from 10.{}.{}.{} port 1 ssh2\n", i / 65536, (i / 256) % 256, i % 256));
        }
        log.push_str("sshd Failed password for \u{0} from \n\n\r\nInvalid user \nAccepted \nauthentication failure rhost=\n");
        log.push_str(&"A".repeat(100_000));
        let r = analyze(&log, &AuthOpts { max_ips: 100, max_lines: 1500, ..opts() });
        assert!(r.truncated);
        assert!(r.attackers.len() <= 50);
        assert!(r.overflow > 0);
    }

    #[test]
    fn empty_user_is_labelled() {
        let log = "2026-11-04T10:10:01+0200 s sshd[1]: Invalid user  from 203.0.113.9 port 1 [preauth]\n";
        let r = analyze(log, &opts());
        assert_eq!(r.users[0].user, "(empty)");
    }
}
