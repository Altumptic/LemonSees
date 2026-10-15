// SOC-аналітика поверх інцидентів і аудиту: тренди, розподіли, MITRE ATT&CK, MTTR.
import type { AuditEvent, Incident } from "./types";

export const SEVERITIES: Incident["severity"][] = ["critical", "high", "medium", "low", "info"];
export const STATUSES: Incident["status"][] = ["open", "investigating", "mitigated", "closed"];

const DAY = 86400000;

/** Мітки останніх N днів (від найстарішого). */
export function dayLabels(n: number, lang = "uk"): { start: number; label: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmt = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang, { day: "numeric", month: "short" });
  return Array.from({ length: n }, (_, i) => {
    const start = today.getTime() - (n - 1 - i) * DAY;
    return { start, label: fmt.format(start) };
  });
}

/** Інциденти по днях, розкладені за серйозністю. */
export function incidentsByDay(items: Incident[], days: number, lang?: string) {
  const buckets = dayLabels(days, lang);
  const from = buckets[0].start;
  const rows = buckets.map((b) => ({ label: b.label, values: SEVERITIES.map(() => 0) }));
  for (const i of items) {
    if (i.createdAt < from) continue;
    const idx = Math.min(days - 1, Math.floor((i.createdAt - from) / DAY));
    rows[idx].values[SEVERITIES.indexOf(i.severity)]++;
  }
  return rows;
}

/** Події аудиту по днях. */
export function eventsByDay(events: { at: number }[], days: number, lang?: string) {
  const buckets = dayLabels(days, lang);
  const from = buckets[0].start;
  const out = buckets.map(() => 0);
  for (const e of events) {
    if (e.at < from) continue;
    out[Math.min(days - 1, Math.floor((e.at - from) / DAY))]++;
  }
  return { labels: buckets.map((b) => b.label), data: out };
}

/** Теплова карта активності: день тижня × година. */
export function weekHourMatrix(events: { at: number }[]): number[][] {
  const m = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  for (const e of events) {
    const d = new Date(e.at);
    m[(d.getDay() + 6) % 7][d.getHours()]++;
  }
  return m;
}

export function countBy<T>(items: T[], key: (x: T) => string): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = key(it) || "—";
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}

/** Середній час до закриття (год) і до першої реакції (хв) за таймлайном. */
export function responseTimes(items: Incident[]) {
  const closed = items.filter((i) => i.status === "closed" || i.status === "mitigated");
  const mttr = closed.length ? closed.reduce((a, i) => a + Math.max(0, i.updatedAt - i.createdAt), 0) / closed.length / 3600000 : 0;
  const acked = items.filter((i) => i.timeline.length > 1);
  const mtta = acked.length ? acked.reduce((a, i) => a + Math.max(0, i.timeline[1].at - i.createdAt), 0) / acked.length / 60000 : 0;
  return { mttrHours: mttr, mttaMinutes: mtta, closedCount: closed.length };
}

/* ---------------- MITRE ATT&CK ---------------- */

export const TACTICS = [
  { id: "TA0043", name: "Reconnaissance" },
  { id: "TA0001", name: "Initial Access" },
  { id: "TA0002", name: "Execution" },
  { id: "TA0003", name: "Persistence" },
  { id: "TA0004", name: "Privilege Escalation" },
  { id: "TA0005", name: "Defense Evasion" },
  { id: "TA0006", name: "Credential Access" },
  { id: "TA0007", name: "Discovery" },
  { id: "TA0008", name: "Lateral Movement" },
  { id: "TA0009", name: "Collection" },
  { id: "TA0011", name: "Command and Control" },
  { id: "TA0010", name: "Exfiltration" },
  { id: "TA0040", name: "Impact" },
] as const;

export type Technique = { id: string; name: string; tactic: string };

// Ключові слова категорії/назви інциденту → техніка ATT&CK
const RULES: { re: RegExp; t: Technique }[] = [
  { re: /brute|брутфорс|password spray|failed login/i, t: { id: "T1110", name: "Brute Force", tactic: "TA0006" } },
  { re: /credential|облік|dump|shadow/i, t: { id: "T1003", name: "OS Credential Dumping", tactic: "TA0006" } },
  { re: /scan|recon|розвід|nmap/i, t: { id: "T1595", name: "Active Scanning", tactic: "TA0043" } },
  { re: /exposure|expos|public|відкрит|порт/i, t: { id: "T1190", name: "Exploit Public-Facing Application", tactic: "TA0001" } },
  { re: /phish/i, t: { id: "T1566", name: "Phishing", tactic: "TA0001" } },
  { re: /malware|шкідлив|miner|майнер|crypto/i, t: { id: "T1204", name: "User Execution", tactic: "TA0002" } },
  { re: /shell|command|script/i, t: { id: "T1059", name: "Command and Scripting Interpreter", tactic: "TA0002" } },
  { re: /persist|cron|автозапуск|service/i, t: { id: "T1053", name: "Scheduled Task/Job", tactic: "TA0003" } },
  { re: /privilege|sudo|suid|ескал/i, t: { id: "T1068", name: "Exploitation for Privilege Escalation", tactic: "TA0004" } },
  { re: /misconfig|firewall|defen|audit|налашт/i, t: { id: "T1562", name: "Impair Defenses", tactic: "TA0005" } },
  { re: /integrity|fim|файл|tamper/i, t: { id: "T1565", name: "Data Manipulation", tactic: "TA0040" } },
  { re: /lateral|ssh pivot|латерал/i, t: { id: "T1021", name: "Remote Services", tactic: "TA0008" } },
  { re: /discovery|enum/i, t: { id: "T1046", name: "Network Service Discovery", tactic: "TA0007" } },
  { re: /collect|archive/i, t: { id: "T1560", name: "Archive Collected Data", tactic: "TA0009" } },
  { re: /c2|beacon|command and control|tunnel/i, t: { id: "T1071", name: "Application Layer Protocol", tactic: "TA0011" } },
  { re: /exfil|витік|leak/i, t: { id: "T1048", name: "Exfiltration Over Alternative Protocol", tactic: "TA0010" } },
  { re: /dos|ddos|outage|downtime|недоступ/i, t: { id: "T1499", name: "Endpoint Denial of Service", tactic: "TA0040" } },
  { re: /ransom|encrypt/i, t: { id: "T1486", name: "Data Encrypted for Impact", tactic: "TA0040" } },
];

export function techniqueOf(i: Pick<Incident, "category" | "title">): Technique | null {
  const hay = `${i.category} ${i.title}`;
  return RULES.find((r) => r.re.test(hay))?.t ?? null;
}

/** Покриття тактик: скільки інцидентів і які техніки по кожній. */
export function mitreCoverage(items: Incident[]) {
  const byTactic = new Map<string, { count: number; techniques: Map<string, { t: Technique; count: number }> }>();
  for (const tac of TACTICS) byTactic.set(tac.id, { count: 0, techniques: new Map() });
  let mapped = 0;
  for (const i of items) {
    const t = techniqueOf(i);
    if (!t) continue;
    mapped++;
    const row = byTactic.get(t.tactic)!;
    row.count++;
    const cur = row.techniques.get(t.id) ?? { t, count: 0 };
    cur.count++;
    row.techniques.set(t.id, cur);
  }
  return {
    mapped,
    tactics: TACTICS.map((tac) => {
      const row = byTactic.get(tac.id)!;
      return { ...tac, count: row.count, techniques: [...row.techniques.values()].sort((a, b) => b.count - a.count) };
    }),
    catalog: RULES.map((r) => r.t),
  };
}

export function auditActionGroup(e: AuditEvent): string {
  return e.action.split(".")[0] || e.action;
}
