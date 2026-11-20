// SSH-гігієна парку (docs/features/ssh-hygiene.md): ефективні налаштування sshd, ключі в authorized_keys з відбитками,
// дублікати, невідомі та застарілі ключі. Лише читання: жодна команда нічого не пише на сервер.
// Аналіз виконує Rust-ядро (core.sshParse / core.sshJudge); без ядра функція недоступна (чесна помилка, не мовчазний резерв).
import crypto from "node:crypto";
import { core } from "./core/index.js";
import { loadHygiene, saveHygiene, loadSoc } from "./config.js";
import { driftIncidents } from "./hygienealerts.js";

const MAX_FILE_BYTES = 262144;
const MAX_EXPECTED = 2000;
const FP_RE = /^SHA256:[A-Za-z0-9+/]{43}$/;
const DEFAULT_STALE_DAYS = 180;

/* ------------------------- скрипти для хоста (лише читання) ------------------------- */

/**
 * Скрипт 1: налаштування sshd, список користувачів і їхні authorized_keys.
 * `n` — одноразовий nonce: мітки розмітки непередбачувані, тож вміст файлів не може підробити розмітку виводу.
 * `sudo -n` — лише якщо доступний без пароля (як у FIM); інакше читаємо те, що дозволено поточному акаунту.
 */
export const keysScript = (n) => String.raw`LANG=C
S=""; sudo -n true 2>/dev/null && S="sudo -n"
echo "@@NOW:${n}@@ $(date +%s) $(date +%z)"
echo "@@SSHD:${n}@@"
OUT=$($S sshd -T 2>/dev/null </dev/null || $S /usr/sbin/sshd -T 2>/dev/null </dev/null)
if [ -n "$OUT" ]; then echo "SOURCE sshd -T"; printf '%s\n' "$OUT" | head -n 400
else
  CFG=$( { cat /etc/ssh/sshd_config.d/*.conf; cat /etc/ssh/sshd_config; } 2>/dev/null | head -n 2000 )
  if [ -n "$CFG" ]; then echo "SOURCE file"; printf '%s\n' "$CFG"; else echo "SOURCE unavailable"; fi
fi
echo "@@KEYS:${n}@@"
getent passwd | awk -F: '($3>=1000||$3==0) && $7!~/(nologin|false)$/ && $6 ~ /^\// {print $1 ":" $6}' | head -n 500 | while IFS=: read -r u h; do
  if ! $S test -x "$h" </dev/null; then printf '@@UNREADABLE:${n}@@\t%s\t%s\n' "$u" "$h/.ssh/authorized_keys"; continue; fi
  for f in "$h/.ssh/authorized_keys" "$h/.ssh/authorized_keys2"; do
    if $S test -e "$f" </dev/null; then
      if $S test -r "$f" </dev/null; then
        printf '@@FILE:${n}@@\t%s\t%s\n' "$u" "$f"
        $S head -c ${MAX_FILE_BYTES} "$f" 2>/dev/null </dev/null
        printf '\n'
        sz=$($S stat -c %s "$f" 2>/dev/null </dev/null || echo 0)
        [ "$sz" -gt ${MAX_FILE_BYTES} ] && printf '@@TRUNCATED:${n}@@\n'
        printf '@@ENDFILE:${n}@@\n'
      else
        printf '@@UNREADABLE:${n}@@\t%s\t%s\n' "$u" "$f"
      fi
    fi
  done
done
echo "@@END:${n}@@"`;

/** Скрипт 2: коли і якими ключами заходили (рядки `Accepted publickey`) і найстаріший рядок журналу. */
export const usageScript = (n) => String.raw`LANG=C
S=""; sudo -n true 2>/dev/null && S="sudo -n"
echo "@@NOW:${n}@@ $(date +%s) $(date +%z)"
echo "@@OLDEST:${n}@@"
o=$(timeout 10 $S journalctl _COMM=sshd --no-pager -o short-iso --since "400 days ago" 2>/dev/null </dev/null | head -n 1)
if [ -z "$o" ]; then f=$(ls -tr /var/log/auth.log* /var/log/secure* 2>/dev/null | head -n 1); [ -n "$f" ] && o=$($S zcat -f "$f" 2>/dev/null </dev/null | head -n 1); fi
printf '%s\n' "$o"
echo "@@USAGE:${n}@@"
( timeout 25 $S journalctl _COMM=sshd --no-pager -o short-iso --since "400 days ago" 2>/dev/null </dev/null; $S zcat -f /var/log/auth.log* /var/log/secure* 2>/dev/null </dev/null ) | grep -a 'Accepted publickey' | tail -n 200000
echo "@@END:${n}@@"`;

const tzMinutes = (z) => {
  const m = /^([+-])(\d\d)(\d\d)$/.exec(z || "");
  return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
};

/** Розбір виводу скрипту 1. Повертає null, якщо вивід неповний (немає кінцевої мітки). */
export function parseKeysOutput(stdout, n) {
  const res = { now_ms: 0, tz_offset_min: 0, sshd_source: "unavailable", sshd_lines: [], keys: [], ended: false };
  let section = "";
  let file = null;
  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith(`@@NOW:${n}@@`)) {
      const m = /^@@NOW:[0-9a-f]+@@ (\d+) ([+-]\d{4})/.exec(line);
      if (m) [res.now_ms, res.tz_offset_min] = [+m[1] * 1000, tzMinutes(m[2])];
    } else if (line === `@@SSHD:${n}@@`) section = "sshd";
    else if (line === `@@KEYS:${n}@@`) section = "keys";
    else if (line === `@@END:${n}@@`) res.ended = true;
    else if (line.startsWith(`@@FILE:${n}@@\t`)) {
      const [, user = "", path = ""] = line.split("\t");
      file = { user: user.slice(0, 64), path: path.slice(0, 300), text: "", unreadable: false, truncated: false };
      res.keys.push(file);
    } else if (line.startsWith(`@@UNREADABLE:${n}@@\t`)) {
      const [, user = "", path = ""] = line.split("\t");
      res.keys.push({ user: user.slice(0, 64), path: path.slice(0, 300), text: "", unreadable: true, truncated: false });
    } else if (line === `@@TRUNCATED:${n}@@`) {
      if (file) file.truncated = true;
    } else if (line === `@@ENDFILE:${n}@@`) file = null;
    else if (section === "sshd") {
      if (line.startsWith("SOURCE ") && res.sshd_lines.length === 0 && res.sshd_source === "unavailable") res.sshd_source = line.slice(7).trim();
      else res.sshd_lines.push(line);
    } else if (section === "keys" && file) file.text += line + "\n";
  }
  return res.ended ? res : null;
}

/** Розбір виводу скрипту 2. */
export function parseUsageOutput(stdout, n) {
  const res = { now_ms: 0, tz_offset_min: 0, oldest_line: "", usage: "", ended: false };
  let section = "";
  const usage = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith(`@@NOW:${n}@@`)) {
      const m = /^@@NOW:[0-9a-f]+@@ (\d+) ([+-]\d{4})/.exec(line);
      if (m) [res.now_ms, res.tz_offset_min] = [+m[1] * 1000, tzMinutes(m[2])];
    } else if (line === `@@OLDEST:${n}@@`) section = "oldest";
    else if (line === `@@USAGE:${n}@@`) section = "usage";
    else if (line === `@@END:${n}@@`) res.ended = true;
    else if (section === "oldest" && !res.oldest_line) res.oldest_line = line.slice(0, 4096);
    else if (section === "usage") usage.push(line);
  }
  res.usage = usage.join("\n");
  return res;
}

const randomSeed = () => crypto.randomBytes(6).readUIntBE(0, 6);

/** Збирає і розбирає дані одного хоста. Кидає помилку, якщо ядро чи хост недоступні. */
export async function collectHost(conn) {
  const n = crypto.randomBytes(8).toString("hex");
  const a = await conn.exec(keysScript(n), { timeout: 90000, maxBytes: 24 * 1024 * 1024 });
  const first = parseKeysOutput(a.stdout, n);
  if (!first) throw new Error("Хост повернув неповний вивід");

  let second = { now_ms: first.now_ms, tz_offset_min: first.tz_offset_min, oldest_line: "", usage: "" };
  let usageTruncated = false;
  try {
    const b = await conn.exec(usageScript(n), { timeout: 90000, maxBytes: 48 * 1024 * 1024 });
    second = parseUsageOutput(b.stdout, n);
    usageTruncated = !!b.truncated;
  } catch {
    /* історія журналів недоступна: ключі все одно оцінюються, лише без "застарілих" */
  }

  const parsed = core.sshParse(
    {
      sshd_text: first.sshd_lines.join("\n"),
      sshd_source: first.sshd_source,
      keys: first.keys,
      oldest_line: second.oldest_line,
      now_ms: second.now_ms || first.now_ms || Date.now(),
      tz_offset_min: second.now_ms ? second.tz_offset_min : first.tz_offset_min,
      seed: randomSeed(),
    },
    second.usage,
  );
  if (!parsed) throw new Error("Rust-ядро недоступне або відхилило дані");
  if (a.truncated || usageTruncated) parsed.truncated = true;
  return parsed;
}

/** Сканує хости з обмеженою паралельністю. Недоступний хост потрапляє у звіт з помилкою, а не зникає. */
export async function scanHosts(hosts, conns, { concurrency = 4 } = {}) {
  const out = new Array(hosts.length);
  let next = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const i = next++;
      const h = hosts[i];
      const conn = conns.get(h.id);
      try {
        if (!conn || !conn.ready) throw new Error("Хост не підключено");
        out[i] = { id: h.id, name: h.name, error: null, host: await collectHost(conn) };
      } catch (e) {
        out[i] = { id: h.id, name: h.name, error: String(e?.message || e).slice(0, 200), host: {} };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, worker));
  return out;
}

/* ------------------------- очікувані ключі ------------------------- */

/** Перевіряє і нормалізує список очікуваних ключів. Кидає помилку з поясненням. */
export function sanitizeExpected(list, knownHostIds = []) {
  if (!Array.isArray(list)) throw new Error("Очікується масив ключів");
  if (list.length > MAX_EXPECTED) throw new Error(`Забагато ключів (максимум ${MAX_EXPECTED})`);
  const known = new Set(knownHostIds);
  const seen = new Set();
  return list.map((e, i) => {
    const fingerprint = String(e?.fingerprint ?? "").trim();
    if (!FP_RE.test(fingerprint)) throw new Error(`Запис ${i + 1}: відбиток має вигляд SHA256:… (43 символи base64)`);
    if (seen.has(fingerprint)) throw new Error(`Запис ${i + 1}: відбиток повторюється`);
    seen.add(fingerprint);
    const hosts = Array.isArray(e.hosts) ? [...new Set(e.hosts.map(String))].filter((h) => known.has(h)).slice(0, 500) : [];
    return { fingerprint, owner: String(e.owner ?? "").trim().slice(0, 80), purpose: String(e.purpose ?? "").trim().slice(0, 120), hosts };
  });
}

const clampDays = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(7, Math.min(3650, n)) : DEFAULT_STALE_DAYS;
};

/* ------------------------- експорт ------------------------- */

/** Імена хостів і акаунтів надходять із самого хоста: екрануємо розмітку Markdown, щоб звіт не міг містити чужі посилання чи зображення. */
const mdEsc = (v) => String(v ?? "").replace(/[\\`*_{}[\]<>()#+!|~]/g, "\\$&").replace(/[\r\n]+/g, " ");

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // захист від CSV-ін'єкції формул
  return `"${s.replace(/"/g, '""')}"`;
};

/** Коментарі ключів часто містять імена й email: у експортованому звіті вони маскуються, якщо не заявлено інше. */
function maskFindings(findings, includeComments) {
  return findings.map((f) => (includeComments || !f.params?.comment ? f : { ...f, params: { ...f.params, comment: "***" } }));
}

export function renderCsv(report, includeComments) {
  const head = ["severity", "code", "host", "user", "fingerprint", "title", "suggestion"];
  const rows = maskFindings(report.findings, includeComments).map((f) => [f.severity, f.code, f.host_name ?? "", f.user ?? "", f.fingerprint ?? "", f.title, f.suggestion]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function renderMarkdown(report, { includeComments = false, version = "" } = {}) {
  const day = new Date(report.generated_ms).toISOString().slice(0, 10);
  const sev = ["critical", "high", "medium", "low", "info"];
  const lines = [
    `# SSH hygiene report — ${day}`,
    "",
    `Hosts scanned: **${report.hosts_scanned} of ${report.hosts_total}** · keys: **${report.keys_total}** (${report.unique_keys} unique) · stale threshold: ${report.stale_days} days`,
    "",
    "| Severity | Findings |",
    "|---|---|",
    ...sev.map((s) => `| ${s} | ${report.by_severity?.[s] ?? 0} |`),
    "",
    report.expected_declared ? "An expected-keys list is declared." : "No expected-keys list is declared, so unknown keys are not reported.",
    "",
  ];
  const findings = maskFindings(report.findings, includeComments);
  for (const s of sev) {
    const group = findings.filter((f) => f.severity === s);
    if (!group.length) continue;
    lines.push(`## ${s[0].toUpperCase()}${s.slice(1)} (${group.length})`, "");
    for (const f of group) {
      const where = [f.host_name && `host ${mdEsc(f.host_name)}`, f.user && `user ${mdEsc(f.user)}`, f.fingerprint && `key ${mdEsc(f.fingerprint)}`].filter(Boolean).join(", ");
      lines.push(`- **${mdEsc(f.title)}**${where ? ` — ${where}` : ""}`, `  - ${mdEsc(f.detail)}`, `  - Suggested change (not applied): ${mdEsc(f.suggestion)}`);
    }
    lines.push("");
  }
  if (report.truncated) lines.push("_The report was truncated by limits; some findings are not listed._", "");
  lines.push("---", `Generated by LemonSees${version ? ` ${version}` : ""}. The scan is read-only: nothing was changed on any server. Key comments are ${includeComments ? "included" : "masked"}.`, "");
  return lines.join("\n");
}

/* ------------------------- HTTP ------------------------- */

/** Дані хоста, який не вдалося перевірити: у відповіді API порожні (щоб застарілі ключі не виглядали актуальними). */
const EMPTY_HOST = { sshd_source: "unavailable", settings: {}, defaulted: [], keys: [], unreadable: [], skipped_lines: 0, coverage_days: null, truncated: false };

export function mountHygiene(app, ctx) {
  let scanning = false;

  const nameOf = (id, fallback) => ctx.hosts().find((h) => h.id === id)?.name ?? fallback;

  function view() {
    const st = loadHygiene();
    const scan = st.scan ?? null;
    const expected = st.expected ?? [];
    const staleDays = st.staleDays ?? DEFAULT_STALE_DAYS;
    const hosts = (scan?.hosts ?? []).map((e) => ({ ...e, name: nameOf(e.id, e.name) }));
    const report = scan && core.available() ? core.sshJudge({ hosts, expected, stale_days: staleDays, now_ms: Date.now() }) : null;
    return {
      core: core.available(),
      scanning,
      scannedAt: scan?.at ?? null,
      staleDays,
      expected,
      report,
      scanEveryHours: loadSoc().hygieneHours,
      hosts: hosts.map((e) => ({ id: e.id, name: e.name, error: e.error, ...(e.error ? EMPTY_HOST : e.host) })),
    };
  }

  /**
   * Сканує `targets`, зберігає результат, порівнює його з попереднім і піднімає інциденти про зміни (новий ключ, гірші налаштування).
   * `want` — множина id для часткового скану (решта хостів лишається з попередніх даних) або null для повного.
   */
  async function runScan(targets, want, trigger) {
    const startedAt = Date.now();
    const fresh = await scanHosts(targets, ctx.conns);
    const st = loadHygiene();
    const prevHosts = st.scan?.hosts ?? [];
    const prevAt = st.scan?.at ?? null;
    const prevById = new Map(prevHosts.map((e) => [e.id, e]));

    // Хост, який не вдалося перевірити, зберігає останні ДОБРІ дані. Інакше наступний успішний скан порівнювався б із порожнім
    // і оголосив би «новими» всі ключі, а зміни під час збою лишились би непоміченими.
    const hosts = fresh.map((e) => (e.error && prevById.get(e.id)?.host?.keys ? { ...e, host: prevById.get(e.id).host } : e));

    const raise = loadSoc().autoIncidents !== false && !!ctx.addIncident;
    const existing = ctx.incidents ? ctx.incidents() : [];
    const specs = [];
    if (raise) {
      for (const e of fresh) {
        const before = prevById.get(e.id);
        if (before && !e.error) specs.push(...driftIncidents(before, e, { expected: st.expected ?? [], existing, now: startedAt, prevAt, nextAt: startedAt }));
      }
    }

    const keep = want ? prevHosts.filter((e) => !want.has(e.id)) : [];
    saveHygiene({ ...st, scan: { at: Date.now(), hosts: [...keep, ...hosts] } });
    const ok = fresh.filter((h) => !h.error).length;
    ctx.audit("hygiene.scan", `${targets.length} host(s)`, { trigger, ok, failed: fresh.length - ok, raised: specs.length });
    for (const spec of specs) ctx.addIncident(spec);
    return { ok, failed: fresh.length - ok, raised: specs.length };
  }

  /**
   * Плановий скан: викликається з циклу перевірок двигуна. Працює, якщо в налаштуваннях SOC задано інтервал (години; 0 — вимкнено),
   * є ядро, не йде інший скан і з минулого скану минув інтервал. Скануються лише підключені хости.
   */
  async function scheduled() {
    const hours = loadSoc().hygieneHours;
    if (!hours || !core.available() || scanning) return null;
    if (Date.now() - (loadHygiene().scan?.at ?? 0) < hours * 3_600_000) return null;
    const targets = ctx.hosts().filter((h) => ctx.conns.get(h.id)?.ready).slice(0, 500);
    if (!targets.length) return null;
    scanning = true;
    try {
      return await runScan(targets, new Set(targets.map((h) => h.id)), "scheduled");
    } finally {
      scanning = false;
    }
  }

  app.get("/api/hygiene", (req, res) => res.json(view()));

  app.post("/api/hygiene/scan", async (req, res) => {
    if (!core.available()) return res.status(503).json({ error: "Для SSH-гігієни потрібне Rust-ядро (npm run build:core)" });
    if (scanning) return res.status(409).json({ error: "Сканування вже виконується" });
    const all = ctx.hosts();
    const want = Array.isArray(req.body?.hostIds) ? new Set(req.body.hostIds.map(String)) : null;
    const targets = (want ? all.filter((h) => want.has(h.id)) : all).slice(0, 500);
    if (!targets.length) return res.status(400).json({ error: "Немає хостів для перевірки" });
    scanning = true;
    try {
      await runScan(targets, want, "manual");
      res.json(view());
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    } finally {
      scanning = false;
    }
  });

  app.put("/api/hygiene/expected", (req, res) => {
    try {
      if (!Array.isArray(req.body?.expected)) throw new Error("Очікується поле expected (масив ключів)");
      const expected = sanitizeExpected(req.body.expected, ctx.hosts().map((h) => h.id));
      const st = loadHygiene();
      saveHygiene({ ...st, expected, staleDays: req.body?.staleDays === undefined ? (st.staleDays ?? DEFAULT_STALE_DAYS) : clampDays(req.body.staleDays) });
      ctx.audit("hygiene.expected", `${expected.length} key(s)`, {});
      res.json(view());
    } catch (e) {
      res.status(400).json({ error: String(e?.message || e) });
    }
  });

  app.get("/api/hygiene/export", (req, res) => {
    const v = view();
    if (!v.report) return res.status(404).json({ error: "Спочатку виконай сканування" });
    const format = ["csv", "json", "md"].includes(req.query.format) ? req.query.format : "md";
    const includeComments = req.query.comments === "1";
    const day = new Date(v.report.generated_ms).toISOString().slice(0, 10);
    ctx.audit("hygiene.export", format, { comments: includeComments });
    res.setHeader("Content-Disposition", `attachment; filename="ssh-hygiene-${day}.${format}"`);
    if (format === "csv") return res.type("text/csv").send(renderCsv(v.report, includeComments));
    if (format === "json") return res.json({ ...v.report, findings: maskFindings(v.report.findings, includeComments) });
    res.type("text/markdown").send(renderMarkdown(v.report, { includeComments, version: ctx.version }));
  });

  return { scheduled };
}
