import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, RefreshCw, ClipboardCheck, FileCheck2, Check, X, Minus } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ControlDef, ControlResult, Attestations } from "@/lib/types";
import {
  PageHeader,
  Panel,
  GhostButton,
  ScoreRing,
  Kpi,
  ControlBadge,
  Tag,
  SectionHeader,
  EmptyState,
  scoreTone,
  toneColor,
} from "@/components/ui";

export default function CompliancePage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [hostId, setHostId] = useState<string | null>(null);
  const [manual, setManual] = useState<ControlDef[]>([]);
  const [attest, setAttest] = useState<Attestations>({});
  const [results, setResults] = useState<ControlResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const online = hosts.filter((h) => h.status === "online");
  const active = hostId ?? online[0]?.id ?? hosts[0]?.id ?? null;

  useEffect(() => {
    api.complianceControls().then((r) => {
      setManual(r.manual);
      setAttest(r.attest);
    }).catch(() => {});
  }, []);

  const run = (id: string) => {
    setLoading(true);
    setErr("");
    setResults(null);
    api
      .complianceRun(id)
      .then((r) => setResults(r.controls))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (active) run(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const setAttestation = async (controlId: string, status: string, note = "") => {
    try {
      const r = await api.attest(controlId, status, note);
      setAttest(r.attest);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const score = useMemo(() => {
    const autoPass = (results ?? []).filter((c) => c.status === "pass").length;
    const autoTotal = (results ?? []).filter((c) => c.status !== "unknown").length;
    const manAtt = manual.filter((c) => attest[c.id]?.status === "attested").length;
    const manTotal = manual.filter((c) => attest[c.id]?.status !== "na").length;
    const pass = autoPass + manAtt;
    const total = autoTotal + manTotal;
    return { pct: total ? Math.round((pass / total) * 100) : 0, pass, total, autoPass, autoTotal, manAtt, manCount: manual.length };
  }, [results, manual, attest]);

  if (hosts.length === 0) {
    return (
      <>
        <PageHeader eyebrow={t("GRC")} title={t("Комплаєнс")} lede={t("Автоматичні CIS-контролі та ручні атестації.")} />
        <EmptyState icon={ShieldCheck} title={t("Немає хостів")} hint={t("Додай сервер, щоб запустити перевірку відповідності.")} />
      </>
    );
  }

  const st = scoreTone(score.pct);

  return (
    <>
      <PageHeader
        eyebrow={t("GRC · Відповідність")}
        title={t("Комплаєнс")}
        lede={t("CIS / NIST / ISO контролі. Автоматичні перевіряються по SSH, решту атестує аналітик.")}
        action={
          <div className="flex items-center gap-2">
            <select
              value={active ?? ""}
              onChange={(e) => setHostId(e.target.value)}
              className="mono rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-xs outline-none focus:border-[var(--hairline-strong)]"
            >
              {hosts.map((h) => (
                <option key={h.id} value={h.id} className="bg-[var(--ink)]">{h.name}</option>
              ))}
            </select>
            <GhostButton onClick={() => active && run(active)} disabled={loading}>
              <RefreshCw className="h-3 w-3" /> {loading ? t("Перевіряю…") : t("Перезапустити")}
            </GhostButton>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <Panel>
          <div className="flex items-center gap-5">
            <ScoreRing value={score.pct} size={104} color={toneColor(st)} label={t("скор")} />
            <div>
              <div className="eyebrow mb-1">{t("Загальний скор")}</div>
              <div className="num text-xl font-medium" style={{ color: toneColor(st) }}>{score.pass}/{score.total}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{t("контролів пройдено")}</div>
            </div>
          </div>
        </Panel>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Kpi label={t("Авто-контролі")} value={`${score.autoPass}/${score.autoTotal || 0}`} icon={ClipboardCheck} tone={score.autoTotal && score.autoPass === score.autoTotal ? "ok" : "info"} sub={t("пройдено")} />
          <Kpi label={t("Провалено")} value={(results ?? []).filter((c) => c.status === "fail").length} icon={X} tone="warning" sub={t("авто-перевірок")} />
          <Kpi label={t("Ручні")} value={`${score.manAtt}/${score.manCount}`} icon={FileCheck2} tone="neutral" sub={t("атестовано")} />
          <Kpi label={t("Невідомо")} value={(results ?? []).filter((c) => c.status === "unknown").length} icon={Minus} tone="neutral" sub={t("потрібні права")} />
        </div>
      </div>

      {err && <Panel className="mb-6"><div className="mono py-4 text-center text-sm text-[var(--danger)]">{err}</div></Panel>}

      {/* Авто-контролі */}
      <Panel className="mb-6">
        <SectionHeader icon={ClipboardCheck} title={t("Автоматичні контролі")} sub={t("Перевіряються на обраному хості по SSH")} />
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t("Перевіряю…")}</div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
            {(results ?? []).map((c) => (
              <div key={c.id} className="grid grid-cols-12 items-center gap-3 border-b border-[var(--hairline)] px-4 py-2.5 last:border-0">
                <div className="col-span-6 min-w-0">
                  <div className="truncate text-sm">{c.title}</div>
                  <div className="mono truncate text-[10px] text-muted-foreground">{c.evidence}</div>
                </div>
                <div className="col-span-3"><Tag>{c.framework}</Tag></div>
                <div className="col-span-3 flex justify-end"><ControlBadge status={c.status} labelText={t(controlLabel(c.status))} /></div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Ручні контролі */}
      <Panel>
        <SectionHeader icon={FileCheck2} title={t("Ручні контролі (governance)")} sub={t("Атестуються аналітиком, зберігаються локально")} />
        <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
          {manual.map((c) => {
            const a = attest[c.id];
            return (
              <div key={c.id} className="grid grid-cols-12 items-center gap-3 border-b border-[var(--hairline)] px-4 py-2.5 last:border-0">
                <div className="col-span-6 min-w-0">
                  <div className="truncate text-sm">{c.title}</div>
                  {a?.at ? <div className="mono truncate text-[10px] text-muted-foreground">{new Date(a.at).toLocaleDateString()}{a.note ? ` · ${a.note}` : ""}</div> : null}
                </div>
                <div className="col-span-2"><Tag>{c.framework}</Tag></div>
                <div className="col-span-4 flex items-center justify-end gap-1">
                  <AttBtn active={a?.status === "attested"} tone="ok" title={t("Атестувати")} onClick={() => setAttestation(c.id, "attested")}><Check className="h-3 w-3" /></AttBtn>
                  <AttBtn active={a?.status === "failed"} tone="critical" title={t("Провалено")} onClick={() => setAttestation(c.id, "failed")}><X className="h-3 w-3" /></AttBtn>
                  <AttBtn active={a?.status === "na"} tone="neutral" title={t("Не застосовно")} onClick={() => setAttestation(c.id, "na")}><Minus className="h-3 w-3" /></AttBtn>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

function controlLabel(s: string) {
  return s === "pass" ? "пройдено" : s === "fail" ? "провалено" : "невідомо";
}

function AttBtn({ children, active, tone, title, onClick }: { children: React.ReactNode; active: boolean; tone: "ok" | "critical" | "neutral"; title: string; onClick: () => void }) {
  const c = tone === "ok" ? "var(--success)" : tone === "critical" ? "var(--danger)" : "var(--muted-foreground)";
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md border transition-colors"
      style={{
        borderColor: active ? c : "var(--hairline)",
        background: active ? `color-mix(in oklab, ${c} 18%, transparent)` : "transparent",
        color: active ? c : "var(--muted-foreground)",
      }}
    >
      {children}
    </button>
  );
}
