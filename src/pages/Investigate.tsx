import { useState } from "react";
import { Search, Globe, ShieldAlert, ShieldCheck, Server } from "lucide-react";
import { api, useAppState , useHostSelection } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import type { IpIntel } from "@/lib/types";
import { PageHeader, HostBar, Panel, PrimaryButton, Kpi, Pill, SectionHeader, EmptyState } from "@/components/ui";

function flag(cc: string): string {
  if (!cc || cc.length !== 2) return "🌐";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export default function InvestigatePage() {
  const { hosts } = useAppState();
  const { t } = useI18n();
  const { settings } = useSettings();
  const [hostId, setHostId] = useHostSelection();
  const [ip, setIp] = useState("");
  const [data, setData] = useState<IpIntel | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const active = hostId ?? hosts.find((h) => h.status === "online")?.id ?? hosts[0]?.id ?? null;

  const run = () => {
    if (!active || !ip.trim()) return;
    setLoading(true);
    setErr("");
    setData(null);
    api.investigate(active, ip.trim(), settings.geoip).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };

  if (hosts.length === 0) return <EmptyState icon={Search} title={t("Немає хостів")} hint={t("Додай сервер — розвідка виконується з нього.")} />;

  return (
    <>
      <PageHeader eyebrow="CTI" title={t("Розвідка IP")} lede={t("Збагачення IP: гео, зворотний DNS, WHOIS і звірка з базою атак.")} />
      <HostBar hosts={hosts} value={active} onChange={setHostId} />
      <Panel className="mb-5">
        <SectionHeader icon={Search} title={t("Розвідка по IP")} sub={t("Гео, зворотний DNS, WHOIS і звірка з базою атак — запити з обраного хоста")} />
        <div className="flex gap-2">
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="напр. 91.92.47.35"
            className="mono flex-1 rounded-md border border-[var(--hairline)] bg-transparent px-3 py-2 text-[14.5px] outline-none focus:border-[var(--hairline-strong)] focus:ring-1 focus:ring-[var(--ring)]"
          />
          <PrimaryButton onClick={run} disabled={loading}><Search className="h-3 w-3" /> {loading ? t("Шукаю…") : t("Дослідити")}</PrimaryButton>
        </div>
      </Panel>

      {err && <Panel className="mb-5"><div className="mono py-4 text-center text-[14.5px] text-[var(--danger)]">{err}</div></Panel>}

      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label={t("Репутація")} value={data.known ? t("шкідливий") : t("невідомо")} icon={data.known ? ShieldAlert : ShieldCheck} tone={data.known ? "critical" : "neutral"} sub={data.known ? `${data.attackCount} ${t("атак")}` : ""} />
            <Kpi label={t("Країна")} value={data.geo ? `${flag(data.geo.countryCode)} ${data.geo.countryCode || "?"}` : "—"} icon={Globe} tone="neutral" sub={data.geo?.city || ""} />
            <Kpi label="ISP" value={(data.geo?.isp || "—").slice(0, 16)} icon={Server} tone="neutral" />
            <Kpi label="rDNS" value={(data.rdns || "—").slice(0, 18)} icon={Globe} tone="neutral" />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel>
              <SectionHeader icon={Globe} title={t("Геолокація")} />
              <dl className="mono space-y-1.5 text-[13.5px]">
                <Row k="IP" v={data.ip} />
                <Row k={t("Країна")} v={data.geo ? `${data.geo.country} (${data.geo.countryCode})` : "—"} />
                <Row k={t("Місто")} v={data.geo?.city || "—"} />
                <Row k="ISP / Org" v={data.geo?.isp || "—"} />
                <Row k="Reverse DNS" v={data.rdns || "—"} />
                <Row k={t("У базі атак")} v={data.known ? `${t("так")} · ${data.attackCount}` : t("ні")} />
              </dl>
              {data.known && <div className="mt-3"><Pill color="var(--danger)" dot>{t("Цей IP атакував ваш сервер")}</Pill></div>}
            </Panel>
            <Panel>
              <SectionHeader icon={Server} title="WHOIS" />
              {data.whois.length === 0 ? (
                <div className="py-4 text-center text-[14.5px] text-muted-foreground">{t("whois недоступний на хості")}</div>
              ) : (
                <pre className="mono max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--hairline)] bg-[var(--code-bg)] p-3 text-[12.5px] text-muted-foreground">{data.whois.join("\n")}</pre>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--hairline)] py-1.5 last:border-0">
      <dt className="text-muted-foreground font-medium">{k}</dt>
      <dd className="truncate text-foreground/90">{v}</dd>
    </div>
  );
}
