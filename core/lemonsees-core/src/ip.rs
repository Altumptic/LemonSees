//! Розбір та класифікація IP-адрес у рядках журналів.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

/// Розбирає IPv4/IPv6 (без порту, без дужок).
pub fn parse_ip(s: &str) -> Option<IpAddr> {
    if s.is_empty() || s.len() > 45 {
        return None;
    }
    s.parse::<IpAddr>().ok()
}

/// Чи адреса «внутрішня»: приватна, loopback, link-local, CGNAT, ULA, unspecified, multicast.
pub fn is_private(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(a) => is_private_v4(a),
        IpAddr::V6(a) => is_private_v6(a),
    }
}

fn is_private_v4(a: &Ipv4Addr) -> bool {
    let o = a.octets();
    a.is_private() || a.is_loopback() || a.is_link_local() || a.is_unspecified() || a.is_multicast() || (o[0] == 100 && (64..=127).contains(&o[1]))
    // 100.64.0.0/10 (CGNAT)
}

fn is_private_v6(a: &Ipv6Addr) -> bool {
    if let Some(v4) = a.to_ipv4_mapped() {
        return is_private_v4(&v4);
    }
    let seg = a.segments();
    a.is_loopback()
        || a.is_unspecified()
        || a.is_multicast()
        || (seg[0] & 0xfe00) == 0xfc00 // fc00::/7 (ULA)
        || (seg[0] & 0xffc0) == 0xfe80 // fe80::/10 (link-local)
}

fn is_sep(c: char) -> bool {
    c.is_whitespace() || matches!(c, '=' | ',' | '(' | ')' | '[' | ']' | ';' | '"' | '\'' | '<' | '>')
}

/// Перша IP-адреса в рядку (токени, розділені пробілами та розділовими знаками; допускає `ip:port` для IPv4).
pub fn first_ip_in(line: &str) -> Option<&str> {
    for tok in line.split(is_sep) {
        if tok.len() < 2 {
            continue;
        }
        if parse_ip(tok).is_some() {
            return Some(tok);
        }
        if let Some((left, right)) = tok.rsplit_once(':') {
            if !left.contains(':') && right.bytes().all(|b| b.is_ascii_digit()) && parse_ip(left).is_some() {
                return Some(left);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_private_ranges() {
        for s in ["10.1.2.3", "192.168.0.1", "172.16.5.5", "127.0.0.1", "169.254.1.1", "100.64.0.9", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"] {
            assert!(is_private(&parse_ip(s).unwrap()), "{s} must be private");
        }
        for s in ["8.8.8.8", "203.0.113.9", "2001:db8::1", "100.128.0.1", "172.32.0.1"] {
            assert!(!is_private(&parse_ip(s).unwrap()), "{s} must be public");
        }
    }

    #[test]
    fn finds_ip_tokens() {
        assert_eq!(first_ip_in("conn from 203.0.113.9 port 22"), Some("203.0.113.9"));
        assert_eq!(first_ip_in("rhost=2001:db8::7  user=root"), Some("2001:db8::7"));
        assert_eq!(first_ip_in("peer 198.51.100.4:51514 closed"), Some("198.51.100.4"));
        assert_eq!(first_ip_in("no address here 12345"), None);
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_ip("").is_none());
        assert!(parse_ip("999.1.1.1").is_none());
        assert!(parse_ip(&"1".repeat(100)).is_none());
    }
}
