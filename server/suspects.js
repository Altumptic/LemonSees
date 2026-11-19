// Автоматичні інциденти про «підозрілий вхід»: успішний вхід з адреси, яка перед тим багато разів невдало намагалась.
//
// Ядро (`core.auth`) знаходить такі входи; тут вони перетворюються на інциденти, які йдуть тим самим шляхом, що й решта
// (журнал, аудит, сповіщення в інтеграції). Модуль чистий: нічого не читає й не пише, тож його легко тестувати.
//
// Чесні обмеження: поріг рахується по адресі, а не по людині. Спільна NAT-адреса офісу з кількома помилками паролів, чи
// автоматизація з неправильними обліковими даними, можуть дати хибну тривогу, тому поріг налаштовується (за замовчуванням 10),
// а серйозність залежить від адреси й методу входу.

const DAY = 86_400_000;
const MAX_PER_SWEEP = 20;

/** Прибирає керівні символи й обрізає: імена приходять із журналу хоста і потрапляють у назви інцидентів та сповіщення. */
const clean = (v, n = 64) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, n);

/** Серйозність: публічна адреса + пароль → critical; публічна + ключ → high; внутрішня + пароль → medium; внутрішня + ключ → low. */
export function severityFor(s) {
  const keyBased = s.method === "publickey";
  if (!s.private) return keyBased ? "high" : "critical";
  return keyBased ? "low" : "medium";
}

/** Ключ дедуплікації: хост + адреса + користувач (addIncident порівнює лише `rule`, тож хост мусить бути в ключі). */
export const ruleKey = (hostId, s) => `ssh-suspect:${clean(hostId, 64)}:${clean(s.ip)}:${clean(s.user)}`;

/** Вхідні дані для addIncident. */
export function incidentFor(host, s) {
  const ip = clean(s.ip);
  const user = clean(s.user) || "(empty)";
  const method = clean(s.method, 32) || "?";
  const when = s.accepted_ms ? ` Час входу: ${new Date(s.accepted_ms).toISOString()}.` : "";
  return {
    title: `Підозрілий вхід на ${clean(host.name, 80)}: ${user} з ${ip}`,
    severity: severityFor(s),
    hostId: host.id,
    category: "credential access",
    rule: ruleKey(host.id, s),
    detail:
      `Успішний вхід (${method}) користувача ${user} з ${ip} після ${s.failures_before} невдалих спроб з цієї ж адреси за останні години` +
      `${s.private ? "; адреса внутрішня" : ""}.${when} ` +
      "Так виглядає вдалий підбір пароля, але це може бути й легітимний користувач, який кілька разів помилився, або автоматизація з неправильними обліковими даними. " +
      "Що зробити: перевір, чи це ти (last, who, journalctl _COMM=sshd). Якщо ні, заблокуй адресу, зміни пароль чи ключ акаунта, перегляньте ~/.ssh/authorized_keys " +
      "та історію команд. LemonSees нічого не змінює на сервері сам.",
  };
}

/**
 * Які підозрілі входи ще не мають інциденту. Пропускаються ті, для яких є відкритий інцидент, АБО будь-який (навіть закритий)
 * створений за останню добу: інакше вхід, що лишається у вікні перевірки, породжував би новий інцидент щоциклу.
 */
export function newIncidents(host, suspects, existing, now = Date.now()) {
  const out = [];
  const seen = new Set();
  for (const s of suspects ?? []) {
    const rule = ruleKey(host.id, s);
    if (seen.has(rule)) continue;
    seen.add(rule);
    if (existing.some((i) => i.rule === rule && (i.status !== "closed" || now - (i.createdAt ?? 0) < DAY))) continue;
    out.push(incidentFor(host, s));
    if (out.length >= MAX_PER_SWEEP) break; // обмеження: один хост під атакою не повинен засипати журнал
  }
  return out;
}
