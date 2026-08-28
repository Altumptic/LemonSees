<div align="center">

<img src=".github/assets/banner.svg" alt="LemonSees — SOC Platform" width="100%" />

# 🍋 LemonSees

**Agentless SOC platform for L1 / L2 / L3 analysts — SIEM/XDR, EDR, NDR, CTI, SOAR & GRC over SSH**

[![Release](https://img.shields.io/github/v/release/kiurakku/LemonSees?style=for-the-badge&logo=github&logoColor=white)](https://github.com/kiurakku/LemonSees/releases)
[![License](https://img.shields.io/github/license/kiurakku/LemonSees?style=for-the-badge&color=blue)](LICENSE)
[![Platform](https://img.shields.io/badge/Windows-10%2F11-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/kiurakku/LemonSees/releases)
[![Electron](https://img.shields.io/badge/Electron-43-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[⬇️ Download v2.0.0](https://github.com/kiurakku/LemonSees/releases/latest) · [🐛 Report a bug](https://github.com/kiurakku/LemonSees/issues/new) · [📖 Quick start](#-quick-start)

</div>

---

## ✨ About

**LemonSees** turns your SSH keychain into a full **Security Operations Center** on the desktop. You sit in one bold, tabbed console and monitor your fleet; each host is treated as a managed endpoint where **the SSH session is the agent** — nothing is installed on the server. Built for the day-to-day of **L1 / L2 / L3** analysts: triage, investigate, respond, report.

| | |
|---|---|
| 🖥️ **Platform** | Windows 10/11 (ready-to-run `.exe`) |
| 🔌 **Connection** | SSH key or password — the session is the agent |
| 🧭 **Console** | Cloudflare-style sections → tabs → detail |
| 🛰️ **Domains** | SIEM/XDR · EDR · NDR · CTI · SOAR · GRC |
| 🗄️ **Databases** | 39 engines — query, browse, REST console |
| 🌍 **Languages** | Ukrainian, English, Russian, Polish, Chinese |
| 🎨 **Design** | Clean, data-dense UI (BetterStack-inspired), light + dark themes |
| 🔒 **Security** | Engine binds to `127.0.0.1` only, no agents, no background services |

---

## 🆕 What's new in v2.0.0

- **🍋 Brand — LemonSees** — minimal new logo and a polished, **BetterStack-inspired** UI: deep-charcoal surfaces with soft depth, tabular metrics, a subtle brand glow, and clean **light + dark** themes. Design system documented in [DESIGN.md](DESIGN.md).
- **🧭 SOC information architecture** — reorganised into analyst domains with **sections → sub-tabs** (Cloudflare-style): Console/SIEM, Endpoints/EDR, Network/NDR, Intel/CTI, Response/SOAR, Governance/GRC, Infrastructure, Utilities.
- **🖥️ EDR** — live **process table** (CPU/MEM/uptime) and **persistence** view (cron, systemd services, timers, startup) collected over SSH.
- **🔌 NDR** — full **connections** view (established + listening + owning process) alongside live traffic.
- **🔎 CTI** — **IP investigation** (geo, reverse DNS, WHOIS, cross-check against your attacker list) run from the host.
- **🧰 Utilities** — analyst **network toolkit** (dig, reverse DNS, whois, ping, traceroute, HTTP check, TCP port check) executed on the remote host.
- **🗒️ SIEM events** — remote **log viewer** (auth.log/syslog/nginx/…) + the app event journal in one place.
- **⚙️ SOAR** — playbooks view + the auto-incident brute-force rule.

> Every module runs on **real data over SSH** — no agents deployed, nothing installed on your servers. Deployable EDR agents and malware sandboxing are intentionally out of scope for the agentless model.

---

## 🧭 The console

<table>
<tr><td width="50%">

### 📟 Console · SIEM
Fleet **dashboard** (KPIs, risk-by-host, posture ring, incidents, activity) + a unified **events** view: remote log viewer with color-coded severities and the app journal.

### 🖥️ Endpoints · EDR
Hosts as managed endpoints; **processes** (top CPU/MEM), **persistence** (cron / services / timers / startup), **posture** (risk score), **vulnerabilities** (config/exposure scan with remediation).

### 🌐 Network · NDR
Live **traffic** (rx/tx, top peers with geo-IP) and full **connections** (established + listening + process, public/local flags).

</td><td width="50%">

### 🔎 Intel · CTI
**Threat intelligence** (top attackers, geo-map, targeted usernames) and **IP investigation** (geo · rDNS · WHOIS · attacker cross-check).

### 🚨 Response · SOAR
**Incident** register with severity, status workflow and timeline; **playbooks** incl. the auto-incident brute-force rule.

### ⚖️ Governance · GRC
**Compliance** (CIS/NIST/ISO controls + attestations), **standards reports** (CIS/NIST/ISO/GDPR coverage, HTML export), **audit** log with CSV export.

### 🧰 Utilities
Network **toolkit**, built-in **SSH terminal**, and the **database** hub (39 engines).

</td></tr>
</table>

---

## 🗄️ Database engines

**Full support (query + browse):** PostgreSQL · TimescaleDB · CockroachDB · YugabyteDB · QuestDB · Redshift · MySQL · MariaDB · Redis · KeyDB · Valkey · Dragonfly · MongoDB · SQLite (WASM over SSH)
**REST console:** Elasticsearch · OpenSearch · CouchDB · ClickHouse · Meilisearch · Typesense · Qdrant · Weaviate · Chroma · ArangoDB · InfluxDB · Prometheus
**Planned (needs driver):** MS SQL · Oracle · Cassandra · ScyllaDB · Neo4j · Memgraph · Memcached · Milvus
**Cloud (API keys, not via SSH):** DynamoDB · BigQuery · Snowflake · Firebase · Firestore · Pinecone · Neptune

---

## ⬇️ Installation

1. Download [`LemonSees-v2.0.0-win.zip`](https://github.com/kiurakku/LemonSees/releases/latest) from [Releases](https://github.com/kiurakku/LemonSees/releases)
2. Extract and run `LemonSees.exe`

> Close the window — everything stops. No background services.

### From source

```bash
git clone https://github.com/kiurakku/LemonSees.git
cd LemonSees
npm install
npm run build
npm run dist:win    # → release/win-unpacked/LemonSees.exe
```

---

## 🚀 Quick start

1. Launch **LemonSees**
2. **Infrastructure → Hosts → Add host** — enter IP + SSH key (recommended) or password → **Test connection** → **Add**
3. Within seconds the host appears as an **endpoint**. Then:
   - **Endpoints → Processes / Persistence** — see what's running and what persists
   - **Network → Traffic / Connections** — who's talking to the box
   - **Intel → Threats / IP intel** — who's attacking, and investigate any IP
   - **Governance → Compliance / Reports** — CIS/NIST checks and a downloadable report

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────┐
│            Electron (LemonSees.exe)              │
│  ┌──────────────┐      ┌──────────────────────┐  │
│  │   React UI   │◄────►│   Node.js Engine     │  │
│  │  (sections   │  WS  │   (127.0.0.1)        │  │
│  │   → tabs)    │      └──────────┬───────────┘  │
│  └──────────────┘                 │              │
└───────────────────────────────────┼──────────────┘
                                    │ SSH (port 22)  ← the session IS the agent
                         ┌──────────┴──────────────┐
                         │      Linux Server(s)     │
                         │ /proc · docker · db      │
                         │ auth.log · ss · ps · cron│
                         └──────────────────────────┘
```

- **One persistent SSH connection** per host (multiplexing), separate channels per task
- **Metrics/traffic:** single script per poll (`/proc/stat`, `/proc/net/dev`, `free`, `df`, `docker`); deltas in one round-trip
- **EDR/NDR/CTI:** `ps`, `ss`, `cron`/`systemctl`, `auth.log`, `dig`/`whois` — parsed server-side, enriched with batch geo-IP
- **Databases:** SSH port-forward to native drivers or HTTP proxy for REST engines; SQLite streamed and opened locally with `sql.js`

---

## 🛠️ Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend with HMR (requires running `server`) |
| `npm run server` | Engine standalone |
| `npm run app` | Electron in dev mode |
| `npm run build` | Build frontend → `dist/` |
| `npm run dist:win` | Build `LemonSees.exe` → `release/win-unpacked/` |

**Requirements:** Windows 10/11 (pre-built exe needs nothing else) · Node.js 18+ (dev) · Linux servers with SSH.

---

## 🔐 Data & privacy

| What | Where |
|------|-------|
| Hosts / DBs / incidents / audit | `%APPDATA%\LemonSees\config\` (local only) |
| Passwords | Plain text — **use SSH keys** |
| Outbound traffic | None, except optional geo-IP (attacker/peer public IPs only) |

> The engine binds to `127.0.0.1` only. Geo-IP enrichment (togglable in **Settings**) sends only public IPs of attackers/peers to a geolocation service; everything else stays on your machine.

---

## 📁 Project structure

```
LemonSees/
├── electron/            # Electron main process (frameless window, config migration)
├── server/              # Node.js SSH engine
│   ├── collector.js     # Host metrics + traffic
│   ├── security.js      # Posture · vulns.js — vulnerability scan
│   ├── threats.js       # CTI — auth.log · geoip.js — geo lookup
│   ├── edr.js           # EDR — processes + persistence
│   ├── netops.js        # NDR/CTI — connections, tools, IP intel
│   ├── compliance.js    # GRC — CIS/NIST controls
│   ├── db.js            # 39 DB engines, engines.js — registry
│   └── config.js        # Hosts, DBs, incidents, audit, SOC config
├── src/
│   ├── pages/           # Dashboard, Events, Endpoints, Processes, Persistence,
│   │                    #   Security, Vulnerabilities, Traffic, Connections,
│   │                    #   Threats, Investigate, Incidents, Playbooks,
│   │                    #   Compliance, Reports, Audit, Toolkit, …
│   ├── components/ui.tsx # Design system (Tabs, KPIs, rings, badges)
│   └── lib/             # api, engines, i18n (5 langs), settings
├── buildResources/      # App icon
└── .github/assets/      # Banner, logo
```

---

## 🤝 Contributing

Issues and PRs welcome. For large changes, open an issue first.

---

<div align="center">

**Built with 🍋 for analysts who want a real SOC without the bloat**

MIT © [kiurakku](https://github.com/kiurakku)

</div>
