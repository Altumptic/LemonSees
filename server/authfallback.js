// Запасний пошук підозрілих входів на JavaScript — коли Rust-ядро недоступне (немає .wasm, LEMONSEES_CORE=off, збій модуля).
//
// Це ДОСЛІВНЕ відтворення тієї частини `core/lemonsees-core/src/auth.rs`, яка потрібна для підозрілих входів: ті самі маркери
// рядків (найлівіший збіг, а при рівності перший у списку), той самий розбір часу в трьох форматах (`time.rs`), та сама класифікація
// внутрішніх адрес (`ip.rs`) і та сама логіка «успіх після N спроб з тієї ж адреси». Розбіжність із ядром — це помилка:
// `test/authfallback.test.js` порівнює обидві реалізації на сотнях випадкових журналів.
//
// Свідоме обмеження обсягу: тут лише підозрілі входи. Сторінка загроз (атакуючі, користувачі, гістограма) і далі потребує ядра.
// Користувацькі регулярні вирази тут не виконуються взагалі: розбір рядків — це фіксований набір пошуків підрядків.
import net from "node:net";

const MARKERS = ["Failed password for ", "Failed publickey for ", "Failed keyboard-interactive/pam for ", "Invalid user ", "Accepted ", "authentication failure"];
const K_FAILED = 0;
const K_INVALID = 1;
const K_PAM = 2;
const MAX_LINES = 5_000_000;
const MAX_IPS = 100_000;
const MAX_SUSPECTS = 50;
const MAX_USER_LEN = 64;
const MAX_LINE_BYTES = 4096;
const MAX_WINDOW_HOURS = 168;
const MS_PER_DAY = 86_400_000;

/* ---------- час (time.rs) ---------- */

const trunc = Math.trunc;

function daysFromCivil(y, m, d) {
  y = m <= 2 ? y - 1 : y;
  const era = trunc((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const mp = (m + 9) % 12;
  const doy = trunc((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + trunc(yoe / 4) - trunc(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

function yearFromDays(z) {
  z += 719_468;
  const era = trunc((z >= 0 ? z : z - 146_096) / 146_097);
  const doe = z - era * 146_097;
  const yoe = trunc((doe - trunc(doe / 1460) + trunc(doe / 36_524) - trunc(doe / 146_096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + trunc(yoe / 4) - trunc(yoe / 100));
  const mp = trunc((5 * doy + 2) / 153);
  const m = mp < 10 ? mp + 3 : mp - 9;
  return m <= 2 ? y + 1 : y;
}

const digit = (s, i) => {
  const c = i >= 0 && i < s.length ? s.charCodeAt(i) : -1;
  return c >= 48 && c <= 57 ? c - 48 : null;
};

function num(s, i, n) {
  let v = 0;
  for (let k = 0; k < n; k++) {
    const d = digit(s, i + k);
    if (d === null) return null;
    v = v * 10 + d;
  }
  return v;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthAbbr(s) {
  if (s.length < 3) return null;
  const i = MONTHS.indexOf(s.slice(0, 3));
  return i < 0 ? null : i + 1;
}

const valid = (mo, d, h, mi, s) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h < 24 && mi < 60 && s <= 60;

const toMs = (y, mo, d, h, mi, s, ms, offsetMin) => (daysFromCivil(y, mo, d) * 86_400 + h * 3600 + mi * 60 + s) * 1000 + ms - offsetMin * 60_000;

function parseIso(b, ctx) {
  if (b.length < 19 || b[4] !== "-" || b[7] !== "-" || !(b[10] === "T" || b[10] === " ") || b[13] !== ":" || b[16] !== ":") return null;
  const y = num(b, 0, 4), mo = num(b, 5, 2), d = num(b, 8, 2);
  const h = num(b, 11, 2), mi = num(b, 14, 2), s = num(b, 17, 2);
  if ([y, mo, d, h, mi, s].some((v) => v === null) || !valid(mo, d, h, mi, s)) return null;
  let i = 19;
  let ms = 0;
  if (b[i] === "." || b[i] === ",") {
    i++;
    let scale = 100;
    for (let dg = digit(b, i); dg !== null; dg = digit(b, i)) {
      ms += dg * scale;
      scale = trunc(scale / 10);
      i++;
    }
  }
  let offset;
  if (b[i] === "Z") offset = 0;
  else if (b[i] === "+" || b[i] === "-") {
    const hh = num(b, i + 1, 2);
    if (hh === null) return null;
    const mm = b[i + 3] === ":" ? num(b, i + 4, 2) : (num(b, i + 3, 2) ?? 0);
    if (mm === null) return null;
    const v = hh * 60 + mm;
    offset = b[i] === "-" ? -v : v;
  } else offset = ctx.tzOffsetMin;
  return toMs(y, mo, d, h, mi, s, ms, offset);
}

function parseBsd(b, ctx) {
  if (b.length < 15) return null;
  const mo = monthAbbr(b);
  if (mo === null || b[3] !== " ") return null;
  const d = b[4] === " " ? digit(b, 5) : num(b, 4, 2);
  if (d === null || b[6] !== " " || b[9] !== ":" || b[12] !== ":") return null;
  const h = num(b, 7, 2), mi = num(b, 10, 2), s = num(b, 13, 2);
  if (h === null || mi === null || s === null || !valid(mo, d, h, mi, s)) return null;
  const nowYear = yearFromDays(Math.floor((ctx.nowMs + ctx.tzOffsetMin * 60_000) / MS_PER_DAY));
  const at = (y) => toMs(y, mo, d, h, mi, s, 0, ctx.tzOffsetMin);
  const t = at(nowYear);
  return t > ctx.nowMs + MS_PER_DAY ? at(nowYear - 1) : t;
}

function parseClf(b) {
  let from = 0;
  for (let n = 0; n < 3; n++) {
    const rel = b.indexOf("[", from);
    if (rel < 0) return null;
    const s = b.slice(rel + 1);
    if (s.length >= 26 && s[2] === "/" && s[6] === "/" && s[11] === ":" && s[14] === ":" && s[17] === ":" && s[20] === " ") {
      const d = num(s, 0, 2);
      const mo = monthAbbr(s.slice(3));
      const y = num(s, 7, 4);
      const h = num(s, 12, 2), mi = num(s, 15, 2), sec = num(s, 18, 2);
      const sign = s[21];
      const hh = num(s, 22, 2), mm = num(s, 24, 2);
      if ([d, mo, y, h, mi, sec, hh, mm].some((v) => v === null)) return null;
      if ((sign === "+" || sign === "-") && valid(mo, d, h, mi, sec)) {
        const v = hh * 60 + mm;
        return toMs(y, mo, d, h, mi, sec, 0, sign === "-" ? -v : v);
      }
    }
    from = rel + 1;
  }
  return null;
}

/** Час рядка журналу (мс від епохи UTC) або null. ctx: { nowMs, tzOffsetMin }. */
export function parseLineTime(line, ctx) {
  return parseIso(line, ctx) ?? parseBsd(line, ctx) ?? parseClf(line);
}

/* ---------- адреси (ip.rs) ---------- */

/** 4, 6 або null. Як у Rust: порожнє й довше 45 символів відкидаються; зона (`%eth0`) не допускається. */
export function ipVersion(s) {
  if (!s || s.length > 45 || s.includes("%")) return null;
  const v = net.isIP(s);
  return v === 4 || v === 6 ? v : null;
}

function privateV4(o) {
  return (
    o[0] === 10 ||
    (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
    (o[0] === 192 && o[1] === 168) ||
    o[0] === 127 ||
    (o[0] === 169 && o[1] === 254) ||
    (o[0] === 0 && o[1] === 0 && o[2] === 0 && o[3] === 0) ||
    (o[0] >= 224 && o[0] <= 239) ||
    (o[0] === 100 && o[1] >= 64 && o[1] <= 127)
  );
}

/** Розкриває IPv6 у 8 сегментів (з підтримкою `::` і IPv4 у хвості). */
function segmentsV6(s) {
  let tail = [];
  if (s.includes(".")) {
    const i = s.lastIndexOf(":");
    const o = s.slice(i + 1).split(".").map(Number);
    s = s.slice(0, i + 1) + ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
  }
  const [head, rest] = s.split("::");
  const h = head ? head.split(":") : [];
  tail = rest !== undefined ? (rest ? rest.split(":") : []) : [];
  const zeros = rest !== undefined ? 8 - h.length - tail.length : 0;
  return [...h, ...Array(Math.max(0, zeros)).fill("0"), ...tail].map((x) => parseInt(x, 16));
}

export function isPrivate(ip) {
  const v = ipVersion(ip);
  if (v === 4) return privateV4(ip.split(".").map(Number));
  if (v !== 6) return false;
  const g = segmentsV6(ip);
  if (g.length !== 8) return false;
  // v4-mapped: ::ffff:a.b.c.d
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return privateV4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  const loopback = g.slice(0, 7).every((x) => x === 0) && g[7] === 1;
  const unspecified = g.every((x) => x === 0);
  return loopback || unspecified || (g[0] & 0xff00) === 0xff00 || (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80;
}

/* ---------- підозрілі входи (auth.rs) ---------- */

function firstMarker(line) {
  let best = -1;
  let k = -1;
  for (let i = 0; i < MARKERS.length; i++) {
    const p = line.indexOf(MARKERS[i]);
    if (p >= 0 && (best < 0 || p < best)) {
      best = p;
      k = i;
    }
  }
  return k < 0 ? null : { k, end: best + MARKERS[k].length };
}

/** "<користувач> from <ip> …" → { user, ip } або null. */
function userFromIp(rest) {
  const pos = rest.lastIndexOf(" from ");
  if (pos < 0) return null;
  const tok = rest.slice(pos + 6).split(" ")[0];
  return ipVersion(tok) ? { user: rest.slice(0, pos), ip: tok } : null;
}

const clipBytes = (s, n) => (Buffer.byteLength(s) > n ? Buffer.from(s).subarray(0, n).toString("utf8") : s);
const label = (u) => (u === "" ? "(empty)" : clipBytes(u, MAX_USER_LEN));

/**
 * Підозрілі входи в тексті журналу.
 * opts: { nowMs, tzOffsetMin = 0, windowHours = 48, threshold = 5 }. Повертає масив у тому ж вигляді, що й `core.auth().suspects`.
 */
export function findSuspects(text, { nowMs, tzOffsetMin = 0, windowHours = 48, threshold = 5 } = {}) {
  const ctx = { nowMs, tzOffsetMin };
  const wh = Math.min(Math.max(0, Math.floor(windowHours)), MAX_WINDOW_HOURS);
  const ips = new Map(); // ip → [Failed, Invalid, PAM]
  const suspects = [];
  const attempts = (ip) => {
    const c = ips.get(ip);
    return c ? Math.max(c[0], c[1], c[2]) : 0;
  };
  const bump = (kind, ip) => {
    let c = ips.get(ip);
    if (!c) {
      if (ips.size >= MAX_IPS) return;
      c = [0, 0, 0];
      ips.set(ip, c);
    }
    c[kind]++;
  };

  let n = 0;
  for (const rawLine of String(text).split("\n")) {
    if (++n > MAX_LINES) break;
    const line = clipBytes(rawLine.replace(/\r+$/, ""), MAX_LINE_BYTES);
    if (Buffer.byteLength(line) < 10) continue;
    const m = firstMarker(line);
    if (!m || !line.includes("sshd")) continue;
    const rest = line.slice(m.end);
    const ts = parseLineTime(line, ctx);
    if (wh > 0 && ts !== null && ts < nowMs - wh * 3_600_000) continue;

    if (m.k <= 2) {
      const r = userFromIp(rest.startsWith("invalid user ") ? rest.slice("invalid user ".length) : rest);
      if (r) bump(K_FAILED, r.ip);
    } else if (m.k === 3) {
      const r = userFromIp(rest);
      if (r) bump(K_INVALID, r.ip);
    } else if (m.k === 4) {
      const sp = rest.indexOf(" ");
      if (sp < 0) continue;
      const after = rest.slice(sp + 1);
      if (!after.startsWith("for ")) continue;
      const r = userFromIp(after.slice(4));
      if (!r) continue;
      const before = attempts(r.ip);
      // Як у Rust: порівняння з ЗБЕРЕЖЕНИМ ярликом (порожнє імʼя → "(empty)") іде по сирому імені; це відомий нюанс, збережений для паритету
      if (before >= threshold && suspects.length < MAX_SUSPECTS && !suspects.some((s) => s.ip === r.ip && s.user === r.user)) {
        suspects.push({ ip: r.ip, user: label(r.user), method: rest.slice(0, sp), accepted_ms: ts, failures_before: before, private: isPrivate(r.ip) });
      }
    } else {
      const i = line.indexOf("rhost=");
      if (i < 0) continue;
      const tok = line.slice(i + 6).split(" ")[0];
      if (ipVersion(tok)) bump(K_PAM, tok);
    }
  }
  return suspects;
}
