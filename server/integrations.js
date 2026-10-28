// Інтеграції LemonSees — повністю опційні: без них продукт працює автономно.
// Вихідні (події → зовнішні системи): Datadog, Slack, Teams, Telegram, вебхук (HMAC), Splunk HEC,
// Elastic/OpenSearch, Syslog CEF (UDP/TCP/TLS), PagerDuty.
// Вхідні: Wazuh (агенти з API менеджера, тривоги з індексера) — щоб працювати поруч із наявним Wazuh.
// Усі HTTP-запити йдуть через netFetch → поважають проксі/Tor і kill switch.
import crypto from "node:crypto";
import dgram from "node:dgram";
import net from "node:net";
import tls from "node:tls";
import os from "node:os";
import { Agent, fetch as ufetch } from "undici";
import { netFetch, getNetConfig, proxyEnabled } from "./netproxy.js";

const SEV_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export const CATALOG = {
  datadog: { label: "Datadog", dir: "out", fields: ["site", "apiKey", "tags"] },
  slack: { label: "Slack", dir: "out", fields: ["webhookUrl"] },
  teams: { label: "Microsoft Teams", dir: "out", fields: ["webhookUrl"] },
  telegram: { label: "Telegram", dir: "out", fields: ["token", "chatId"] },
  webhook: { label: "Webhook (HMAC)", dir: "out", fields: ["url", "secret"] },
  splunk: { label: "Splunk HEC", dir: "out", fields: ["url", "token", "index", "insecure"] },
  elastic: { label: "Elastic / OpenSearch", dir: "out", fields: ["url", "index", "apiKey", "insecure"] },
  syslog: { label: "Syslog (CEF)", dir: "out", fields: ["host", "port", "protocol"] },
  pagerduty: { label: "PagerDuty", dir: "out", fields: ["routingKey"] },
  wazuh: { label: "Wazuh", dir: "in", fields: ["apiUrl", "user", "password", "indexerUrl", "indexerUser", "secret", "minLevel", "insecure"] },
};

export function sanitizeIntegration(input, existing) {
  const type = String(input.type || existing?.type || "");
  const meta = CATALOG[type];
  if (!meta) throw new Error("Невідомий тип інтеграції");
  const config = {};
  for (const f of meta.fields) {
    const v = input.config?.[f];
    // порожнє поле секрету = не змінювати
    config[f] = v === undefined || v === "" || v === "••••••" ? existing?.config?.[f] ?? "" : typeof v === "string" ? v.trim() : v;
  }
  return {
    id: existing?.id ?? "int_" + crypto.randomBytes(4).toString("hex"),
    type,
    name: String(input.name || existing?.name || meta.label).trim(),
    enabled: input.enabled !== false,
    minSeverity: SEV_RANK[input.minSeverity] !== undefined ? input.minSeverity : existing?.minSeverity ?? "high",
    events: Array.isArray(input.events) ? input.events.filter((e) => ["incident", "downtime", "fim"].includes(e)) : existing?.events ?? ["incident", "downtime"],
    config,
    lastStatus: existing?.lastStatus ?? null,
  };
}

/* ---------------- HTTP ---------------- */

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
async function http(url, init, insecure) {
  const opts = { ...init, signal: AbortSignal.timeout(15000) };
  // Самопідписані сертифікати (типово для Wazuh/Elastic у LAN) — лише якщо явно дозволено і без проксі
  const r = insecure && !proxyEnabled() ? await ufetch(url, { ...opts, dispatcher: insecureAgent }) : await netFetch(url, opts);
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 160)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
const json = (body) => ({ "content-type": "application/json", body: JSON.stringify(body) });
const post = (url, body, headers = {}, insecure = false) => {
  const j = json(body);
  return http(url, { method: "POST", headers: { "content-type": j["content-type"], ...headers }, body: j.body }, insecure);
};

/* ---------------- Відправники ---------------- */

const icon = (s) => ({ critical: "🔴", high: "🟠", medium: "🟡", low: "🔵", info: "⚪" })[s] || "⚪";

const SENDERS = {
  async datadog(c, e) {
    const site = c.site || "datadoghq.com";
    const tags = ["source:lemonsees", `severity:${e.severity}`, `kind:${e.kind}`, ...(e.host ? [`host:${e.host}`] : []), ...String(c.tags || "").split(",").map((t) => t.trim()).filter(Boolean)];
    await post(`https://api.${site}/api/v1/events`, {
      title: e.title,
      text: e.text,
      alert_type: e.severity === "critical" || e.severity === "high" ? "error" : e.severity === "medium" ? "warning" : "info",
      source_type_name: "lemonsees",
      host: e.host || undefined,
      tags,
    }, { "DD-API-KEY": c.apiKey });
    await post(`https://http-intake.logs.${site}/api/v2/logs`, [{ ddsource: "lemonsees", service: "lemonsees-soc", hostname: e.host || os.hostname(), status: e.severity, message: `${e.title} — ${e.text}`, ddtags: tags.join(",") }], { "DD-API-KEY": c.apiKey }).catch(() => {});
  },
  slack: (c, e) => post(c.webhookUrl, { text: `${icon(e.severity)} *${e.title}*\n${e.text}${e.host ? `\nHost: \`${e.host}\`` : ""}` }),
  teams: (c, e) => post(c.webhookUrl, { "@type": "MessageCard", "@context": "https://schema.org/extensions", summary: e.title, themeColor: e.severity === "critical" ? "B4322A" : "C15F3C", title: `${icon(e.severity)} ${e.title}`, text: e.text }),
  telegram: (c, e) => post(`https://api.telegram.org/bot${c.token}/sendMessage`, { chat_id: c.chatId, text: `${icon(e.severity)} ${e.title}\n${e.text}${e.host ? `\nHost: ${e.host}` : ""}`, disable_web_page_preview: true }),
  webhook(c, e) {
    const body = JSON.stringify({ source: "lemonsees", ...e });
    const sig = c.secret ? crypto.createHmac("sha256", c.secret).update(body).digest("hex") : "";
    return http(c.url, { method: "POST", headers: { "content-type": "application/json", ...(sig ? { "X-LemonSees-Signature": `sha256=${sig}` } : {}) }, body });
  },
  splunk: (c, e) => post(c.url.replace(/\/$/, "") + (c.url.includes("/services/collector") ? "" : "/services/collector/event"), { time: Math.floor(e.at / 1000), host: e.host || os.hostname(), source: "lemonsees", sourcetype: "lemonsees:alert", index: c.index || undefined, event: e }, { Authorization: `Splunk ${c.token}` }, !!c.insecure),
  elastic: (c, e) => post(`${c.url.replace(/\/$/, "")}/${c.index || "lemonsees-alerts"}/_doc`, { "@timestamp": new Date(e.at).toISOString(), ...e, "event.module": "lemonsees" }, c.apiKey ? { Authorization: `ApiKey ${c.apiKey}` } : {}, !!c.insecure),
  pagerduty: (c, e) => post("https://events.pagerduty.com/v2/enqueue", { routing_key: c.routingKey, event_action: "trigger", dedup_key: e.id, payload: { summary: e.title, source: e.host || "lemonsees", severity: e.severity === "critical" ? "critical" : e.severity === "high" ? "error" : e.severity === "medium" ? "warning" : "info", custom_details: { text: e.text, kind: e.kind } } }),
  syslog(c, e) {
    const esc = (v) => String(v ?? "").replace(/\\/g, "\\\\").replace(/=/g, "\\=").replace(/[\r\n]+/g, " ");
    const sev = { info: 1, low: 3, medium: 5, high: 8, critical: 10 }[e.severity] ?? 5;
    const msg = `<${sev >= 8 ? 10 : 13}>${new Date(e.at).toISOString()} ${os.hostname()} CEF:0|Altumptic|LemonSees|3|${esc(e.kind)}|${esc(e.title).replace(/\|/g, "\\|")}|${sev}|msg=${esc(e.text)} dhost=${esc(e.host)} rt=${e.at}`;
    const port = parseInt(c.port, 10) || 514;
    return new Promise((resolve, reject) => {
      if ((c.protocol || "udp") === "udp") {
        const s = dgram.createSocket(net.isIPv6(c.host) ? "udp6" : "udp4");
        s.send(Buffer.from(msg), port, c.host, (err) => (s.close(), err ? reject(err) : resolve()));
        return;
      }
      const sock = c.protocol === "tls" ? tls.connect({ host: c.host, port, servername: c.host }) : net.connect(port, c.host);
      sock.setTimeout(10000, () => (sock.destroy(), reject(new Error("syslog timeout"))));
      sock.once("error", reject);
      sock.once(c.protocol === "tls" ? "secureConnect" : "connect", () => sock.end(msg + "\n", resolve));
    });
  },
};

/** Відправити подію в усі підходящі інтеграції. Повертає статуси. */
export async function dispatch(list, event, { force = false, onStatus } = {}) {
  const e = { id: event.id || crypto.randomBytes(6).toString("hex"), at: Date.now(), severity: "info", text: "", ...event };
  const out = [];
  for (const i of list) {
    const meta = CATALOG[i.type];
    if (!meta || meta.dir !== "out" || (!force && (!i.enabled || !i.events.includes(e.kind) || SEV_RANK[e.severity] < SEV_RANK[i.minSeverity]))) continue;
    const started = Date.now();
    try {
      await SENDERS[i.type](i.config, e);
      out.push({ id: i.id, ok: true, ms: Date.now() - started });
    } catch (err) {
      out.push({ id: i.id, ok: false, error: err.cause?.message || err.message });
    }
    onStatus?.(i.id, out[out.length - 1]);
  }
  return out;
}

/* ---------------- Wazuh (вхідна) ---------------- */

export async function wazuhPull(c) {
  const insecure = !!c.insecure;
  const result = { agents: [], alerts: [], at: Date.now() };
  if (c.apiUrl) {
    const base = c.apiUrl.replace(/\/$/, "");
    const auth = await http(`${base}/security/user/authenticate?raw=true`, { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${c.user}:${c.password}`).toString("base64") } }, insecure);
    const token = typeof auth === "string" ? auth.trim() : auth?.data?.token;
    const agents = await http(`${base}/agents?limit=1000&select=id,name,ip,status,os.name,os.version,version,lastKeepAlive,group`, { headers: { Authorization: `Bearer ${token}` } }, insecure);
    result.agents = (agents?.data?.affected_items || []).map((a) => ({ id: a.id, name: a.name, ip: a.ip, status: a.status, os: [a.os?.name, a.os?.version].filter(Boolean).join(" "), version: a.version, lastKeepAlive: a.lastKeepAlive, group: (a.group || []).join(", ") }));
  }
  if (c.indexerUrl) {
    const base = c.indexerUrl.replace(/\/$/, "");
    const body = {
      size: 200,
      sort: [{ timestamp: { order: "desc" } }],
      query: { bool: { filter: [{ range: { timestamp: { gte: "now-24h" } } }, { range: { "rule.level": { gte: parseInt(c.minLevel, 10) || 7 } } }] } },
      _source: ["timestamp", "rule.level", "rule.description", "rule.id", "rule.mitre.id", "rule.mitre.tactic", "agent.name", "agent.ip", "data.srcip", "full_log"],
    };
    const r = await http(`${base}/wazuh-alerts-*/_search`, { method: "POST", headers: { "content-type": "application/json", Authorization: "Basic " + Buffer.from(`${c.indexerUser || c.user}:${c.secret || c.password}`).toString("base64") }, body: JSON.stringify(body) }, insecure);
    result.alerts = (r?.hits?.hits || []).map((h) => {
      const s = h._source || {};
      const lvl = s.rule?.level ?? 0;
      return {
        id: h._id,
        at: Date.parse(s.timestamp) || Date.now(),
        level: lvl,
        severity: lvl >= 13 ? "critical" : lvl >= 10 ? "high" : lvl >= 7 ? "medium" : lvl >= 4 ? "low" : "info",
        rule: s.rule?.description || "",
        ruleId: s.rule?.id || "",
        mitre: [].concat(s.rule?.mitre?.id || []),
        tactic: [].concat(s.rule?.mitre?.tactic || []),
        agent: s.agent?.name || "",
        srcip: s.data?.srcip || "",
        log: String(s.full_log || "").slice(0, 400),
      };
    });
  }
  return result;
}

export const netSummary = () => {
  const n = getNetConfig();
  return { proxy: proxyEnabled() ? `${n.proxy.type}://${n.proxy.host}:${n.proxy.port}` : "direct", killSwitch: n.killSwitch };
};
