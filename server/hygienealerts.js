// Сповіщення про ЗМІНИ SSH-гігієни: новий ключ в authorized_keys і погіршення налаштувань sshd між двома сканами одного хоста.
//
// Модуль чистий (нічого не читає й не пише), тож його легко тестувати. Він порівнює два результати скану (`ParsedHost`) і повертає
// вхідні дані для інцидентів. Головна турбота тут не саме порівняння, а ХИБНІ ТРИВОГИ: якщо порівняти неповні дані, всі ключі
// стануть «новими» і засиплють журнал. Тому порівняння відбувається лише коли обидва скани повні й порівнянні (див. `comparable`).
import { isSuppressed } from "./suspects.js";

const MAX_PER_HOST = 20;

const clean = (v, n = 64) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, n);

/** Налаштування, погіршення яких важливе: значення "yes" небезпечне. [назва в sshd_config, серйозність, пояснення]. */
const WATCHED = {
  permitrootlogin: ["PermitRootLogin", "high", "Вхід root через SSH тепер дозволений."],
  passwordauthentication: ["PasswordAuthentication", "high", "Вхід за паролем тепер увімкнений: сервер вразливіший до підбору паролів."],
  permitemptypasswords: ["PermitEmptyPasswords", "critical", "Порожні паролі тепер дозволені."],
};
const unsafe = (v) => v === "yes";

/** Результат скану придатний для порівняння: є розібрані ключі й відомо, звідки взято налаштування. */
const usable = (e) => !!e && Array.isArray(e.host?.keys) && typeof e.host?.sshd_source === "string";

/** Користувачі, чий authorized_keys не вдалося прочитати: їхніх ключів у скані немає, але це не означає, що ключів нема. */
const unreadableUsers = (h) => new Set((h.unreadable ?? []).map((u) => String(u).split(":")[0]));

const weak = (k) => k.key_type === "ssh-dss" || (k.key_type === "ssh-rsa" && k.bits !== null && k.bits !== undefined && k.bits < 2048);

/**
 * Серйозність нового ключа. Слабкий ключ — завжди висока. Ключ, який аналітик оголосив очікуваним для цього хоста — низька
 * (ймовірно, навмисне розгортання). Ключ для root чи невідомий ключ при оголошеному списку — висока. Інакше середня.
 */
export function newKeySeverity(k, host, expected) {
  if (weak(k)) return "high";
  const listed = expected.find((e) => e.fingerprint === k.fingerprint);
  if (listed && (!listed.hosts?.length || listed.hosts.includes(host.id))) return "low";
  if (k.user === "root") return "high";
  if (expected.length > 0) return "high";
  return "medium";
}

function keyIncident(host, k, severity, { prevAt, nextAt }) {
  const user = clean(k.user) || "(empty)";
  const type = clean(k.key_type, 40) + (k.bits ? ` ${k.bits}` : "");
  const span = prevAt && nextAt ? ` Ключ зʼявився між скануваннями ${new Date(prevAt).toISOString()} і ${new Date(nextAt).toISOString()}.` : "";
  return {
    title: `Новий SSH-ключ на ${clean(host.name, 80)}: акаунт ${user}`,
    severity,
    hostId: host.id,
    category: "persistence",
    rule: `ssh-newkey:${clean(host.id)}:${user}:${clean(k.fingerprint, 80)}`,
    detail:
      `Новий ключ в authorized_keys акаунта ${user} (${clean(k.path, 200)}): ${type}, відбиток ${clean(k.fingerprint, 80)}.${span} ` +
      "Додавання ключа — типовий спосіб закріпитися на сервері. Якщо це не ти чи твоя команда, видали ключ, перевір, як він туди потрапив " +
      "(журнал входів, історія команд акаунта), і зміни пароль та ключі акаунта. LemonSees нічого не змінює на сервері сам.",
  };
}

function settingIncident(host, key, from, to) {
  const [name, severity, explain] = WATCHED[key];
  return {
    title: `Погіршення налаштувань SSH на ${clean(host.name, 80)}: ${name} став «${clean(to, 32)}»`,
    severity,
    hostId: host.id,
    category: "misconfiguration",
    rule: `ssh-setting:${clean(host.id)}:${key}`,
    detail: `${name} змінилося з «${clean(from, 32)}» на «${clean(to, 32)}». ${explain} Якщо це не планова зміна, поверни значення в sshd_config і перезавантаж sshd. LemonSees нічого не змінює на сервері сам.`,
  };
}

/**
 * Інциденти про зміни між `prev` і `next` (записи скану одного хоста: { id, name, error, host }).
 * opts: { expected, existing, now, prevAt, nextAt }. Повертає масив вхідних даних для addIncident (порожній, якщо порівнювати не можна).
 */
export function driftIncidents(prev, next, { expected = [], existing = [], now = Date.now(), prevAt = null, nextAt = null } = {}) {
  try {
    if (!usable(prev) || !usable(next) || next.error) return [];
    const host = { id: next.id, name: next.name };
    const out = [];
    const push = (spec) => {
      if (out.length < MAX_PER_HOST && !out.some((o) => o.rule === spec.rule) && !isSuppressed(existing, spec.rule, now)) out.push(spec);
    };
    const p = prev.host;
    const n = next.host;

    // 1. Налаштування: лише коли обидва скани мали те саме джерело (sshd -T чи файл) і воно відоме. Інакше «зміна» може бути
    //    просто різницею між точним значенням і значенням за замовчуванням.
    if (p.sshd_source === n.sshd_source && n.sshd_source !== "unavailable") {
      for (const key of Object.keys(WATCHED)) {
        const a = p.settings?.[key];
        const b = n.settings?.[key];
        if (a !== undefined && b !== undefined && !unsafe(a) && unsafe(b)) push(settingIncident(host, key, a, b));
      }
    }

    // 2. Нові ключі: не порівнюємо, якщо будь-який зі сканів обрізано, і пропускаємо акаунти, чий файл не читався в одному зі сканів
    if (!p.truncated && !n.truncated) {
      const skip = new Set([...unreadableUsers(p), ...unreadableUsers(n)]);
      const before = new Set(p.keys.map((k) => `${k.user}\0${k.fingerprint}`));
      for (const k of n.keys) {
        if (skip.has(k.user) || before.has(`${k.user}\0${k.fingerprint}`)) continue;
        push(keyIncident(host, k, newKeySeverity(k, host, expected), { prevAt, nextAt }));
      }
    }
    return out;
  } catch {
    return []; // порівняння ніколи не повинно ламати скан
  }
}
