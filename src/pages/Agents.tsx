import { useEffect, useState } from "react";
import { Bot, Copy, Download, RefreshCw, Rocket, Trash2, Terminal as TermIcon, Unplug, Activity } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtWhen, type AgentView } from "@/lib/types";
import { EmptyState, GhostButton, IconBtn, Kpi, Modal, PageHeader, Panel, Pill, PrimaryButton, SectionHeader, StatusDot } from "@/components/ui";
import { LineChart, SERIES } from "@/components/charts";

export default function AgentsPage() {
  const { hosts, demo } = useAppState();
  const { t } = useI18n();
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [version, setVersion] = useState("");
  const [deploy, setDeploy] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState<string | null>(null);

  const load = () =>
    api.agents().then((r) => {
      setAgents(r.agents);
      setVersion(r.version);
    }).catch(() => {});
  useEffect(() => {
    load();
  }, [demo, hosts.length]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setErr("");
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const byHost = new Map(agents.map((a) => [a.hostId, a]));
  const fresh = agents.filter((a) => a.lastSeen && Date.now() - a.lastSeen < 5 * 60000).length;
  const sel = agents.find((a) => a.hostId === focus) ?? agents[0];

  return (
    <>
      <PageHeader
        eyebrow={t("EDR · Агенти")}
        title={t("Агенти LemonSees")}
        lede={t("За замовчуванням агенти не потрібні — збирачем є SSH-сесія. Легкий агент (POSIX sh, без root, лише читання) дає безперервну історію, коли двигун офлайн, і може сам надсилати дані на сервер LemonSees.")}
      />
      {err && <div className="mb-4 rounded-xl bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-4 py-3 text-[14px] text-[var(--danger)]">{err}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label={t("Встановлено")} value={`${agents.length}/${hosts.length}`} icon={Bot} tone="neutral" sub={t("решта — агентлес по SSH")} />
        <Kpi label={t("На звʼязку")} value={fresh} icon={Activity} tone={fresh === agents.length ? "ok" : "warning"} sub={t("за 5 хвилин")} />
        <Kpi label={t("Push-режим")} value={agents.filter((a) => a.mode === "push").length} icon={Rocket} tone="neutral" />
        <Kpi label={t("Версія агента")} value={<span className="text-[28px]">{version || "—"}</span>} icon={Download} tone="neutral" />
      </div>

      {hosts.length === 0 ? (
        <EmptyState icon={Bot} title={t("Немає хостів")} hint={t("Спершу додай сервер — агент розгортається по SSH одним кліком.")} />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Panel className="xl:col-span-2">
            <SectionHeader icon={Bot} title={t("Хости та агенти")} />
            <ul className="divide-y divide-[var(--hairline)]">
              {hosts.map((h) => {
                const a = byHost.get(h.id);
                const live = a?.lastSeen && Date.now() - a.lastSeen < 5 * 60000;
                return (
                  <li key={h.id} className="flex flex-wrap items-center gap-3 py-3.5">
                    <StatusDot status={h.status} />
                    <button onClick={() => a && setFocus(h.id)} className="min-w-[180px] flex-1 text-left">
                      <div className="text-[15px] font-medium">{h.name}</div>
                      <div className="text-[12.5px] text-muted-foreground">
                        {a ? `${a.mode} · ${a.interval}s · v${a.version} · ${a.lastSeen ? `${t("дані")} ${fmtWhen(a.lastSeen)}` : t("ще без даних")}` : t("агентлес (SSH)")}
                      </div>
                    </button>
                    {a ? <Pill color={live ? "var(--success)" : "var(--warning)"} dot>{live ? t("на звʼязку") : t("тихо")}</Pill> : <Pill color="var(--text-disabled)">{t("без агента")}</Pill>}
                    {a ? (
                      <>
                        <IconBtn title={t("Синхронізувати")} onClick={() => act(h.id, () => api.syncAgent(h.id))}>
                          <RefreshCw className={`h-4 w-4 ${busy === h.id ? "animate-spin" : ""}`} />
                        </IconBtn>
                        <IconBtn title={t("Видалити агента")} danger onClick={() => confirm(t("Видалити агента з сервера?")) && act(h.id, () => api.removeAgent(h.id))}>
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </>
                    ) : (
                      <GhostButton onClick={() => setDeploy(h.id)} disabled={h.status !== "online"}>
                        <Rocket className="h-4 w-4" /> {t("Розгорнути")}
                      </GhostButton>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel>
            <SectionHeader icon={Unplug} title={t("Як це працює")} />
            <ol className="space-y-3 text-[14px] leading-relaxed text-muted-foreground">
              <li><b className="text-foreground">Pull</b> — {t("агент пише телеметрію у ~/.lemonsees-agent, двигун забирає її по SSH. Вхідних портів не потрібно.")}</li>
              <li><b className="text-foreground">Push</b> — {t("агент сам надсилає JSON на /api/agent/ingest з персональним токеном (бажано через HTTPS).")}</li>
              <li>{t("Встановлення — user crontab, без root і без демонів. Видалення прибирає все одним кліком.")}</li>
            </ol>
          </Panel>

          {sel && sel.samples.length > 1 && (
            <Panel className="xl:col-span-3">
              <SectionHeader icon={Activity} title={`${t("Телеметрія агента")} · ${sel.host}`} sub={t("Дані з агента, незалежно від SSH-сесії двигуна")} />
              <div className="grid gap-6 lg:grid-cols-2">
                <LineChart
                  series={[
                    { name: "CPU %", data: sel.samples.map((s) => s.cpu), color: SERIES[0] },
                    { name: t("Памʼять %"), data: sel.samples.map((s) => s.mem), color: SERIES[1] },
                    { name: t("Диск %"), data: sel.samples.map((s) => s.disk), color: SERIES[2] },
                  ]}
                  labels={sel.samples.map((s) => new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}
                  yMax={100}
                  yFmt={(v) => `${Math.round(v)}%`}
                  height={220}
                />
                <LineChart
                  series={[
                    { name: t("Невдалі SSH-входи"), data: sel.samples.map((s) => s.fails), color: "var(--danger)" },
                    { name: t("Слухаючі порти"), data: sel.samples.map((s) => s.listen), color: SERIES[3] },
                  ]}
                  labels={sel.samples.map((s) => new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}
                  height={220}
                />
              </div>
            </Panel>
          )}
        </div>
      )}

      {deploy && (
        <DeployModal
          hostId={deploy}
          hostName={hosts.find((h) => h.id === deploy)?.name ?? ""}
          onClose={() => setDeploy(null)}
          onDeploy={(o) => act(deploy, () => api.deployAgent(deploy, o)).then(() => setDeploy(null))}
        />
      )}
    </>
  );
}

function DeployModal({ hostId, hostName, onClose, onDeploy }: { hostId: string; hostName: string; onClose: () => void; onDeploy: (o: { mode: "pull" | "push"; interval: number; pushUrl?: string; insecure?: boolean }) => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"pull" | "push">("pull");
  const [interval, setInterval_] = useState(30);
  const [pushUrl, setPushUrl] = useState(`${location.origin}/api/agent/ingest`);
  const [insecure, setInsecure] = useState(false);
  const [cmd, setCmd] = useState("");
  const opts = { mode, interval, pushUrl: mode === "push" ? pushUrl : "", insecure };
  return (
    <Modal title={`${t("Розгорнути агента")} · ${hostName}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <GhostButton active={mode === "pull"} onClick={() => setMode("pull")}>Pull · {t("двигун забирає по SSH")}</GhostButton>
          <GhostButton active={mode === "push"} onClick={() => setMode("push")}>Push · {t("агент надсилає сам")}</GhostButton>
        </div>
        <label className="block">
          <div className="mb-1.5 text-[13.5px] font-medium">{t("Інтервал збору")}: {interval} s</div>
          <input type="range" min={10} max={60} step={5} value={interval} onChange={(e) => setInterval_(parseInt(e.target.value, 10))} className="shok-range w-full" />
        </label>
        {mode === "push" && (
          <>
            <label className="block">
              <div className="mb-1.5 text-[13.5px] font-medium">{t("URL двигуна для прийому")}</div>
              <input value={pushUrl} onChange={(e) => setPushUrl(e.target.value)} className="mono h-10 w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] px-3 text-[14px] outline-none focus:border-[var(--primary)]" />
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={insecure} onChange={(e) => setInsecure(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
              {t("Самопідписаний сертифікат двигуна")}
            </label>
          </>
        )}
        {cmd && (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[13.5px] font-medium">
              <span className="flex items-center gap-1.5"><TermIcon className="h-4 w-4" /> {t("Команда для ручного встановлення")}</span>
              <GhostButton onClick={() => navigator.clipboard?.writeText(cmd)}>
                <Copy className="h-4 w-4" /> {t("Копіювати")}
              </GhostButton>
            </div>
            <pre className="mono max-h-56 overflow-auto rounded-xl bg-[var(--code-bg)] p-3 text-[12px] leading-relaxed">{cmd}</pre>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <GhostButton onClick={() => api.agentCommand(hostId, opts).then((r) => setCmd(r.command)).catch(() => {})}>
            <TermIcon className="h-4 w-4" /> {t("Показати команду")}
          </GhostButton>
          <PrimaryButton onClick={() => onDeploy(opts)}>
            <Rocket className="h-4 w-4" /> {t("Розгорнути по SSH")}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}
