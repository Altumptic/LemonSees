import { useMemo, useState } from "react";
import { FileText, Download, Play, ShieldCheck, Bug, Crosshair, Siren } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import {
  fmtWhen,
  type SecurityPosture,
  type ControlResult,
  type ControlDef,
  type Attestations,
  type VulnReport,
  type ThreatReport,
  type Incident,
} from "@/lib/types";
import { PageHeader, Panel, GhostButton, PrimaryButton, Kpi, ScoreRing, Track, SectionHeader, EmptyState, Tag, scoreTone, toneColor } from "@/components/ui";

type Bundle = {
  host: string;
  security: SecurityPosture;
  auto: ControlResult[];
  manual: ControlDef[];
  attest: Attestations;
  vulns: VulnReport;
  threats: ThreatReport;
  incidents: Incident[];
  at: number;
};

const FAMILIES = [
  { key: "CIS", re: /^CIS/, label: "CIS Benchmarks" },
  { key: "NIST", re: /^NIST/, label: "NIST 800-53" },
  { key: "ISO", re: /^ISO/, label: "ISO 27001" },
  { key: "GDPR", re: /^GDPR/, label: "GDPR" },
];

function coverage(bundle: Bundle) {
  const items: { framework: string; passed: boolean; evaluable: boolean }[] = [];
  for (const c of bundle.auto) items.push({ framework: c.framework, passed: c.status === "pass", evaluable: c.status !== "unknown" });
  for (const c of bundle.manual) {
    const a = bundle.attest[c.id];
    items.push({ framework: c.framework, passed: a?.status === "attested", evaluable: a?.status !== "na" && !!a });
  }
  return FAMILIES.map((f) => {
    const inF = items.filter((i) => f.re.test(i.framework) && i.evaluable);
    const passed = inF.filter((i) => i.passed).length;
    return { ...f, total: inF.length, passed, pct: inF.length ? Math.round((passed / inF.length) * 100) : 0 };
  }).filter((f) => f.total > 0);
}

export default function ReportsPage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const { settings } = useSettings();
  const [hostId, setHostId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState("");

  const online = hosts.filter((h) => h.status === "online");
  const active = hostId ?? online[0]?.id ?? hosts[0]?.id ?? null;
  const hostObj = hosts.find((h) => h.id === active) ?? null;

  const generate = async () => {
    if (!active || !hostObj) return;
    setLoading(true);
    setErr("");
    setBundle(null);
    try {
      setProgress(t("Постура безпеки…"));
      const security = await api.security(active);
      setProgress(t("Контролі відповідності…"));
      const [{ controls: auto }, ctrls] = await Promise.all([api.complianceRun(active), api.complianceControls()]);
      setProgress(t("Скан вразливостей…"));
      const vulns = await api.vulns(active);
      setProgress(t("Аналіз загроз…"));
      const threats = await api.threats(active, settings.geoip);
      const incidents = (await api.listIncidents()).filter((i) => !i.hostId || i.hostId === active);
      setBundle({ host: hostObj.name, security, auto, manual: ctrls.manual, attest: ctrls.attest, vulns, threats, incidents, at: Date.now() });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  const cov = useMemo(() => (bundle ? coverage(bundle) : []), [bundle]);
  const posture = bundle ? Math.max(0, 100 - bundle.security.risk) : 0;

  const download = () => {
    if (!bundle) return;
    const html = buildHtml(bundle, cov, posture);
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `SHOK-report-${bundle.host}-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (hosts.length === 0) {
    return (
      <>
        <PageHeader eyebrow={t("GRC · Звітність")} title={t("Звіти")} lede={t("Зведені звіти безпеки та відповідності стандартам.")} />
        <EmptyState icon={FileText} title={t("Немає хостів")} hint={t("Додай сервер, щоб згенерувати звіт.")} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={t("GRC · Звітність")}
        title={t("Звіти")}
        lede={t("Зводить постуру, комплаєнс, вразливості, загрози та інциденти в звіт із мапінгом на CIS / NIST / ISO / GDPR.")}
        action={
          <div className="flex items-center gap-2">
            <select value={active ?? ""} onChange={(e) => setHostId(e.target.value)} className="mono rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-xs outline-none focus:border-[var(--hairline-strong)]">
              {hosts.map((h) => <option key={h.id} value={h.id} className="bg-[var(--ink)]">{h.name}</option>)}
            </select>
            <PrimaryButton onClick={generate} disabled={loading}><Play className="h-3 w-3" /> {loading ? t("Генерую…") : t("Згенерувати звіт")}</PrimaryButton>
          </div>
        }
      />

      {loading ? (
        <Panel><div className="py-16 text-center text-sm text-muted-foreground">{progress || t("Збираю дані…")}</div></Panel>
      ) : err ? (
        <Panel><div className="mono py-10 text-center text-sm text-[var(--danger)]">{err}</div></Panel>
      ) : !bundle ? (
        <EmptyState icon={FileText} title={t("Звіт ще не згенеровано")} hint={t("Обери хост і натисни «Згенерувати звіт» — зберемо всі модулі й покриття стандартів.")} action={<PrimaryButton onClick={generate}>{t("Згенерувати звіт")}</PrimaryButton>} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-muted-foreground">{t("Звіт для")} <span className="font-medium text-foreground">{bundle.host}</span> · {fmtWhen(bundle.at)}</div>
            <GhostButton onClick={download}><Download className="h-3 w-3" /> {t("Завантажити HTML")}</GhostButton>
          </div>

          {/* Виконавче зведення */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
            <Panel>
              <div className="flex items-center gap-5">
                <ScoreRing value={posture} size={104} color={toneColor(scoreTone(posture))} label={t("постура")} />
                <div>
                  <div className="eyebrow mb-1">{t("Загальна постура")}</div>
                  <div className="num text-xl font-medium" style={{ color: toneColor(scoreTone(posture)) }}>{posture}%</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{t("ризик")} {bundle.security.risk}</div>
                </div>
              </div>
            </Panel>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Kpi label={t("Захищеність")} value={`${bundle.vulns.secScore}%`} icon={Bug} tone={scoreTone(bundle.vulns.secScore)} sub={`${bundle.vulns.vulnCount} ${t("вразливостей")}`} />
              <Kpi label={t("Провалені контролі")} value={bundle.auto.filter((c) => c.status === "fail").length} icon={ShieldCheck} tone="warning" sub={t("з авто")} />
              <Kpi label={t("Атаки (48 год)")} value={bundle.threats.total.toLocaleString()} icon={Crosshair} tone={bundle.threats.total > 1000 ? "critical" : "neutral"} />
              <Kpi label={t("Відкриті інциденти")} value={bundle.incidents.filter((i) => i.status !== "closed").length} icon={Siren} tone={bundle.incidents.some((i) => i.status !== "closed") ? "warning" : "ok"} />
            </div>
          </div>

          {/* Покриття стандартів — чекбари */}
          <Panel>
            <SectionHeader icon={ShieldCheck} title={t("Покриття стандартів")} sub={t("Частка виконаних контролів за фреймворками")} />
            <div className="grid gap-4 md:grid-cols-2">
              {cov.map((f) => (
                <div key={f.key}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-2">{f.label} <Tag>{f.key}</Tag></span>
                    <span className="num text-muted-foreground">{f.passed}/{f.total} · {f.pct}%</span>
                  </div>
                  <Track value={f.pct} tone={scoreTone(f.pct)} />
                </div>
              ))}
              {cov.length === 0 && <div className="text-sm text-muted-foreground">{t("Немає даних для мапінгу.")}</div>}
            </div>
          </Panel>

          {/* Ключові знахідки */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel>
              <SectionHeader icon={Bug} title={t("Топ вразливостей")} />
              <ul className="space-y-2">
                {bundle.vulns.findings.filter((f) => f.status === "vuln").slice(0, 6).map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-3 text-[13px]">
                    <span className="min-w-0"><span className="truncate">{f.title}</span><div className="mono text-[10px] text-muted-foreground">{f.remediation}</div></span>
                    <span className="mono shrink-0 text-[10px] uppercase" style={{ color: f.severity === "critical" || f.severity === "high" ? "var(--danger)" : "var(--warning)" }}>{f.severity}</span>
                  </li>
                ))}
                {bundle.vulns.vulnCount === 0 && <li className="text-sm text-muted-foreground">{t("Вразливостей не знайдено.")}</li>}
              </ul>
            </Panel>
            <Panel>
              <SectionHeader icon={Crosshair} title={t("Топ атакуючих")} />
              <ul className="space-y-1.5">
                {bundle.threats.attackers.slice(0, 6).map((a) => (
                  <li key={a.ip} className="mono flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate">{a.ip} {a.geo?.countryCode ? `· ${a.geo.countryCode}` : ""}</span>
                    <span className="shrink-0 text-[var(--danger)]">{a.count.toLocaleString()}</span>
                  </li>
                ))}
                {bundle.threats.attackers.length === 0 && <li className="text-sm text-muted-foreground">{t("Атак не зафіксовано.")}</li>}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

/* --------- Генерація standalone HTML-звіту --------- */

function buildHtml(b: Bundle, cov: ReturnType<typeof coverage>, posture: number): string {
  const esc = (s: unknown) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] || c);
  const bar = (pct: number, color: string) =>
    `<div style="background:#e6e8ec;border-radius:6px;height:10px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${color}"></div></div>`;
  const col = (p: number) => (p >= 85 ? "#16a34a" : p >= 60 ? "#2563eb" : p >= 40 ? "#d97706" : "#dc2626");
  const failed = b.auto.filter((c) => c.status === "fail");
  const vulns = b.vulns.findings.filter((f) => f.status === "vuln");

  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>SHOK Report — ${esc(b.host)}</title>
<style>
  :root{--ink:#0d0e12;--gold:#c9a463}
  *{box-sizing:border-box}
  body{font:14px/1.55 'Segoe UI',system-ui,Arial,sans-serif;color:#1a1d24;margin:0;background:#f4f5f7}
  .wrap{max-width:900px;margin:0 auto;padding:40px 28px}
  header{display:flex;align-items:center;gap:16px;border-bottom:3px solid var(--gold);padding-bottom:18px;margin-bottom:24px}
  header .t{font-size:24px;font-weight:800;letter-spacing:1px}
  header .s{color:#6b7280;font-size:13px}
  h2{font-size:16px;margin:28px 0 12px;padding-bottom:6px;border-bottom:1px solid #e2e5ea}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .kpi{background:#fff;border:1px solid #e2e5ea;border-radius:10px;padding:14px}
  .kpi .l{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#6b7280}
  .kpi .v{font-size:26px;font-weight:700;margin-top:6px}
  table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e5ea;border-radius:10px;overflow:hidden}
  th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #eef0f3}
  th{background:#fafbfc;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6b7280}
  .cov{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px}
  .cov .row{margin-bottom:4px;display:flex;justify-content:space-between;font-size:13px}
  .pill{display:inline-block;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:600}
  .crit{background:#fee2e2;color:#b91c1c}.high{background:#ffedd5;color:#c2410c}.med{background:#fef9c3;color:#a16207}.low{background:#e0e7ff;color:#4338ca}
  footer{margin-top:36px;padding-top:16px;border-top:1px solid #e2e5ea;color:#9aa1ab;font-size:11px;text-align:center}
</style></head><body><div class="wrap">
<header><div>
  <div class="t">ШОК · Security &amp; Compliance Report</div>
  <div class="s">Host: <b>${esc(b.host)}</b> · ${new Date(b.at).toLocaleString()} · agentless over SSH</div>
</div></header>

<h2>Executive summary</h2>
<div class="kpis">
  <div class="kpi"><div class="l">Posture</div><div class="v" style="color:${col(posture)}">${posture}%</div></div>
  <div class="kpi"><div class="l">Hardening</div><div class="v" style="color:${col(b.vulns.secScore)}">${b.vulns.secScore}%</div></div>
  <div class="kpi"><div class="l">Vulnerabilities</div><div class="v">${b.vulns.vulnCount}</div></div>
  <div class="kpi"><div class="l">Attacks 48h</div><div class="v">${b.threats.total.toLocaleString()}</div></div>
</div>

<h2>Standards coverage</h2>
<div class="cov">
  ${cov.map((f) => `<div><div class="row"><span>${esc(f.label)} (${f.key})</span><span>${f.passed}/${f.total} · ${f.pct}%</span></div>${bar(f.pct, col(f.pct))}</div>`).join("")}
</div>

<h2>Vulnerabilities (${vulns.length})</h2>
<table><tr><th>Severity</th><th>Finding</th><th>Category</th><th>Remediation</th></tr>
${vulns.map((v) => `<tr><td><span class="pill ${v.severity === "critical" ? "crit" : v.severity === "high" ? "high" : v.severity === "medium" ? "med" : "low"}">${v.severity}</span></td><td>${esc(v.title)}<br><small style="color:#6b7280">${esc(v.detail)}</small></td><td>${esc(v.categoryLabel)}</td><td><small>${esc(v.remediation)}</small></td></tr>`).join("") || `<tr><td colspan="4">None</td></tr>`}
</table>

<h2>Failed compliance controls (${failed.length})</h2>
<table><tr><th>Framework</th><th>Control</th><th>Evidence</th></tr>
${failed.map((c) => `<tr><td>${esc(c.framework)}</td><td>${esc(c.title)}</td><td><small style="color:#6b7280">${esc(c.evidence)}</small></td></tr>`).join("") || `<tr><td colspan="3">None — all passed</td></tr>`}
</table>

<h2>Top attackers (geo-IP)</h2>
<table><tr><th>IP</th><th>Attempts</th><th>Country</th><th>ISP</th></tr>
${b.threats.attackers.slice(0, 12).map((a) => `<tr><td>${esc(a.ip)}</td><td>${a.count.toLocaleString()}</td><td>${esc(a.geo?.country || "—")}</td><td>${esc(a.geo?.isp || "—")}</td></tr>`).join("") || `<tr><td colspan="4">None</td></tr>`}
</table>

<h2>Open incidents (${b.incidents.filter((i) => i.status !== "closed").length})</h2>
<table><tr><th>Severity</th><th>Title</th><th>Status</th></tr>
${b.incidents.filter((i) => i.status !== "closed").map((i) => `<tr><td>${esc(i.severity)}</td><td>${esc(i.title)}</td><td>${esc(i.status)}</td></tr>`).join("") || `<tr><td colspan="3">None</td></tr>`}
</table>

<footer>Generated by ШОК v1.5.0 · SOC &amp; GRC platform · agentless over SSH — this report contains no data beyond what was collected from the host.</footer>
</div></body></html>`;
}
