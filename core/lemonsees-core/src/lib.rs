//! LemonSees core — гарячі шляхи двигуна, написані на безпечному Rust.
//!
//! Три задачі, які раніше виконувались на моніторованих серверах (awk/grep) або в JS:
//!   * [`auth`]  — аналіз журналів SSH-автентифікації (IPv4 + IPv6, часові вікна, виявлення «вдалий вхід після брутфорсу»);
//!   * [`rules`] — рушій правил виявлення: багато шаблонів за один прохід, пороги, часове вікно, групування;
//!   * [`fim`]   — порівняння знімка файлів із базовою лінією.
//!
//! Принципи (Altumptic PSB): жодного `unsafe` у цьому крейті, жодних panic на недовірених даних,
//! жорсткі ліміти на розмір вводу/шаблонів/груп, лінійний час регулярних виразів (немає ReDoS).
#![forbid(unsafe_code)]
#![warn(missing_docs)]

pub mod auth;
pub mod fim;
pub mod hash;
pub mod ip;
pub mod rules;
pub mod time;

/// Версія ядра (збігається з версією крейта).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Максимальна довжина рядка журналу, що розбирається; довші рядки обрізаються (захист від гігантських рядків).
pub const MAX_LINE_BYTES: usize = 4096;

/// Обрізає рядок до `max` байтів по межі символу UTF-8.
pub fn clip(line: &str, max: usize) -> &str {
    if line.len() <= max {
        return line;
    }
    let mut end = max;
    while end > 0 && !line.is_char_boundary(end) {
        end -= 1;
    }
    &line[..end]
}
