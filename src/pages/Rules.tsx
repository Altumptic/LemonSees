import { useEffect, useState } from "react";
import { FlaskConical, ListChecks, Pencil, Plus, ScanSearch, Trash2, Zap } from "lucide-react";
import { api, useAppState, useHostSelection } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useIntent } from "@/lib/intent";
import { fmtWhen, type DetectionRule } from "@/lib/types";
import { EmptyState, GhostButton, IconBtn, Kpi, Modal, PageHeader, Panel, Pill, PrimaryButton, SectionHeader, SeverityBadge } from "@/components/ui";

const SEVS = ["critical", "high", "medium", "low", "info"] as const;
const SEV_TXT: Record<string, string> = { critical: "критичний", high: "високий", medium: "середній", low: "низький", info: "інфо" };
const BLANK: Partial<DetectionRule> = { name: "", enabled: true, source: "journal", path: "", pattern: "", threshold: 1, windowMin: 15, severity: "medium", technique: "", category: "", hosts: [] };

export default function RulesPage() {
  const { hosts, demo } = useAppState();
  const { t } = useI18n();
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [presets, setPresets] = useState<Partial<DetectionRule>[]>([]);
  const [edit, setEdit] = useState<Partial<DetectionRule> | null>(null);
  const [err, setErr] = useState("");

  const load = () =>
    api.rules().then((r) => {
      setRules(r.rules);
      setPresets(r.presets);
    }).catch(() => {});
  useEffect(() => {
    load();
  }, [demo]);
  useIntent("new", () => setEdit({ ...BLANK }));

  const persist = async (list: Partial<DetectionRule>[]) => {
    setErr("");
    try {
      setRules((await api.saveRules(list)).rules);
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    }
  };

  const enabled = rules.filter((r) => r.enabled).length;
  const hits = rules.filter((r) => r.lastHit && Date.now() - r.lastHit < 86400000).length;

  return (
    <>
      <PageHeader
        eyebrow={t("SOAR · Виявлення")}
        title={t("Правила виявлення")}
        lede={t("Власні кореляційні правила поверх журналів хостів: регулярний вираз, поріг і вікно часу. Спрацювання стає інцидентом з технікою MITRE і йде в інтеграції.")}
        action={
          <PrimaryButton onClick={() => setEdit({ ...BLANK })}>
            <Plus className="h-4 w-4" /> {t("Нове правило")}
          </PrimaryButton>
        }
      />
      {err && <div className="mb-4 rounded-xl bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-4 py-3 text-[14px] text-[var(--danger)]">{err}</div>}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label={t("Правил")} value={rules.length} icon={ListChecks} tone="neutral" />
        <Kpi label={t("Активні")} value={enabled} icon={Zap} tone={enabled ? "ok" : "neutral"} />
        <Kpi label={t("Спрацювали за 24 год")} value={hits} icon={ScanSearch} tone={hits ? "warning" : "ok"} />
        <Kpi label={t("Хостів під наглядом")} value={hosts.length} icon={FlaskConical} tone="neutral" />
      </div>

      <Panel className="mb-6">
        <SectionHeader icon={ListChecks} title={t("Мої правила")} sub={t("Перевіряються разом зі скануванням загроз (інтервал — у налаштуваннях SOC)")} />
        {rules.length === 0 ? (
          <EmptyState icon={ListChecks} title={t("Ще немає правил")} hint={t("Почни з шаблону нижче або створи своє.")} />
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-4 py-3.5">
                <button
                  role="switch"
                  aria-checked={r.enabled}
                  onClick={() => persist(rules.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${r.enabled ? "bg-[var(--primary)]" : "bg-[var(--hairline-strong)]"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${r.enabled ? "left-[calc(100%-1.375rem)]" : "left-0.5"}`} />
                </button>
                <div className="min-w-[240px] flex-1">
                  <div className="text-[15px] font-medium">{t(r.name)}</div>
                  <div className="mono truncate text-[12.5px] text-muted-foreground">
                    {r.source === "file" ? r.path : "journald"} · /{r.pattern}/ · ≥{r.threshold} {t("за")} {r.windowMin} {t("хв")}
                  </div>
                </div>
                {r.technique && <Pill color="var(--c2)">{r.technique}</Pill>}
                <SeverityBadge level={r.severity} />
                <span className="w-32 text-right text-[12.5px] text-muted-foreground">{r.lastHit ? `${t("спрацювало")} ${fmtWhen(r.lastHit)}` : t("не спрацьовувало")}</span>
                <IconBtn title={t("Редагувати")} onClick={() => setEdit(r)}>
                  <Pencil className="h-4 w-4" />
                </IconBtn>
                <IconBtn title={t("Видалити")} danger onClick={() => confirm(t("Видалити правило?")) && persist(rules.filter((x) => x.id !== r.id))}>
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <SectionHeader icon={Plus} title={t("Шаблони")} sub={t("Типові сценарії — додай одним кліком і підлаштуй")} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {presets.map((p) => (
          <button key={p.name} onClick={() => setEdit({ ...BLANK, ...p, name: t(p.name || "") })} className="glass rounded-2xl p-5 text-left transition-colors hover:border-[var(--hairline-strong)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-semibold">{t(p.name || "")}</span>
              {p.severity && <SeverityBadge level={p.severity} />}
            </div>
            <div className="mono mt-2 truncate text-[12.5px] text-muted-foreground">/{p.pattern}/</div>
            <div className="mt-2 text-[12.5px] text-muted-foreground">
              ≥{p.threshold} {t("за")} {p.windowMin} {t("хв")} · {p.technique}
            </div>
          </button>
        ))}
      </div>

      {edit && <RuleForm initial={edit} hosts={hosts} onClose={() => setEdit(null)} onSave={async (r) => (await persist(r.id ? rules.map((x) => (x.id === r.id ? { ...x, ...r } : x)) : [...rules, r])) && setEdit(null)} />}
    </>
  );
}

function RuleForm({ initial, hosts, onClose, onSave }: { initial: Partial<DetectionRule>; hosts: { id: string; name: string }[]; onClose: () => void; onSave: (r: Partial<DetectionRule>) => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<Partial<DetectionRule>>(initial);
  const [hostId] = useHostSelection();
  const [testHost, setTestHost] = useState(hostId ?? hosts[0]?.id ?? "");
  const [res, setRes] = useState<string>("");
  const set = (p: Partial<DetectionRule>) => setF({ ...f, ...p });

  const test = async () => {
    setRes(t("Перевіряю…"));
    try {
      const r = await api.testRule(f, testHost);
      setRes(`${r.count} ${t("збігів")} — ${r.triggered ? t("правило спрацювало б") : t("нижче порогу")}`);
    } catch (e) {
      setRes((e as Error).message);
    }
  };

  return (
    <Modal title={f.id ? t("Редагувати правило") : t("Нове правило")} onClose={onClose} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <L label={t("Назва")} full>
          <input value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
        </L>
        <L label={t("Джерело")}>
          <select value={f.source} onChange={(e) => set({ source: e.target.value as DetectionRule["source"] })} className={inputCls}>
            <option value="journal">journald ({t("за вікном часу")})</option>
            <option value="file">{t("Файл журналу")}</option>
          </select>
        </L>
        {f.source === "file" ? (
          <L label={t("Шлях до файлу")}>
            <input value={f.path ?? ""} onChange={(e) => set({ path: e.target.value })} placeholder="/var/log/nginx/error.log" className={`${inputCls} mono`} />
          </L>
        ) : (
          <div />
        )}
        <L label={t("Шаблон (регулярний вираз, grep -E)")} full>
          <input value={f.pattern ?? ""} onChange={(e) => set({ pattern: e.target.value })} placeholder="Failed password for .* from" className={`${inputCls} mono`} />
        </L>
        <L label={t("Поріг збігів")}>
          <input type="number" min={1} value={f.threshold} onChange={(e) => set({ threshold: parseInt(e.target.value, 10) || 1 })} className={inputCls} />
        </L>
        <L label={t("Вікно, хв")}>
          <input type="number" min={1} value={f.windowMin} onChange={(e) => set({ windowMin: parseInt(e.target.value, 10) || 15 })} className={inputCls} />
        </L>
        <L label={t("Техніка MITRE (напр. T1110)")}>
          <input value={f.technique ?? ""} onChange={(e) => set({ technique: e.target.value })} className={`${inputCls} mono`} />
        </L>
        <L label={t("Категорія")}>
          <input value={f.category ?? ""} onChange={(e) => set({ category: e.target.value })} placeholder="brute-force" className={inputCls} />
        </L>
        <L label={t("Серйозність")} full>
          <div className="flex flex-wrap gap-1.5">
            {SEVS.map((s) => (
              <GhostButton key={s} active={f.severity === s} onClick={() => set({ severity: s })}>
                {t(SEV_TXT[s])}
              </GhostButton>
            ))}
          </div>
        </L>
        <L label={t("Хости (порожньо — усі)")} full>
          <div className="flex flex-wrap gap-1.5">
            {hosts.map((h) => {
              const on = f.hosts?.includes(h.id);
              return (
                <GhostButton key={h.id} active={on} onClick={() => set({ hosts: on ? f.hosts!.filter((x) => x !== h.id) : [...(f.hosts || []), h.id] })}>
                  {h.name}
                </GhostButton>
              );
            })}
          </div>
        </L>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-raised)] p-3 sm:col-span-2">
          <select value={testHost} onChange={(e) => setTestHost(e.target.value)} className={`${inputCls} w-auto`}>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
          <GhostButton onClick={test} disabled={!testHost || !f.pattern}>
            <ScanSearch className="h-4 w-4" /> {t("Перевірити на хості")}
          </GhostButton>
          <span className="text-[13.5px] text-muted-foreground">{res}</span>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <GhostButton onClick={onClose}>{t("Скасувати")}</GhostButton>
        <PrimaryButton onClick={() => onSave(f)}>{t("Зберегти")}</PrimaryButton>
      </div>
    </Modal>
  );
}

function L({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <div className="mb-1.5 text-[13.5px] font-medium">{label}</div>
      {children}
    </label>
  );
}

const inputCls = "h-10 w-full rounded-xl border border-[var(--hairline-strong)] bg-[var(--surface)] px-3 text-[14.5px] outline-none focus:border-[var(--primary)]";
