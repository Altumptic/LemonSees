//! SSH-гігієна парку: розбір `sshd -T`, `authorized_keys`, використання ключів у журналі та оцінка по всьому парку.
//!
//! Два кроки (див. docs/features/ssh-hygiene.md):
//!   1. [`parse_host`] — сирий вивід одного хоста → [`ParsedHost`] (налаштування sshd, ключі з відбитками SHA-256,
//!      час останнього входу кожним ключем). Це дорогий крок, виконується під час сканування. Результат можна зберегти
//!      без сирого тексту.
//!   2. [`judge`] — усі `ParsedHost` + список очікуваних ключів → [`Report`] зі знахідками. Крок дешевий і чистий:
//!      його можна повторити після зміни списку очікуваних ключів без нового сканування.
//!
//! Принципи: ядро нічого не читає і не пише (час і тексти передає хост), усе обмежене лімітами, відбиток ключа
//! рахується тут (SHA-256 від blob, base64 без `=`), як у `ssh-keygen -l`. Знахідки містять англійський текст для
//! експортів і структуровані `params` для локалізації в інтерфейсі.

use crate::hash::{map, Map};
use crate::time::{parse_line_time, TimeCtx};
use crate::{clip, MAX_LINE_BYTES};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

/// Максимум хостів в одній оцінці.
pub const MAX_HOSTS: usize = 500;
/// Максимум ключів на хост.
pub const MAX_KEYS_PER_HOST: usize = 20_000;
/// Максимальна довжина рядка `authorized_keys`, байти.
pub const MAX_KEY_LINE: usize = 16_384;
/// Максимум записів про використання ключів.
pub const MAX_USAGE: usize = 50_000;
/// Максимум рядків журналу використання.
pub const MAX_USAGE_LINES: usize = 1_000_000;
/// Максимум знахідок у звіті.
pub const MAX_FINDINGS: usize = 5_000;
/// Поріг «застарілого» ключа за замовчуванням, дні.
pub const DEFAULT_STALE_DAYS: u32 = 180;

const MAX_COMMENT: usize = 200;
const MAX_VALUE: usize = 200;
const MAX_USER: usize = 64;

/// Налаштування sshd, які нас цікавлять (решта відкидається).
const SETTINGS: &[&str] = &["permitrootlogin", "passwordauthentication", "permitemptypasswords", "maxauthtries", "x11forwarding", "pubkeyauthentication", "kbdinteractiveauthentication"];

/// Значення за замовчуванням OpenSSH (використовуються лише коли конфіг читали з файлу, а не через `sshd -T`).
const DEFAULTS: &[(&str, &str)] =
    &[("permitrootlogin", "prohibit-password"), ("passwordauthentication", "yes"), ("permitemptypasswords", "no"), ("maxauthtries", "6"), ("x11forwarding", "no"), ("pubkeyauthentication", "yes")];

const KEY_TYPES: &[&str] =
    &["ssh-rsa", "ssh-dss", "ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521", "sk-ssh-ed25519@openssh.com", "sk-ecdsa-sha2-nistp256@openssh.com"];

/* ------------------------------ base64 і SHA-256 ------------------------------ */

fn b64_val(c: u8) -> Option<u8> {
    match c {
        b'A'..=b'Z' => Some(c - b'A'),
        b'a'..=b'z' => Some(c - b'a' + 26),
        b'0'..=b'9' => Some(c - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

/// Декодування стандартного base64 (з `=` або без). `None` — недопустимий символ чи довжина.
pub fn b64_decode(s: &str) -> Option<Vec<u8>> {
    let s = s.trim_end_matches('=');
    if s.len() % 4 == 1 {
        return None;
    }
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for &c in s.as_bytes() {
        acc = (acc << 6) | u32::from(b64_val(c)?);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

fn b64_encode_nopad(b: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(b.len().div_ceil(3) * 4);
    for chunk in b.chunks(3) {
        let n = (u32::from(chunk[0]) << 16) | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8) | u32::from(*chunk.get(2).unwrap_or(&0));
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        if chunk.len() > 1 {
            out.push(T[(n >> 6) as usize & 63] as char);
        }
        if chunk.len() > 2 {
            out.push(T[n as usize & 63] as char);
        }
    }
    out
}

/// Відбиток ключа у форматі OpenSSH: `SHA256:<base64 без =>`.
pub fn fingerprint(blob: &[u8]) -> String {
    format!("SHA256:{}", b64_encode_nopad(&Sha256::digest(blob)))
}

/* ------------------------------ формат ключа ------------------------------ */

fn wire_str<'a>(buf: &'a [u8], pos: &mut usize) -> Option<&'a [u8]> {
    let len = u32::from_be_bytes(buf.get(*pos..pos.checked_add(4)?)?.try_into().ok()?) as usize;
    *pos += 4;
    let end = pos.checked_add(len)?;
    let s = buf.get(*pos..end)?;
    *pos = end;
    Some(s)
}

fn mpint_bits(n: &[u8]) -> u32 {
    let n = match n.iter().position(|&b| b != 0) {
        Some(i) => &n[i..],
        None => return 0,
    };
    (n.len() as u32 - 1) * 8 + (8 - n[0].leading_zeros())
}

fn key_bits(ktype: &str, blob: &[u8]) -> Option<u32> {
    match ktype {
        "ssh-rsa" => {
            let mut p = 0;
            wire_str(blob, &mut p)?; // тип
            wire_str(blob, &mut p)?; // e
            Some(mpint_bits(wire_str(blob, &mut p)?))
        }
        "ssh-dss" => {
            let mut p = 0;
            wire_str(blob, &mut p)?;
            Some(mpint_bits(wire_str(blob, &mut p)?))
        }
        "ssh-ed25519" | "sk-ssh-ed25519@openssh.com" | "ecdsa-sha2-nistp256" | "sk-ecdsa-sha2-nistp256@openssh.com" => Some(256),
        "ecdsa-sha2-nistp384" => Some(384),
        "ecdsa-sha2-nistp521" => Some(521),
        _ => None,
    }
}

/// Перший токен рядка, що поважає лапки (для `from="a b",command="x y"`).
fn split_first_token(s: &str) -> (&str, &str) {
    let b = s.as_bytes();
    let (mut i, mut in_q) = (0usize, false);
    while i < b.len() {
        match b[i] {
            b'\\' if in_q => {
                i += 2;
                continue;
            }
            b'"' => in_q = !in_q,
            b' ' | b'\t' if !in_q => break,
            _ => {}
        }
        i += 1;
    }
    let i = i.min(b.len());
    (&s[..i], s[i..].trim_start())
}

/// Імена опцій (до `=`), у нижньому регістрі.
fn option_names(opts: &str) -> Vec<String> {
    let b = opts.as_bytes();
    let (mut names, mut start, mut in_q, mut i) = (Vec::new(), 0usize, false, 0usize);
    while i <= b.len() {
        let end = i == b.len();
        if !end {
            match b[i] {
                b'\\' if in_q => {
                    i += 2;
                    continue;
                }
                b'"' => in_q = !in_q,
                _ => {}
            }
        }
        if end || (b[i] == b',' && !in_q) {
            let part = &opts[start..i.min(b.len())];
            let name = part.split('=').next().unwrap_or("").trim().to_ascii_lowercase();
            if !name.is_empty() {
                names.push(name);
            }
            start = i + 1;
        }
        i += 1;
    }
    names
}

/// Один ключ з `authorized_keys`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct KeyRow {
    /// Системний користувач, чий файл прочитано.
    pub user: String,
    /// Шлях до файлу.
    pub path: String,
    /// Тип ключа (`ssh-ed25519`, `ssh-rsa`, …).
    pub key_type: String,
    /// Розмір ключа в бітах, якщо визначено.
    pub bits: Option<u32>,
    /// Відбиток `SHA256:…`.
    pub fingerprint: String,
    /// Коментар ключа (обрізаний).
    pub comment: String,
    /// Є опція `from=`.
    pub from_restricted: bool,
    /// Є опція `command=`.
    pub forced_command: bool,
    /// Є опція `restrict`.
    pub restricted: bool,
    /// Останній вхід цим ключем (мс), якщо знайдено в журналі.
    pub last_used_ms: Option<i64>,
    /// Кількість входів цим ключем у доступному журналі.
    pub uses: u32,
}

struct ParsedKey {
    key_type: String,
    bits: Option<u32>,
    fingerprint: String,
    comment: String,
    from: bool,
    command: bool,
    restrict: bool,
}

/// `Ok(None)` — порожній рядок чи коментар; `Err(())` — некоректний рядок.
fn parse_key_line(line: &str) -> Result<Option<ParsedKey>, ()> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return Ok(None);
    }
    let (first, rest) = split_first_token(line);
    let (opts, ktype, after) = if KEY_TYPES.contains(&first) {
        ("", first, rest)
    } else {
        let (t, after) = split_first_token(rest);
        if !KEY_TYPES.contains(&t) {
            return Err(());
        }
        (first, t, after)
    };
    let (b64, comment) = split_first_token(after);
    let blob = b64_decode(b64).ok_or(())?;
    let mut p = 0;
    if wire_str(&blob, &mut p) != Some(ktype.as_bytes()) {
        return Err(()); // тип у blob не збігається із заявленим
    }
    let names = option_names(opts);
    Ok(Some(ParsedKey {
        key_type: ktype.to_string(),
        bits: key_bits(ktype, &blob),
        fingerprint: fingerprint(&blob),
        comment: clip(comment.trim(), MAX_COMMENT).to_string(),
        from: names.iter().any(|n| n == "from"),
        command: names.iter().any(|n| n == "command"),
        restrict: names.iter().any(|n| n == "restrict"),
    }))
}

/* ------------------------------ sshd ------------------------------ */

fn parse_sshd(text: &str, from_file: bool) -> (BTreeMap<String, String>, Vec<String>) {
    let mut out: BTreeMap<String, String> = BTreeMap::new();
    for raw in text.lines().take(20_000) {
        let line = clip(raw.trim(), 1024);
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut it = line.splitn(2, |c: char| c.is_whitespace() || c == '=');
        let key = it.next().unwrap_or("").to_ascii_lowercase();
        if from_file && key == "match" {
            break; // далі йдуть умовні блоки: глобальне значення вже відоме
        }
        if !SETTINGS.contains(&key.as_str()) || out.contains_key(&key) {
            continue;
        }
        let mut val = it.next().unwrap_or("").trim_start_matches(|c: char| c == '=' || c.is_whitespace()).trim().trim_matches('"').to_ascii_lowercase();
        if val == "without-password" {
            val = "prohibit-password".to_string();
        }
        out.insert(key, clip(&val, MAX_VALUE).to_string());
    }
    let mut defaulted = Vec::new();
    if from_file {
        for (k, v) in DEFAULTS {
            if !out.contains_key(*k) {
                out.insert((*k).to_string(), (*v).to_string());
                defaulted.push((*k).to_string());
            }
        }
    }
    (out, defaulted)
}

/* ------------------------------ крок 1: розбір хоста ------------------------------ */

/// Один файл `authorized_keys`, прочитаний на хості.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct KeyFile {
    /// Системний користувач.
    pub user: String,
    /// Шлях до файлу.
    pub path: String,
    /// Вміст.
    pub text: String,
    /// Файл існує, але прочитати його не вдалося.
    pub unreadable: bool,
    /// Вміст обрізано хостом.
    pub truncated: bool,
}

/// Вхід кроку 1 (сирі дані одного хоста, крім журналу — він іде окремим текстом).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct ParseInput {
    /// Вивід `sshd -T` або вміст `sshd_config`.
    pub sshd_text: String,
    /// `sshd -T`, `file` або `unavailable`.
    pub sshd_source: String,
    /// Файли `authorized_keys`.
    pub keys: Vec<KeyFile>,
    /// Найстаріший рядок журналу sshd (для оцінки глибини історії).
    pub oldest_line: String,
    /// Поточний час сервера, мс.
    pub now_ms: i64,
    /// Зсув пояса сервера, хвилини.
    pub tz_offset_min: i32,
    /// Зерно для хеш-таблиць.
    pub seed: u64,
}

/// Результат кроку 1: те, що зберігається і далі оцінюється.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ParsedHost {
    /// Звідки взято налаштування.
    pub sshd_source: String,
    /// Ефективні налаштування sshd (глобальна область, без `Match`).
    pub settings: BTreeMap<String, String>,
    /// Ключі налаштувань, значення яких узято зі стандартних (а не прочитано).
    pub defaulted: Vec<String>,
    /// Ключі.
    pub keys: Vec<KeyRow>,
    /// Файли `authorized_keys`, які не вдалося прочитати.
    pub unreadable: Vec<String>,
    /// Некоректні рядки в `authorized_keys`.
    pub skipped_lines: u32,
    /// Рядків `Accepted publickey`, з яких зібрано використання.
    pub usage_lines: u32,
    /// Скільки днів історії журналу доступно (за найстарішим рядком).
    pub coverage_days: Option<u32>,
    /// Дані обрізано лімітами.
    pub truncated: bool,
}

fn parse_usage(text: &str, ctx: &TimeCtx, seed: u64) -> (Map<String, (i64, u32)>, u32) {
    let mut m: Map<String, (i64, u32)> = map(seed);
    let mut lines = 0u32;
    for raw in text.lines().take(MAX_USAGE_LINES) {
        let line = clip(raw, MAX_LINE_BYTES);
        let Some(pos) = line.find("Accepted publickey for ") else { continue };
        let rest = &line[pos + "Accepted publickey for ".len()..];
        let Some(user) = rest.split(" from ").next() else { continue };
        let Some(fp_at) = rest.find("SHA256:") else { continue };
        let fp = rest[fp_at..].split_whitespace().next().unwrap_or("");
        let Some(ts) = parse_line_time(line, ctx) else { continue };
        let key = format!("{}\0{fp}", clip(user, MAX_USER));
        if !m.contains_key(&key) && m.len() >= MAX_USAGE {
            continue;
        }
        let e = m.entry(key).or_insert((ts, 0));
        e.0 = e.0.max(ts);
        e.1 = e.1.saturating_add(1);
        lines += 1;
    }
    (m, lines)
}

/// Крок 1: розбирає сирі дані хоста. `usage_text` — рядки `Accepted publickey` з журналів.
pub fn parse_host(input: &ParseInput, usage_text: &str) -> ParsedHost {
    let ctx = TimeCtx { now_ms: input.now_ms, tz_offset_min: input.tz_offset_min };
    let mut host = ParsedHost { sshd_source: input.sshd_source.clone(), ..ParsedHost::default() };

    match input.sshd_source.as_str() {
        "sshd -T" => (host.settings, host.defaulted) = parse_sshd(&input.sshd_text, false),
        "file" => (host.settings, host.defaulted) = parse_sshd(&input.sshd_text, true),
        _ => host.sshd_source = "unavailable".to_string(),
    }

    let (usage, usage_lines) = parse_usage(usage_text, &ctx, input.seed);
    host.usage_lines = usage_lines;
    host.coverage_days = parse_line_time(clip(&input.oldest_line, MAX_LINE_BYTES), &ctx).map(|t| ((input.now_ms - t) / 86_400_000).max(0) as u32);

    for f in &input.keys {
        let user = clip(&f.user, MAX_USER).to_string();
        if f.unreadable {
            host.unreadable.push(format!("{user}:{}", clip(&f.path, 300)));
            continue;
        }
        host.truncated |= f.truncated;
        for raw in f.text.lines() {
            if raw.len() > MAX_KEY_LINE {
                host.skipped_lines += 1;
                continue;
            }
            match parse_key_line(raw) {
                Ok(None) => {}
                Err(()) => host.skipped_lines += 1,
                Ok(Some(k)) => {
                    if host.keys.len() >= MAX_KEYS_PER_HOST {
                        host.truncated = true;
                        break;
                    }
                    let used = usage.get(&format!("{user}\0{}", k.fingerprint)).copied();
                    host.keys.push(KeyRow {
                        user: user.clone(),
                        path: clip(&f.path, 300).to_string(),
                        key_type: k.key_type,
                        bits: k.bits,
                        fingerprint: k.fingerprint,
                        comment: k.comment,
                        from_restricted: k.from,
                        forced_command: k.command,
                        restricted: k.restrict,
                        last_used_ms: used.map(|u| u.0),
                        uses: used.map_or(0, |u| u.1),
                    });
                }
            }
        }
    }
    host
}

/* ------------------------------ крок 2: оцінка парку ------------------------------ */

/// Очікуваний ключ, який оголосив аналітик.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Expected {
    /// Відбиток `SHA256:…`.
    pub fingerprint: String,
    /// Власник.
    pub owner: String,
    /// Призначення.
    pub purpose: String,
    /// Ідентифікатори хостів, де ключ дозволено (порожньо — будь-де).
    pub hosts: Vec<String>,
}

/// Хост у вході оцінки.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct HostEntry {
    /// Ідентифікатор.
    pub id: String,
    /// Назва.
    pub name: String,
    /// Помилка сканування (якщо хост не вдалося перевірити).
    pub error: Option<String>,
    /// Розібрані дані.
    pub host: ParsedHost,
}

/// Вхід кроку 2.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct JudgeInput {
    /// Хости.
    pub hosts: Vec<HostEntry>,
    /// Список очікуваних ключів (порожній — перевірка «невідомий ключ» вимкнена).
    pub expected: Vec<Expected>,
    /// Поріг застарілого ключа, дні (0 — за замовчуванням).
    pub stale_days: u32,
    /// Поточний час, мс.
    pub now_ms: i64,
}

/// Знахідка.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Finding {
    /// Стабільний код (ключ локалізації в інтерфейсі).
    pub code: &'static str,
    /// `critical`, `high`, `medium`, `low`, `info`.
    pub severity: &'static str,
    /// Хост, якщо знахідка стосується одного хоста.
    pub host_id: Option<String>,
    /// Назва хоста.
    pub host_name: Option<String>,
    /// Користувач, якщо стосується.
    pub user: Option<String>,
    /// Відбиток ключа, якщо стосується.
    pub fingerprint: Option<String>,
    /// Змінні частини (значення, кількості, списки) для локалізації.
    pub params: BTreeMap<String, String>,
    /// Коротка назва англійською.
    pub title: String,
    /// Пояснення англійською.
    pub detail: String,
    /// Що зробити (показується, не виконується).
    pub suggestion: String,
}

/// Ключ, що трапляється більше ніж на одному хості чи в акаунті.
#[derive(Debug, Clone, Serialize)]
pub struct Shared {
    /// Відбиток.
    pub fingerprint: String,
    /// Назви хостів.
    pub hosts: Vec<String>,
    /// Користувачі.
    pub users: Vec<String>,
}

/// Звіт про гігієну.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Report {
    /// Час формування, мс.
    pub generated_ms: i64,
    /// Хостів у вході.
    pub hosts_total: u32,
    /// Хостів, які вдалося перевірити.
    pub hosts_scanned: u32,
    /// Ключів усього.
    pub keys_total: u32,
    /// Унікальних відбитків.
    pub unique_keys: u32,
    /// Чи оголошено список очікуваних ключів.
    pub expected_declared: bool,
    /// Використаний поріг застарілості, дні.
    pub stale_days: u32,
    /// Кількість знахідок за серйозністю.
    pub by_severity: BTreeMap<String, u32>,
    /// Знахідки (від найсерйозніших).
    pub findings: Vec<Finding>,
    /// Ключі на кількох хостах.
    pub on_many_hosts: Vec<Shared>,
    /// Ключі в кількох акаунтах.
    pub shared_users: Vec<Shared>,
    /// Знахідки обрізано лімітом.
    pub truncated: bool,
}

fn rank(sev: &str) -> u8 {
    match sev {
        "critical" => 0,
        "high" => 1,
        "medium" => 2,
        "low" => 3,
        _ => 4,
    }
}

struct Ctx<'a> {
    host: Option<&'a HostEntry>,
    out: &'a mut Vec<Finding>,
    truncated: &'a mut bool,
}

impl Ctx<'_> {
    #[allow(clippy::too_many_arguments)]
    fn add(&mut self, code: &'static str, severity: &'static str, user: Option<&str>, fp: Option<&str>, params: &[(&str, String)], title: &str, detail: String, suggestion: &str) {
        if self.out.len() >= MAX_FINDINGS {
            *self.truncated = true;
            return;
        }
        self.out.push(Finding {
            code,
            severity,
            host_id: self.host.map(|h| h.id.clone()),
            host_name: self.host.map(|h| h.name.clone()),
            user: user.map(str::to_string),
            fingerprint: fp.map(str::to_string),
            params: params.iter().map(|(k, v)| ((*k).to_string(), v.clone())).collect(),
            title: title.to_string(),
            detail,
            suggestion: suggestion.to_string(),
        });
    }
}

fn setting<'a>(h: &'a ParsedHost, k: &str) -> Option<&'a str> {
    h.settings.get(k).map(String::as_str)
}

fn judge_sshd(cx: &mut Ctx, h: &ParsedHost, name: &str) {
    if h.sshd_source == "unavailable" {
        cx.add(
            "SSHD_UNAVAILABLE",
            "info",
            None,
            None,
            &[],
            "sshd configuration could not be read",
            format!("Neither `sshd -T` nor the sshd_config files could be read on {name}."),
            "Run the scan with an account that may read the sshd configuration (root or sudo without a password), or accept the gap.",
        );
        return;
    }
    let src = |k: &str| (if h.defaulted.iter().any(|d| d == k) { "default" } else { h.sshd_source.as_str() }).to_string();
    if setting(h, "permitrootlogin") == Some("yes") {
        cx.add(
            "ROOT_LOGIN",
            "high",
            None,
            None,
            &[("value", "yes".into()), ("source", src("permitrootlogin"))],
            "Root login over SSH is allowed",
            format!("PermitRootLogin is 'yes' on {name}."),
            "Set 'PermitRootLogin no' (or 'prohibit-password' if key-based root access is required) and reload sshd.",
        );
    }
    if setting(h, "passwordauthentication") == Some("yes") {
        cx.add(
            "PASSWORD_AUTH",
            "high",
            None,
            None,
            &[("value", "yes".into()), ("source", src("passwordauthentication"))],
            "Password authentication is enabled",
            format!("PasswordAuthentication is 'yes' on {name}."),
            "After confirming that key login works for every account, set 'PasswordAuthentication no' and reload sshd.",
        );
    }
    if setting(h, "permitemptypasswords") == Some("yes") {
        cx.add(
            "EMPTY_PASSWORDS",
            "critical",
            None,
            None,
            &[("value", "yes".into())],
            "Empty passwords are allowed",
            format!("PermitEmptyPasswords is 'yes' on {name}."),
            "Set 'PermitEmptyPasswords no' and reload sshd.",
        );
    }
    if let Some(n) = setting(h, "maxauthtries").and_then(|v| v.parse::<u32>().ok()) {
        if n > 6 {
            cx.add("MAX_AUTH_TRIES", "low", None, None, &[("value", n.to_string())], "MaxAuthTries is high", format!("MaxAuthTries is {n} on {name}."), "Lower MaxAuthTries to 4 or less.");
        }
    }
    if setting(h, "x11forwarding") == Some("yes") {
        cx.add(
            "X11_FORWARDING",
            "info",
            None,
            None,
            &[("value", "yes".into())],
            "X11 forwarding is enabled",
            format!("X11Forwarding is 'yes' on {name}."),
            "Set 'X11Forwarding no' unless graphical forwarding is needed.",
        );
    }
}

fn judge_keys(cx: &mut Ctx, h: &ParsedHost, name: &str, host_id: &str, expected: &BTreeMap<&str, &Expected>, stale_days: u32, now_ms: i64) {
    for f in &h.unreadable {
        cx.add(
            "AUTHKEYS_UNREADABLE",
            "info",
            f.split(':').next(),
            None,
            &[("file", f.clone())],
            "authorized_keys could not be read",
            format!("{f} exists on {name} but could not be read."),
            "Grant read access to the scanning account (or use one that may use sudo without a password), or accept the gap.",
        );
    }
    let coverage_ok = h.coverage_days.is_some_and(|c| c >= stale_days);
    if !h.keys.is_empty() && !coverage_ok {
        cx.add(
            "LOG_COVERAGE_SHORT",
            "info",
            None,
            None,
            &[("coverage_days", h.coverage_days.map_or("unknown".to_string(), |c| c.to_string())), ("stale_days", stale_days.to_string())],
            "Log history is shorter than the stale-key threshold",
            format!("Logs on {name} cover {} day(s); keys unused for {stale_days} days cannot be judged.", h.coverage_days.map_or("an unknown number of".to_string(), |c| c.to_string())),
            "Keep SSH logs longer (journald retention or logrotate) if you want stale keys detected.",
        );
    }
    for k in &h.keys {
        let u = Some(k.user.as_str());
        let fp = Some(k.fingerprint.as_str());
        if k.key_type == "ssh-dss" {
            cx.add(
                "KEY_DSA",
                "high",
                u,
                fp,
                &[("key_type", k.key_type.clone())],
                "DSA key (deprecated)",
                format!("{} has a DSA key authorised on {name}.", k.user),
                "Replace it with an Ed25519 key (ssh-keygen -t ed25519) and remove this one.",
            );
        }
        if k.key_type == "ssh-rsa" && k.bits.is_some_and(|b| b < 2048) {
            cx.add(
                "KEY_WEAK_RSA",
                "high",
                u,
                fp,
                &[("bits", k.bits.unwrap_or(0).to_string())],
                "RSA key shorter than 2048 bits",
                format!("{} has a {}-bit RSA key authorised on {name}.", k.user, k.bits.unwrap_or(0)),
                "Replace it with an Ed25519 key (ssh-keygen -t ed25519) and remove this one.",
            );
        }
        if k.comment.is_empty() {
            cx.add(
                "KEY_NO_COMMENT",
                "info",
                u,
                fp,
                &[],
                "Key has no comment",
                format!("A key for {} on {name} has no comment, so its owner cannot be told from the file.", k.user),
                "Re-add the key with a comment that names its owner and purpose.",
            );
        }
        if !expected.is_empty() {
            match expected.get(k.fingerprint.as_str()) {
                None => cx.add(
                    "KEY_UNKNOWN",
                    "high",
                    u,
                    fp,
                    &[("comment", k.comment.clone())],
                    "Key is not in the expected-keys list",
                    format!("A key for {} on {name} is not on the list of expected keys.", k.user),
                    "Find out who owns the key. Add it to the expected list if it is legitimate; remove it otherwise.",
                ),
                Some(e) if !e.hosts.is_empty() && !e.hosts.iter().any(|x| x == host_id) => {
                    cx.add(
                        "KEY_WRONG_HOST",
                        "high",
                        u,
                        fp,
                        &[("owner", e.owner.clone())],
                        "Key is not allowed on this host",
                        format!("The key of {} is authorised for {} on {name}, but is not allowed on this host by the expected list.", e.owner, k.user),
                        "Remove the key from this host, or widen its allowed hosts if the access is intended.",
                    );
                }
                Some(_) => {}
            }
        }
        if coverage_ok {
            let age_days = k.last_used_ms.map(|t| ((now_ms - t) / 86_400_000).max(0) as u32);
            match age_days {
                None => cx.add(
                    "KEY_STALE",
                    "low",
                    u,
                    fp,
                    &[("days", h.coverage_days.unwrap_or(0).to_string()), ("never_seen", "true".into())],
                    "Key not seen in the logs",
                    format!("The key of {} on {name} does not appear in the available logs ({} days).", k.user, h.coverage_days.unwrap_or(0)),
                    "Confirm the key is still needed; remove it otherwise. Absence from logs is not proof of non-use.",
                ),
                Some(d) if d >= stale_days => cx.add(
                    "KEY_STALE",
                    "low",
                    u,
                    fp,
                    &[("days", d.to_string())],
                    "Key not used recently",
                    format!("The key of {} on {name} was last used {d} days ago.", k.user),
                    "Confirm the key is still needed; remove it otherwise.",
                ),
                Some(_) => {}
            }
        }
    }
}

/// Крок 2: оцінює парк.
pub fn judge(input: &JudgeInput) -> Report {
    let stale_days = if input.stale_days == 0 { DEFAULT_STALE_DAYS } else { input.stale_days.clamp(7, 3650) };
    let hosts: Vec<&HostEntry> = input.hosts.iter().take(MAX_HOSTS).collect();
    let expected: BTreeMap<&str, &Expected> = input.expected.iter().take(10_000).map(|e| (e.fingerprint.as_str(), e)).collect();

    let mut rep =
        Report { generated_ms: input.now_ms, hosts_total: hosts.len() as u32, expected_declared: !expected.is_empty(), stale_days, truncated: input.hosts.len() > MAX_HOSTS, ..Report::default() };
    let mut findings: Vec<Finding> = Vec::new();
    let mut truncated = false;

    // fp → (хости, користувачі)
    let mut by_fp: BTreeMap<&str, (BTreeSet<&str>, BTreeSet<&str>)> = BTreeMap::new();

    for h in hosts.iter().copied() {
        let mut cx = Ctx { host: Some(h), out: &mut findings, truncated: &mut truncated };
        if let Some(err) = &h.error {
            cx.add(
                "HOST_UNSCANNED",
                "info",
                None,
                None,
                &[("reason", clip(err, 200).to_string())],
                "Host was not scanned",
                format!("{} could not be scanned: {}", h.name, clip(err, 200)),
                "Check the connection to the host and scan again.",
            );
            continue;
        }
        rep.hosts_scanned += 1;
        judge_sshd(&mut cx, &h.host, &h.name);
        judge_keys(&mut cx, &h.host, &h.name, &h.id, &expected, stale_days, input.now_ms);
        for k in &h.host.keys {
            rep.keys_total += 1;
            let e = by_fp.entry(k.fingerprint.as_str()).or_default();
            e.0.insert(h.name.as_str());
            e.1.insert(k.user.as_str());
        }
    }
    rep.unique_keys = by_fp.len() as u32;

    // Флотські знахідки
    let mut cx = Ctx { host: None, out: &mut findings, truncated: &mut truncated };
    for (fp, (hs, us)) in &by_fp {
        let list = |s: &BTreeSet<&str>| s.iter().map(|x| (*x).to_string()).collect::<Vec<_>>();
        if us.len() > 1 {
            rep.shared_users.push(Shared { fingerprint: (*fp).to_string(), hosts: list(hs), users: list(us) });
            cx.add(
                "KEY_SHARED_USERS",
                "medium",
                None,
                Some(fp),
                &[("users", list(us).join(", ")), ("hosts", list(hs).join(", "))],
                "One key is authorised for several accounts",
                format!("The same key is authorised for {} different accounts ({}).", us.len(), list(us).join(", ")),
                "Give each account its own key so that logins can be attributed to a person.",
            );
        }
        if hs.len() > 1 {
            rep.on_many_hosts.push(Shared { fingerprint: (*fp).to_string(), hosts: list(hs), users: list(us) });
            cx.add(
                "KEY_ON_MANY_HOSTS",
                "info",
                None,
                Some(fp),
                &[("count", hs.len().to_string()), ("hosts", list(hs).join(", "))],
                "Same key on several hosts",
                format!("The same key is authorised on {} hosts.", hs.len()),
                "This is normal for one person's admin key. Review it if the key is a shared service or deploy key.",
            );
        }
    }

    findings.sort_by(|a, b| rank(a.severity).cmp(&rank(b.severity)).then_with(|| a.host_name.cmp(&b.host_name)).then_with(|| a.code.cmp(b.code)).then_with(|| a.fingerprint.cmp(&b.fingerprint)));
    for f in &findings {
        *rep.by_severity.entry(f.severity.to_string()).or_insert(0) += 1;
    }
    rep.truncated |= truncated;
    rep.findings = findings;
    rep
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-11-04T08:15:01Z
    const NOW: i64 = 1_793_780_101_000;

    // Реальні публічні ключі, згенеровані `ssh-keygen`; відбитки звірено з `ssh-keygen -lf`.
    const ED: &str = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOsaPnH+kDs2S8IZea60Y+gd2+FeoTvbpM+ECev87Q4g alice@laptop";
    const ED_FP: &str = "SHA256:UO3e7fNaujDTrJHSSWU1MosxbDhkcfckgQiWWgGVt3o";
    const RSA1024: &str = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQDV4SEBmw/0d+fJs3/dt3d/YhyJBTZw2bqycX2J2RlJ43WJ7pPPmJSmTLHMsM4Mfu6eEFz57oY8w7ZQwK8c/Gli/7RYoBFRrrn177af4JQfBYVoaBiT1A71gd5JWOssvuFzV6b6lqqnAlVpk8BA817jBUpW+bJ5rsFaYMAKCxHtwQ== old@weak";
    const RSA1024_FP: &str = "SHA256:DmgzUgWSjsaRd0Nx+a2g4rWp6vXhaw95UWcg6vvKCCY";
    const RSA2048: &str = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCvjovJzCv/s/YAOxJyYcz8Jqw5tItZ1MzMah0fpnkGUs7yZw/RojA2WRLYO8nbb9NWCY7jhprOJUFaE+n+bfOjTwJ55x8qShMBjfZljgUUKmtQZI614uGpNtC0ar4KFaw8zw9FNJyTw8oKJkjzdpFmIukNPGxV980+Hd3n/9dZhbsZY+PvDaV9HIOEqIm2mqSqRww8yoXgsvLnBCyUnfEGCc9Ccb8Vw8+Gkfrawcr7JxFW9ae+Lb9qDk0j5cupmlLBke+emAfFyVCZZou4POMKvliycu4gDzRE9GmHZuoY2ayavHt2uEL2KfJYGrdginBGROxTBPZvyJhJHMC5C8eT bob@work";
    const RSA2048_FP: &str = "SHA256:cwwaTyq1czQRTe317HCvY1aRlYzaOBEOSvhxtjh4VYI";
    const ECDSA: &str = "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBDPW7fodqxG5H2HDLpeq4YhvkOgUad3nxkxbSOlLG7OjRgFLxHhL/U+RrJ5INlM9SqrhHheDZnObyvKiUy5cY80= carol@ci";
    const ECDSA_FP: &str = "SHA256:6djpTzVZncUDyvu3a7EZQfOPCaanDGlNGXrHEe13Kow";

    fn keyfile(user: &str, text: &str) -> KeyFile {
        KeyFile { user: user.into(), path: format!("/home/{user}/.ssh/authorized_keys"), text: text.into(), ..KeyFile::default() }
    }

    fn input(sshd: &str, source: &str, files: Vec<KeyFile>) -> ParseInput {
        ParseInput { sshd_text: sshd.into(), sshd_source: source.into(), keys: files, now_ms: NOW, tz_offset_min: 0, oldest_line: "2025-01-01T00:00:00+0000 host sshd[1]: x".into(), seed: 7 }
    }

    fn entry(id: &str, p: ParsedHost) -> HostEntry {
        HostEntry { id: id.into(), name: id.into(), error: None, host: p }
    }

    fn judge_hosts(hosts: Vec<HostEntry>, expected: Vec<Expected>) -> Report {
        judge(&JudgeInput { hosts, expected, stale_days: 0, now_ms: NOW })
    }

    fn codes(r: &Report) -> Vec<&'static str> {
        r.findings.iter().map(|f| f.code).collect()
    }

    #[test]
    fn base64_roundtrip_and_rejects_garbage() {
        for s in ["", "a", "ab", "abc", "abcd", "hello world"] {
            assert_eq!(b64_decode(&b64_encode_nopad(s.as_bytes())).unwrap(), s.as_bytes());
        }
        assert_eq!(b64_decode("TWFu").unwrap(), b"Man");
        assert!(b64_decode("a").is_none() && b64_decode("ab!d").is_none());
    }

    #[test]
    fn fingerprints_match_ssh_keygen() {
        for (line, fp) in [(ED, ED_FP), (RSA1024, RSA1024_FP), (RSA2048, RSA2048_FP), (ECDSA, ECDSA_FP)] {
            assert_eq!(parse_key_line(line).unwrap().unwrap().fingerprint, fp, "{line}");
        }
    }

    #[test]
    fn key_sizes_and_types() {
        let k = |l| parse_key_line(l).unwrap().unwrap();
        assert_eq!(k(RSA1024).bits, Some(1024));
        assert_eq!(k(RSA2048).bits, Some(2048));
        assert_eq!(k(ED).bits, Some(256));
        assert_eq!(k(ECDSA).bits, Some(256));
        assert_eq!(k(ED).key_type, "ssh-ed25519");
        assert_eq!(k(ED).comment, "alice@laptop");
    }

    #[test]
    fn options_with_quotes_and_commas() {
        let line = format!(r#"from="10.0.0.0/8,192.168.*",command="echo a b, c",no-pty,restrict {ED}"#);
        let k = parse_key_line(&line).unwrap().unwrap();
        assert!(k.from && k.command && k.restrict);
        assert_eq!(k.fingerprint, ED_FP);
        let plain = parse_key_line(ED).unwrap().unwrap();
        assert!(!plain.from && !plain.command && !plain.restrict);
    }

    #[test]
    fn malformed_lines_are_skipped_not_fatal() {
        assert!(parse_key_line("").unwrap().is_none());
        assert!(parse_key_line("# comment").unwrap().is_none());
        assert!(parse_key_line("ssh-ed25519 !!!notbase64 x").is_err());
        assert!(parse_key_line("not a key at all").is_err());
        // тип у рядку не збігається з типом у blob
        let swapped = ED.replacen("ssh-ed25519", "ssh-rsa", 1);
        assert!(parse_key_line(&swapped).is_err());
        let p = parse_host(&input("", "unavailable", vec![keyfile("u", &format!("{ED}\ngarbage\n\n# c\n{RSA2048}"))]), "");
        assert_eq!((p.keys.len(), p.skipped_lines), (2, 1));
    }

    #[test]
    fn sshd_t_output_is_parsed() {
        let t = "port 22\npermitrootlogin yes\npasswordauthentication no\npermitemptypasswords no\nmaxauthtries 10\nx11forwarding yes\nhostkey /etc/ssh/a\n";
        let (s, d) = parse_sshd(t, false);
        assert_eq!(s["permitrootlogin"], "yes");
        assert_eq!(s["maxauthtries"], "10");
        assert!(d.is_empty() && !s.contains_key("hostkey"));
    }

    #[test]
    fn sshd_config_file_uses_first_value_stops_at_match_and_fills_defaults() {
        let t = "# c\nPermitRootLogin no\nPermitRootLogin yes\nPasswordAuthentication=no\nMatch User bob\n  PasswordAuthentication yes\n";
        let (s, d) = parse_sshd(t, true);
        assert_eq!(s["permitrootlogin"], "no", "first value wins");
        assert_eq!(s["passwordauthentication"], "no", "Match block is not global");
        assert_eq!(s["maxauthtries"], "6");
        assert!(d.contains(&"maxauthtries".to_string()) && !d.contains(&"permitrootlogin".to_string()));
        let (s2, _) = parse_sshd("PermitRootLogin without-password", true);
        assert_eq!(s2["permitrootlogin"], "prohibit-password");
    }

    #[test]
    fn usage_is_matched_to_user_and_fingerprint() {
        let log = format!(
            "2026-11-04T10:00:00+0000 h sshd[1]: Accepted publickey for alice from 10.0.0.1 port 5 ssh2: ED25519 {ED_FP}\n\
             2026-11-02T10:00:00+0000 h sshd[1]: Accepted publickey for alice from 10.0.0.1 port 6 ssh2: ED25519 {ED_FP}\n\
             2026-11-03T10:00:00+0000 h sshd[1]: Accepted publickey for bob from 10.0.0.1 port 7 ssh2: ED25519 {ED_FP}\n\
             2026-11-03T10:00:00+0000 h sshd[1]: Accepted password for alice from 10.0.0.1 port 8 ssh2\n"
        );
        let p = parse_host(&input("", "unavailable", vec![keyfile("alice", ED)]), &log);
        assert_eq!(p.usage_lines, 3);
        assert_eq!(p.keys[0].uses, 2, "only alice's logins with this key");
        assert!(p.keys[0].last_used_ms.unwrap() > NOW - 86_400_000 * 2);
        assert_eq!(p.coverage_days, Some(672));
    }

    #[test]
    fn unreadable_files_are_reported() {
        let mut f = keyfile("root", "");
        f.unreadable = true;
        let p = parse_host(&input("", "unavailable", vec![f]), "");
        assert_eq!(p.unreadable.len(), 1);
        let r = judge_hosts(vec![entry("a", p)], vec![]);
        assert!(codes(&r).contains(&"AUTHKEYS_UNREADABLE") && codes(&r).contains(&"SSHD_UNAVAILABLE"));
    }

    #[test]
    fn sshd_findings() {
        let p = parse_host(&input("permitrootlogin yes\npasswordauthentication yes\npermitemptypasswords yes\nmaxauthtries 9\nx11forwarding yes", "sshd -T", vec![]), "");
        let r = judge_hosts(vec![entry("web", p)], vec![]);
        let c = codes(&r);
        for want in ["ROOT_LOGIN", "PASSWORD_AUTH", "EMPTY_PASSWORDS", "MAX_AUTH_TRIES", "X11_FORWARDING"] {
            assert!(c.contains(&want), "{want} in {c:?}");
        }
        assert_eq!(r.findings[0].severity, "critical", "most severe first");
        let good = parse_host(&input("permitrootlogin no\npasswordauthentication no\npermitemptypasswords no\nmaxauthtries 4\nx11forwarding no", "sshd -T", vec![]), "");
        assert!(judge_hosts(vec![entry("ok", good)], vec![]).findings.is_empty());
    }

    #[test]
    fn defaults_are_flagged_as_such() {
        let p = parse_host(&input("", "file", vec![]), "");
        let r = judge_hosts(vec![entry("h", p)], vec![]);
        let f = r.findings.iter().find(|f| f.code == "PASSWORD_AUTH").expect("default is password auth = yes");
        assert_eq!(f.params["source"], "default");
    }

    #[test]
    fn weak_keys() {
        let p = parse_host(&input("", "unavailable", vec![keyfile("old", RSA1024), keyfile("ok", RSA2048)]), "");
        let r = judge_hosts(vec![entry("a", p)], vec![]);
        let weak: Vec<_> = r.findings.iter().filter(|f| f.code == "KEY_WEAK_RSA").collect();
        assert_eq!(weak.len(), 1);
        assert_eq!(weak[0].params["bits"], "1024");
    }

    #[test]
    fn shared_keys_across_users_and_hosts() {
        let a = parse_host(&input("", "unavailable", vec![keyfile("deploy", ED), keyfile("ops", ED)]), "");
        let b = parse_host(&input("", "unavailable", vec![keyfile("deploy", ED)]), "");
        let r = judge_hosts(vec![entry("a", a), entry("b", b)], vec![]);
        assert_eq!((r.keys_total, r.unique_keys), (3, 1));
        let shared = r.findings.iter().find(|f| f.code == "KEY_SHARED_USERS").unwrap();
        assert_eq!(shared.severity, "medium");
        let many = r.findings.iter().find(|f| f.code == "KEY_ON_MANY_HOSTS").unwrap();
        assert_eq!(many.severity, "info", "one admin key everywhere is normal");
        assert_eq!(r.on_many_hosts[0].hosts, vec!["a", "b"]);
    }

    #[test]
    fn expected_keys_unknown_and_wrong_host() {
        let a = parse_host(&input("", "unavailable", vec![keyfile("alice", ED), keyfile("x", RSA2048)]), "");
        let b = parse_host(&input("", "unavailable", vec![keyfile("alice", ED)]), "");
        let exp = vec![Expected { fingerprint: ED_FP.into(), owner: "Alice".into(), purpose: "admin".into(), hosts: vec!["a".into()] }];
        let r = judge_hosts(vec![entry("a", a.clone()), entry("b", b)], exp);
        assert!(r.expected_declared);
        let unknown: Vec<_> = r.findings.iter().filter(|f| f.code == "KEY_UNKNOWN").collect();
        assert_eq!(unknown.len(), 1);
        assert_eq!(unknown[0].fingerprint.as_deref(), Some(RSA2048_FP));
        let wrong: Vec<_> = r.findings.iter().filter(|f| f.code == "KEY_WRONG_HOST").collect();
        assert_eq!((wrong.len(), wrong[0].host_id.as_deref()), (1, Some("b")));
        // без оголошеного списку «невідомий ключ» не існує
        let none = judge_hosts(vec![entry("a", a)], vec![]);
        assert!(!none.expected_declared && !codes(&none).contains(&"KEY_UNKNOWN"));
    }

    #[test]
    fn stale_keys_need_enough_log_history() {
        let log_old = format!("2026-04-01T10:00:00+0000 h sshd[1]: Accepted publickey for alice from 10.0.0.1 port 5 ssh2: ED25519 {ED_FP}\n");
        // історія 672 дні ≥ 180: ключ, востаннє використаний 217 днів тому, застарів
        let p = parse_host(&input("", "unavailable", vec![keyfile("alice", ED)]), &log_old);
        let r = judge_hosts(vec![entry("h", p)], vec![]);
        assert!(codes(&r).contains(&"KEY_STALE"), "{:?}", codes(&r));
        // ключ, якого в логах немає зовсім, але історія достатня
        let p = parse_host(&input("", "unavailable", vec![keyfile("alice", ED)]), "");
        let r = judge_hosts(vec![entry("h", p)], vec![]);
        assert_eq!(r.findings.iter().find(|f| f.code == "KEY_STALE").unwrap().params["never_seen"], "true");
        // історії замало — «застарілий» не твердимо, лише попереджаємо
        let mut short = input("", "unavailable", vec![keyfile("alice", ED)]);
        short.oldest_line = "2026-11-01T00:00:00+0000 h sshd[1]: x".into();
        let r = judge_hosts(vec![entry("h", parse_host(&short, ""))], vec![]);
        assert!(!codes(&r).contains(&"KEY_STALE") && codes(&r).contains(&"LOG_COVERAGE_SHORT"));
        // свіже використання — не застарілий
        let fresh = format!("2026-11-03T10:00:00+0000 h sshd[1]: Accepted publickey for alice from 10.0.0.1 port 5 ssh2: ED25519 {ED_FP}\n");
        let r = judge_hosts(vec![entry("h", parse_host(&input("", "unavailable", vec![keyfile("alice", ED)]), &fresh))], vec![]);
        assert!(!codes(&r).contains(&"KEY_STALE"));
    }

    #[test]
    fn failed_hosts_are_reported_and_do_not_count() {
        let mut h = entry("down", ParsedHost::default());
        h.error = Some("connection refused".into());
        let r = judge_hosts(vec![h], vec![]);
        assert_eq!((r.hosts_total, r.hosts_scanned), (1, 0));
        assert_eq!(codes(&r), vec!["HOST_UNSCANNED"]);
    }

    fn wire(parts: &[&[u8]]) -> Vec<u8> {
        let mut v = Vec::new();
        for p in parts {
            v.extend_from_slice(&(p.len() as u32).to_be_bytes());
            v.extend_from_slice(p);
        }
        v
    }

    #[test]
    fn dsa_key_is_flagged() {
        let mut p = vec![0u8];
        p.extend([0xffu8; 128]); // 1024-бітне просте число
        let blob = wire(&[b"ssh-dss", &p, &[1u8; 20], &[2u8; 128], &[3u8; 128]]);
        let line = format!("ssh-dss {} legacy@host", b64_encode_nopad(&blob));
        let k = parse_key_line(&line).unwrap().unwrap();
        assert_eq!((k.key_type.as_str(), k.bits), ("ssh-dss", Some(1024)));
        let r = judge_hosts(vec![entry("h", parse_host(&input("", "unavailable", vec![keyfile("u", &line)]), ""))], vec![]);
        assert!(codes(&r).contains(&"KEY_DSA"));
    }

    #[test]
    fn mismatched_type_and_missing_comment() {
        let swapped = ED.replacen("ssh-ed25519", "ssh-dss", 1);
        assert!(parse_key_line(&swapped).is_err(), "blob type must match");
        let nocomment = ED.split_whitespace().take(2).collect::<Vec<_>>().join(" ");
        let p = parse_host(&input("", "unavailable", vec![keyfile("u", &nocomment)]), "");
        let r = judge_hosts(vec![entry("h", p)], vec![]);
        assert!(codes(&r).contains(&"KEY_NO_COMMENT"));
    }

    #[test]
    fn caps_hold() {
        let many: String = (0..MAX_KEYS_PER_HOST + 50).map(|_| format!("{ED}\n")).collect();
        let p = parse_host(&input("", "unavailable", vec![keyfile("u", &many)]), "");
        assert_eq!(p.keys.len(), MAX_KEYS_PER_HOST);
        assert!(p.truncated);
        let hosts: Vec<HostEntry> = (0..MAX_HOSTS + 5).map(|i| entry(&format!("h{i}"), ParsedHost::default())).collect();
        let r = judge_hosts(hosts, vec![]);
        assert_eq!(r.hosts_total as usize, MAX_HOSTS);
        assert!(r.truncated);
        let long = format!("{ED} {}", "x".repeat(MAX_KEY_LINE));
        let p = parse_host(&input("", "unavailable", vec![keyfile("u", &long)]), "");
        assert_eq!((p.keys.len(), p.skipped_lines), (0, 1));
    }

    #[test]
    fn garbage_never_panics() {
        let junk = "\u{0}\u{fffd}\"\\,=\n\"\"\"\nssh-rsa \nssh-rsa AAAA\n\\\\\\\n\"unterminated quote ssh-ed25519 AAAA";
        let p = parse_host(&input(junk, "file", vec![keyfile("u", junk)]), junk);
        let _ = judge_hosts(vec![entry("h", p)], vec![]);
    }
}
