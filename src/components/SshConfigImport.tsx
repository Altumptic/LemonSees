import { useEffect, useMemo, useState } from "react";
import { FileKey2, KeyRound } from "lucide-react";
import { api, useAppState } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import type { SshConfigEntry, SshConfigView } from "@/lib/types";
import { GhostButton, Modal, Pill, PrimaryButton } from "@/components/ui";

/** Причини й попередження приходять із сервера англійською: тут вони відповідають локалізованим рядкам. */
const TEXT: Record<string, string> = {
  "HostName uses a substitution that LemonSees does not expand": "HostName містить підстановку, яку LemonSees не розкриває",
  "HostName is not a valid address": "HostName не є коректною адресою",
  "Port is not a valid number": "Port не є коректним числом",
  "IdentityFile is not an absolute path": "IdentityFile не є абсолютним шляхом",
  "No key found: add IdentityFile or place a key in ~/.ssh": "Ключ не знайдено: додай IdentityFile або поклади ключ у ~/.ssh",
  "The key file does not exist": "Файлу ключа не існує",
  "ProxyCommand is not supported": "ProxyCommand не підтримується",
  "Include is not followed; only ~/.ssh/config itself is read.": "Include не відкриваються: читається лише сам ~/.ssh/config.",
  "Match blocks are not evaluated; hosts that depend on them may be incomplete.": "Блоки Match не обчислюються: хости, що від них залежать, можуть бути неповними.",
  "The file could not be read.": "Файл не вдалося прочитати.",
};

export function SshConfigImport({ onClose }: { onClose: () => void }) {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const { settings } = useSettings();
  const [view, setView] = useState<SshConfigView | null>(null);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Record<string, string>>({}); // alias → "ok" | текст помилки

  const known = (e: SshConfigEntry) => hosts.some((h) => (h.host === e.host && h.user === e.user && h.port === e.port) || h.name === e.alias);

  useEffect(() => {
    api
      .sshConfig()
      .then((v) => {
        setView(v);
        setPicked(new Set(v.entries.filter((e) => e.ready && !hosts.some((h) => (h.host === e.host && h.user === e.user && h.port === e.port) || h.name === e.alias)).map((e) => e.alias)));
      })
      .catch((e) => setErr(e.message));
    // Початковий вибір робиться один раз, коли надійшов список
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importable = useMemo(() => (view?.entries ?? []).filter((e) => e.ready && !known(e)), [view, hosts]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = importable.filter((e) => picked.has(e.alias));

  const toggle = (alias: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(alias)) n.delete(alias);
      else n.add(alias);
      return n;
    });

  const run = async () => {
    setBusy(true);
    const res: Record<string, string> = {};
    for (const e of chosen) {
      try {
        await api.addHost({ name: e.alias, host: e.host, port: e.port, user: e.user, authType: "key", keyPath: e.keyPath, passphrase: "", password: "", interval: 5 });
        res[e.alias] = "ok";
      } catch (x) {
        res[e.alias] = (x as Error).message;
      }
      setDone({ ...res });
    }
    setBusy(false);
  };

  const finished = Object.keys(done).length > 0 && !busy;
  const okCount = Object.values(done).filter((v) => v === "ok").length;

  return (
    <Modal title={t("Імпорт з ~/.ssh/config")} onClose={onClose} wide>
      <p className="mb-4 text-[14px] text-muted-foreground">{t("Хости з файлу ~/.ssh/config на машині, де працює LemonSees. Читається лише сам файл: вміст ключів не відкривається, нічого не надсилається.")}</p>

      {err && <div className="mb-3 rounded-xl border border-[var(--danger)]/30 px-4 py-3 text-[14px] text-[var(--danger)]">{err}</div>}
      {!view && !err && <div className="skeleton h-40" />}
      {view && !view.found && <div className="py-8 text-center text-[14.5px] text-muted-foreground">{t("Файл ~/.ssh/config не знайдено.")}</div>}
      {view && view.found && view.entries.length === 0 && <div className="py-8 text-center text-[14.5px] text-muted-foreground">{t("У файлі немає хостів, які можна імпортувати.")}</div>}

      {view && view.entries.length > 0 && (
        <ul className="max-h-[46vh] divide-y divide-[var(--hairline)] overflow-y-auto rounded-lg border border-[var(--hairline)]">
          {view.entries.map((e) => {
            const have = known(e);
            const can = e.ready && !have;
            return (
              <li key={e.alias} className="flex items-start gap-3 px-4 py-3">
                <input type="checkbox" className="mt-1" disabled={!can || busy} checked={can && picked.has(e.alias)} onChange={() => toggle(e.alias)} aria-label={e.alias} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-medium">{e.alias}</span>
                    <span className="mono text-[12.5px] text-muted-foreground">{e.user}@{e.host}:{e.port}</span>
                    {have && <Pill color="var(--info)">{t("Вже додано")}</Pill>}
                    {done[e.alias] === "ok" && <Pill color="var(--success)" dot>{t("Імпортовано")}</Pill>}
                  </div>
                  {e.keyPath && (
                    <div className="mono mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                      <KeyRound className="h-3 w-3" /> {e.keyPath}
                      {e.keySource === "default" && <span>· {t("ключ за замовчуванням")}</span>}
                    </div>
                  )}
                  {e.proxyJump && <div className="mt-0.5 text-[12.5px] text-muted-foreground">ProxyJump {e.proxyJump}: {t("не імпортується, налаштуй бастіон вручну")}</div>}
                  {!e.ready && e.reasons.map((r) => <div key={r} className="mt-0.5 text-[12.5px] text-[var(--warning)]">{t(TEXT[r] ?? r)}</div>)}
                  {done[e.alias] && done[e.alias] !== "ok" && <div className="mt-0.5 text-[12.5px] text-[var(--danger)]">{done[e.alias]}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {view && view.warnings.map((w) => <p key={w} className="mt-3 text-[12.5px] text-muted-foreground">{t(TEXT[w] ?? w)}</p>)}
      {view && view.skipped > 0 && <p className="mt-1 text-[12.5px] text-muted-foreground">{view.skipped} {t("шаблонів із * чи ? не показано як хости")}</p>}

      {settings.demo && <p className="mt-3 text-[13px] text-muted-foreground">{t("У демо-режимі імпорт лише показує список і нічого не додає.")}</p>}
      <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
        <FileKey2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("Якщо ключ захищений парольною фразою, додай її в налаштуваннях хоста після імпорту.")}
      </p>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-[13.5px] text-muted-foreground">{finished ? `${okCount} ${t("імпортовано")}` : `${chosen.length} ${t("вибрано")}`}</span>
        <span className="flex gap-2">
          <GhostButton onClick={onClose}>{finished ? t("Закрити") : t("Скасувати")}</GhostButton>
          {!finished && (
            <PrimaryButton onClick={run} disabled={busy || chosen.length === 0 || settings.demo}>
              {busy ? t("Імпорт…") : t("Імпортувати вибрані")}
            </PrimaryButton>
          )}
        </span>
      </div>
    </Modal>
  );
}
