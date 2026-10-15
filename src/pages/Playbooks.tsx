import { useEffect, useState } from "react";
import { Workflow, Siren, Radar, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { SocConfig } from "@/lib/types";
import { PageHeader, Panel, SectionHeader, Pill, Track } from "@/components/ui";

export default function PlaybooksPage() {
  const { t } = useI18n();
  const [soc, setSoc] = useState<SocConfig>({ autoIncidents: true, bruteThreshold: 300 });

  useEffect(() => {
    api.getSoc().then(setSoc).catch(() => {});
  }, []);
  const update = (patch: Partial<SocConfig>) => {
    const next = { ...soc, ...patch };
    setSoc(next);
    api.setSoc(next).then(setSoc).catch(() => {});
  };

  const playbooks = [
    {
      id: "bruteforce",
      icon: Radar,
      title: t("Виявлення брутфорсу SSH"),
      trigger: t("Невдалих SSH-логінів за 24 год ≥ поріг"),
      action: t("Автостворення інциденту (дедуп по хосту), запис в аудит"),
      enabled: soc.autoIncidents,
      live: true,
    },
    {
      id: "posture",
      icon: ShieldCheck,
      title: t("Оцінка постури при підключенні"),
      trigger: t("Хост онлайн"),
      action: t("Обчислення ризику з портів, firewall, SSH, оновлень"),
      enabled: true,
      live: true,
    },
    {
      id: "geoip",
      icon: Siren,
      title: t("Збагачення атак гео-IP"),
      trigger: t("Нові атакуючі IP у журналі"),
      action: t("Резолв країни/ISP для пріоритезації"),
      enabled: true,
      live: false,
    },
  ];

  return (
    <>
      <PageHeader eyebrow="SOAR" title={t("Плейбуки")} lede={t("Автоматизації, що працюють у фоні без участі аналітика.")} />
      <Panel className="mb-5">
        <SectionHeader icon={Workflow} title={t("Правило: авто-інциденти при брутфорсі")} sub={t("SOAR — автоматична реакція без участі аналітика")} />
        <div className="grid gap-4 md:grid-cols-2">
          <Toggle label={t("Увімкнено")} desc={t("Створювати інцидент автоматично при перевищенні порогу.")} on={soc.autoIncidents} onChange={(v) => update({ autoIncidents: v })} />
          <div className="rounded-lg border border-[var(--hairline)] p-4">
            <div className="text-[14.5px] font-medium">{t("Поріг брутфорсу (за 24 год)")}</div>
            <div className="mb-3 text-[13.5px] text-muted-foreground">{t("Скільки невдалих логінів запускає інцидент.")}</div>
            <div className="flex items-center gap-3">
              <input type="range" min={50} max={5000} step={50} value={soc.bruteThreshold} onChange={(e) => update({ bruteThreshold: parseInt(e.target.value, 10) })} className="shok-range w-full" />
              <span className="num w-16 text-right text-[14.5px] text-foreground/80">{soc.bruteThreshold}</span>
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionHeader icon={Workflow} title={t("Плейбуки")} sub={t("Автоматизації, що працюють у фоні")} />
        <div className="space-y-2">
          {playbooks.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.id} className="grid grid-cols-12 items-center gap-3 rounded-lg border border-[var(--hairline)] px-4 py-3">
                <div className="col-span-5 flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--hairline)]"><Icon className="h-4 w-4 text-[var(--primary)]" /></span>
                  <span className="text-[14.5px] font-medium">{p.title}</span>
                </div>
                <div className="col-span-3 text-[13px] text-muted-foreground"><span className="text-muted-foreground/60 font-medium">{t("тригер")}</span><br />{p.trigger}</div>
                <div className="col-span-3 text-[13px] text-muted-foreground"><span className="text-muted-foreground/60 font-medium">{t("дія")}</span><br />{p.action}</div>
                <div className="col-span-1 flex justify-end">
                  <Pill color={p.enabled ? "var(--success)" : "var(--muted-foreground)"} dot>{p.enabled ? t("активний") : t("вимкнено")}</Pill>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4"><Track value={100} tone="ok" /></div>
        <div className="mt-2 text-[12px] text-muted-foreground font-medium">{t("Монітор сканує кожні 5 хв · дедуплікація активна")}</div>
      </Panel>
    </>
  );
}

function Toggle({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-[var(--hairline)] p-4">
      <div>
        <div className="text-[14.5px] font-medium">{label}</div>
        <div className="text-[13.5px] text-muted-foreground">{desc}</div>
      </div>
      <button onClick={() => onChange(!on)} className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${on ? "border-[var(--primary)]/50 bg-[color-mix(in_oklab,var(--primary)_35%,transparent)]" : "border-[var(--hairline)] bg-[var(--surface-raised)]"}`}>
        <span className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all ${on ? "left-[calc(100%-1.05rem)] bg-[var(--primary)]" : "left-[3px] bg-muted-foreground"}`} />
      </button>
    </div>
  );
}
