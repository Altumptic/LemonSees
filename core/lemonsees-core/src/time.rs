//! Розбір часових міток рядків журналів без зовнішніх залежностей.
//!
//! Підтримані формати:
//!   1. ISO-8601 / RFC 3339 на початку рядка: `2026-11-04T10:15:01+0200`, `2026-11-04T10:15:01.123456+02:00`, `2026-11-04 10:15:01Z`
//!      (journald `-o short-iso`, сучасний rsyslog);
//!   2. класичний BSD-syslog без року й зони: `Nov  4 10:15:01` (journald `short`, auth.log);
//!   3. Common Log Format усередині рядка: `[04/Nov/2026:10:15:01 +0200]` (nginx/apache).
//!
//! Для формату 2 рік виводиться з `now`; якщо результат у майбутньому більш ніж на добу — береться попередній рік.
//! Для міток без зони береться `tz_offset_min` сервера (хвилини від UTC).

/// Контекст розбору.
#[derive(Clone, Copy, Debug)]
pub struct TimeCtx {
    /// Поточний час (мс від епохи UTC) — за годинником СЕРВЕРА, щоб вікна не залежали від годинника аналітика.
    pub now_ms: i64,
    /// Зсув локальної зони сервера від UTC, хвилини (наприклад, +0200 → 120).
    pub tz_offset_min: i32,
}

const MS_PER_DAY: i64 = 86_400_000;

/// Кількість днів від 1970-01-01 до цивільної дати (алгоритм H. Hinnant).
pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400;
    let mp = (i64::from(m) + 9) % 12;
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Цивільна дата з кількості днів від епохи.
pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = (if z >= 0 { z } else { z - 146_096 }) / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn digit(b: &[u8], i: usize) -> Option<u32> {
    b.get(i).filter(|c| c.is_ascii_digit()).map(|c| u32::from(c - b'0'))
}

fn num(b: &[u8], i: usize, n: usize) -> Option<u32> {
    let mut v = 0u32;
    for k in 0..n {
        v = v * 10 + digit(b, i + k)?;
    }
    Some(v)
}

fn month_abbr(b: &[u8]) -> Option<u32> {
    const M: [&[u8; 3]; 12] = [b"Jan", b"Feb", b"Mar", b"Apr", b"May", b"Jun", b"Jul", b"Aug", b"Sep", b"Oct", b"Nov", b"Dec"];
    let head = b.get(..3)?;
    M.iter().position(|m| m.as_slice() == head).map(|i| i as u32 + 1)
}

fn valid(mo: u32, d: u32, h: u32, mi: u32, s: u32) -> bool {
    (1..=12).contains(&mo) && (1..=31).contains(&d) && h < 24 && mi < 60 && s <= 60
}

#[allow(clippy::too_many_arguments)]
fn to_ms(y: i64, mo: u32, d: u32, h: u32, mi: u32, s: u32, ms: i64, offset_min: i32) -> i64 {
    let secs = days_from_civil(y, mo, d) * 86_400 + i64::from(h) * 3600 + i64::from(mi) * 60 + i64::from(s);
    secs * 1000 + ms - i64::from(offset_min) * 60_000
}

/// Парсер формату 1 (ISO-8601 на початку рядка).
fn parse_iso(b: &[u8], ctx: &TimeCtx) -> Option<i64> {
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || !(b[10] == b'T' || b[10] == b' ') || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let (y, mo, d) = (num(b, 0, 4)?, num(b, 5, 2)?, num(b, 8, 2)?);
    let (h, mi, s) = (num(b, 11, 2)?, num(b, 14, 2)?, num(b, 17, 2)?);
    if !valid(mo, d, h, mi, s) {
        return None;
    }
    let mut i = 19;
    let mut ms = 0i64;
    if b.get(i) == Some(&b'.') || b.get(i) == Some(&b',') {
        i += 1;
        let mut scale = 100;
        while let Some(dg) = digit(b, i) {
            ms += i64::from(dg) * scale;
            scale /= 10;
            i += 1;
        }
    }
    let offset = match b.get(i) {
        Some(b'Z') => 0,
        Some(&sign) if sign == b'+' || sign == b'-' => {
            let hh = num(b, i + 1, 2)?;
            let mm = if b.get(i + 3) == Some(&b':') { num(b, i + 4, 2)? } else { num(b, i + 3, 2).unwrap_or(0) };
            let v = (hh * 60 + mm) as i32;
            if sign == b'-' {
                -v
            } else {
                v
            }
        }
        _ => ctx.tz_offset_min,
    };
    Some(to_ms(i64::from(y), mo, d, h, mi, s, ms, offset))
}

/// Парсер формату 2 (BSD syslog без року).
fn parse_bsd(b: &[u8], ctx: &TimeCtx) -> Option<i64> {
    if b.len() < 15 {
        return None;
    }
    let mo = month_abbr(b)?;
    if b[3] != b' ' {
        return None;
    }
    let d = if b[4] == b' ' { digit(b, 5)? } else { num(b, 4, 2)? };
    if b[6] != b' ' || b[9] != b':' || b[12] != b':' {
        return None;
    }
    let (h, mi, s) = (num(b, 7, 2)?, num(b, 10, 2)?, num(b, 13, 2)?);
    if !valid(mo, d, h, mi, s) {
        return None;
    }
    let (now_year, _, _) = civil_from_days((ctx.now_ms + i64::from(ctx.tz_offset_min) * 60_000).div_euclid(MS_PER_DAY));
    let at = |y| to_ms(y, mo, d, h, mi, s, 0, ctx.tz_offset_min);
    let t = at(now_year);
    Some(if t > ctx.now_ms + MS_PER_DAY { at(now_year - 1) } else { t })
}

/// Парсер формату 3 (CLF у квадратних дужках).
fn parse_clf(b: &[u8], ctx: &TimeCtx) -> Option<i64> {
    let _ = ctx;
    let mut from = 0;
    for _ in 0..3 {
        let open = from + b.get(from..)?.iter().position(|&c| c == b'[')?;
        let s = &b[open + 1..];
        if s.len() >= 26 && s[2] == b'/' && s[6] == b'/' && s[11] == b':' && s[14] == b':' && s[17] == b':' && s[20] == b' ' {
            let d = num(s, 0, 2)?;
            let mo = month_abbr(&s[3..])?;
            let y = num(s, 7, 4)?;
            let (h, mi, sec) = (num(s, 12, 2)?, num(s, 15, 2)?, num(s, 18, 2)?);
            let sign = s[21];
            let (hh, mm) = (num(s, 22, 2)?, num(s, 24, 2)?);
            if (sign == b'+' || sign == b'-') && valid(mo, d, h, mi, sec) {
                let v = (hh * 60 + mm) as i32;
                return Some(to_ms(i64::from(y), mo, d, h, mi, sec, 0, if sign == b'-' { -v } else { v }));
            }
        }
        from = open + 1;
    }
    None
}

/// Час рядка журналу (мс від епохи UTC) або `None`, якщо формат невідомий.
pub fn parse_line_time(line: &str, ctx: &TimeCtx) -> Option<i64> {
    let b = line.as_bytes();
    parse_iso(b, ctx).or_else(|| parse_bsd(b, ctx)).or_else(|| parse_clf(b, ctx))
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-11-04T08:15:01Z
    const NOW: i64 = 1_793_780_101_000;
    const CTX: TimeCtx = TimeCtx { now_ms: NOW, tz_offset_min: 120 };

    #[test]
    fn civil_roundtrip() {
        for (y, m, d) in [(1970, 1, 1), (2000, 2, 29), (2026, 11, 4), (1969, 12, 31), (2100, 3, 1)] {
            assert_eq!(civil_from_days(days_from_civil(y, m, d)), (y, m, d));
        }
        assert_eq!(days_from_civil(1970, 1, 1), 0);
        assert_eq!(days_from_civil(2026, 11, 4) * 86_400_000, 1_793_750_400_000);
    }

    #[test]
    fn iso_with_offset_and_fraction() {
        let t = parse_line_time("2026-11-04T10:15:01+0200 host sshd[1]: x", &CTX).unwrap();
        assert_eq!(t, NOW);
        let t2 = parse_line_time("2026-11-04T10:15:01.250000+02:00 host", &CTX).unwrap();
        assert_eq!(t2, NOW + 250);
        let t3 = parse_line_time("2026-11-04 08:15:01Z host", &CTX).unwrap();
        assert_eq!(t3, NOW);
        // без зони → зсув сервера
        let t4 = parse_line_time("2026-11-04T10:15:01 host", &CTX).unwrap();
        assert_eq!(t4, NOW);
    }

    #[test]
    fn bsd_syslog_infers_year() {
        let t = parse_line_time("Nov  4 10:15:01 host sshd[1]: x", &CTX).unwrap();
        assert_eq!(t, NOW);
        let t2 = parse_line_time("Nov 04 10:15:01 host", &CTX).unwrap();
        assert_eq!(t2, NOW);
        // декабрський запис у листопаді → минулий рік
        let t3 = parse_line_time("Dec 31 23:00:00 host", &CTX).unwrap();
        assert!(t3 < NOW && NOW - t3 < 366 * 86_400_000);
    }

    #[test]
    fn common_log_format() {
        let line = r#"203.0.113.5 - - [04/Nov/2026:10:15:01 +0200] "GET / HTTP/1.1" 200 12"#;
        assert_eq!(parse_line_time(line, &CTX), Some(NOW));
    }

    #[test]
    fn rejects_garbage_without_panicking() {
        for s in ["", "x", "2026-13-45T99:99:99", "Foo  4 10:15:01", "[04/Nov/2026", "[", "9999-99-99 99:99:99Z", "Nov  4 25:00:00 h"] {
            assert_eq!(parse_line_time(s, &CTX), None, "{s:?}");
        }
        let long = "[".repeat(10_000);
        assert_eq!(parse_line_time(&long, &CTX), None);
    }
}
