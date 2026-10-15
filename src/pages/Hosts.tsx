import { useState } from "react";
import { useIntent } from "@/lib/intent";
import { Cpu, HardDrive, MemoryStick, Server, Pencil, Trash2, Plug } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { fmtUptime, type HostInput, type HostState } from "@/lib/types";
import {
  PageHeader,
  Panel,
  StatusDot,
  Bar,
  GhostButton,
  PrimaryButton,
  IconBtn,
  TextInput,
  Modal,
  STATUS_LABEL,
} from "@/components/ui";

const EMPTY: HostInput = {
  name: "",
  host: "",
  port: 22,
  user: "root",
  authType: "key",
  keyPath: "",
  passphrase: "",
  password: "",
  interval: 5,
};

const ROW_TINT = "hover:bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]";
const HEAD_TINT = "bg-[color-mix(in_oklab,var(--foreground)_3%,transparent)]";

export default function Hosts() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const [editing, setEditing] = useState<HostState | null>(null);
  const [adding, setAdding] = useState(false);
  useIntent("new", () => setAdding(true));

  return (
    <>
      <PageHeader
        eyebrow={t("Флот")}
        title={t("Хости")}
        lede={t("Кожен сервер, доступний по SSH. Ключ або пароль — дані лишаються тільки на цьому ПК.")}
        action={<PrimaryButton onClick={() => setAdding(true)}>{t("Додати хост")}</PrimaryButton>}
      />

      <Panel eyebrow={`${hosts.length} ${t("серверів")}`} title={t("Інвентар флоту")}>
        {hosts.length === 0 ? (
          <div className="py-12 text-center text-[14.5px] text-muted-foreground">
            {t("Поки що порожньо. Натисни «Додати хост» і вкажи адресу сервера.")}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--hairline)]">
            <div className={`mono grid grid-cols-12 gap-3 border-b border-[var(--hairline)] ${HEAD_TINT} px-4 py-2.5 text-[12px] text-muted-foreground font-medium`}>
              <div className="col-span-3">{t("Хост")}</div>
              <div className="col-span-2">{t("Статус")}</div>
              <div className="col-span-3">{t("CPU / RAM / Диск")}</div>
              <div className="col-span-1 text-right">{t("Ктнр")}</div>
              <div className="col-span-1 text-right">{t("Аптайм")}</div>
              <div className="col-span-2 text-right">{t("Дії")}</div>
            </div>

            {hosts.map((h) => (
              <div
                key={h.id}
                className={`grid grid-cols-12 items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 last:border-b-0 ${ROW_TINT}`}
              >
                <div className="col-span-3 min-w-0">
                  <div className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-[14.5px] font-medium">{h.name}</span>
                  </div>
                  <div className="mono truncate text-[12.5px] text-muted-foreground">
                    {h.user}@{h.host}:{h.port}
                  </div>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <StatusDot status={h.status} />
                  <span className="text-[12px] text-muted-foreground font-medium">
                    {t(STATUS_LABEL[h.status])}
                  </span>
                </div>
                <div className="col-span-3 grid grid-cols-3 gap-3">
                  <MiniStat icon={Cpu} value={h.metrics?.cpu ?? 0} />
                  <MiniStat icon={MemoryStick} value={h.metrics?.memPct ?? 0} />
                  <MiniStat icon={HardDrive} value={h.metrics?.diskPct ?? 0} />
                </div>
                <div className="num col-span-1 text-right text-[14.5px]">
                  {h.containers.filter((c) => c.state === "running").length}
                  <span className="text-muted-foreground">/{h.containers.length}</span>
                </div>
                <div className="mono col-span-1 text-right text-[13px] text-muted-foreground">
                  {h.metrics ? fmtUptime(h.metrics.uptimeSec) : "—"}
                </div>
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <IconBtn title={t("Редагувати")} onClick={() => setEditing(h)}>
                    <Pencil className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn
                    title={t("Видалити")}
                    danger
                    onClick={() => {
                      if (confirm(`${t("Прибрати хост")} «${h.name}» ${t("з моніторингу?")}`)) {
                        api.deleteHost(h.id).catch((e) => alert(e.message));
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </IconBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {(adding || editing) && (
        <HostForm
          initial={
            editing
              ? {
                  name: editing.name,
                  host: editing.host,
                  port: editing.port,
                  user: editing.user,
                  authType: editing.authType,
                  keyPath: editing.keyPath,
                  passphrase: "",
                  password: "",
                  interval: editing.interval,
                }
              : EMPTY
          }
          editingId={editing?.id ?? null}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function MiniStat({ icon: Icon, value }: { icon: typeof Cpu; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="num">{Math.round(value)}%</span>
      </div>
      <div className="mt-1">
        <Bar value={value} />
      </div>
    </div>
  );
}

function HostForm({
  initial,
  editingId,
  onClose,
}: {
  initial: HostInput;
  editingId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<HostInput>(initial);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string>("");

  const set = <K extends keyof HostInput>(k: K, v: HostInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true);
    try {
      if (editingId) await api.updateHost(editingId, form);
      else await api.addHost(form);
      onClose();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setTestResult(t("Перевіряю з'єднання…"));
    try {
      const r = await api.testHost(form);
      setTestResult(r.ok ? `✓ ${t("З'єднання ОК")} · ${r.output.split("\n").pop()}` : t("Не вдалося виконати команду"));
    } catch (e) {
      setTestResult(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={editingId ? t("Редагувати хост") : t("Додати хост")} onClose={onClose}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <TextInput label={t("Назва (як показувати)")} value={form.name} onChange={(v) => set("name", v)} placeholder="vps-01" />
          <TextInput label={t("Адреса (IP або домен)")} value={form.host} onChange={(v) => set("host", v)} placeholder="203.0.113.10" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <TextInput label={t("Порт")} value={String(form.port)} onChange={(v) => set("port", parseInt(v, 10) || 22)} />
          <TextInput label={t("Користувач")} value={form.user} onChange={(v) => set("user", v)} placeholder="root" />
          <TextInput
            label={t("Інтервал, с")}
            value={String(form.interval)}
            onChange={(v) => set("interval", parseInt(v, 10) || 5)}
          />
        </div>

        <div>
          <div className="eyebrow mb-2">{t("Автентифікація")}</div>
          <div className="flex gap-2">
            <GhostButton active={form.authType === "key"} onClick={() => set("authType", "key")}>
              {t("SSH-ключ (радимо)")}
            </GhostButton>
            <GhostButton active={form.authType === "password"} onClick={() => set("authType", "password")}>
              {t("Пароль")}
            </GhostButton>
          </div>
        </div>

        {form.authType === "key" ? (
          <div className="grid gap-4">
            <TextInput
              label={t("Шлях до приватного ключа")}
              value={form.keyPath}
              onChange={(v) => set("keyPath", v)}
              placeholder="C:\Users\User\.ssh\id_ed25519"
            />
            <TextInput
              label={t("Пароль ключа (якщо є)")}
              type="password"
              value={form.passphrase}
              onChange={(v) => set("passphrase", v)}
            />
          </div>
        ) : (
          <TextInput
            label={editingId ? t("Пароль (порожньо — лишити старий)") : t("Пароль")}
            type="password"
            value={form.password}
            onChange={(v) => set("password", v)}
          />
        )}

        {testResult && (
          <div className="mono rounded-md border border-[var(--hairline)] px-3 py-2 text-[12.5px] text-muted-foreground">
            {testResult}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-[var(--hairline)] pt-4">
          <GhostButton onClick={test} disabled={busy}>
            <Plug className="h-3 w-3" /> {t("Перевірити з'єднання")}
          </GhostButton>
          <div className="flex gap-2">
            <GhostButton onClick={onClose}>{t("Скасувати")}</GhostButton>
            <PrimaryButton onClick={submit} disabled={busy}>
              {editingId ? t("Зберегти") : t("Додати")}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
