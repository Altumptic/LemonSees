<div align="center">

<img src=".github/assets/banner.svg" alt="SHOK — SOC & GRC Platform" width="100%" />

# SHOK

**Agentless SOC & GRC platform — Linux, Docker, 39 databases & threat intel over SSH**

[![Release](https://img.shields.io/github/v/release/kiurakku/shok-monitor?style=for-the-badge&logo=github&logoColor=white)](https://github.com/kiurakku/shok-monitor/releases)
[![License](https://img.shields.io/github/license/kiurakku/shok-monitor?style=for-the-badge&color=blue)](LICENSE)
[![Platform](https://img.shields.io/badge/Windows-10%2F11-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/kiurakku/shok-monitor/releases)
[![Electron](https://img.shields.io/badge/Electron-43-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

[![Downloads](https://img.shields.io/github/downloads/kiurakku/shok-monitor/total?style=flat-square&logo=github)](https://github.com/kiurakku/shok-monitor/releases)
[![Stars](https://img.shields.io/github/stars/kiurakku/shok-monitor?style=flat-square&logo=github)](https://github.com/kiurakku/shok-monitor/stargazers)
[![Issues](https://img.shields.io/github/issues/kiurakku/shok-monitor?style=flat-square&logo=github)](https://github.com/kiurakku/shok-monitor/issues)
[![Last commit](https://img.shields.io/github/last-commit/kiurakku/shok-monitor?style=flat-square&logo=github)](https://github.com/kiurakku/shok-monitor/commits/main)

[⬇️ Download v1.4.0](https://github.com/kiurakku/shok-monitor/releases/latest) · [🐛 Report a bug](https://github.com/kiurakku/shok-monitor/issues/new) · [📖 Quick start](#-quick-start)

</div>

---

## ✨ About

**SHOK** is a Windows desktop app that turns your SSH keychain into a full **SOC & GRC workstation** — infrastructure monitoring, database access, security posture, threat intelligence, compliance and audit, all agentless. Nothing is installed on remote machines — only SSH (port 22) is required.

| | |
|---|---|
| 🖥️ **Platform** | Windows 10/11 (ready-to-run `.exe`) |
| 🔌 **Connection** | SSH key or password |
| 🐳 **Infra** | Hosts, Docker containers, networks, volumes, terminal |
| 🗄️ **Databases** | 39 engines — query, browse, REST console |
| 🛡️ **SOC** | Security posture, live threat intel + geo-IP, incidents |
| ⚖️ **GRC** | CIS/NIST/ISO compliance controls, attestations, audit log |
| 🌍 **Languages** | Ukrainian, English, Russian, Polish, Chinese |
| 🎨 **Themes** | 16 color themes + acrylic glass window |
| 🔒 **Security** | Engine listens on `127.0.0.1` only, no agents |

---

## 🆕 What's new in v1.4.0

- **🎯 Threat intelligence** — real-time analysis of `auth.log` / journald: top attacking IPs with **geo-IP** (country · city · ISP), targeted usernames, attack geography, and successful-login review. Live auto-refresh.
- **🚨 Auto-incidents** — a background monitor opens an incident automatically when failed SSH logins cross a configurable threshold (brute-force detection), deduplicated per host.
- **🛡️ Security posture** — per-host risk score from listening ports, sessions, failed logins, firewall, pending updates, SUID, and SSH hardening (`PermitRootLogin`, `PasswordAuthentication`, …).
- **⚖️ Compliance (GRC)** — 15 automated CIS/NIST controls checked over SSH + manual governance attestations, with an overall score and framework tags.
- **📜 Audit log** — append-only, searchable record of every action, exportable to CSV — evidence for audits.
- **🎨 Design system v2** — grouped navigation (Monitor / SOC / GRC / System), KPI tiles, score rings, risk badges, drawers, 16 themes.

> Every module runs on **real data over SSH** — no agents, nothing installed on your servers.

---

## 📸 Features

<table>
<tr>
<td width="50%">

### 📊 SOC dashboard
One panel over the whole estate — KPIs, per-host risk, fleet posture ring, latest incidents and activity.

### 🖥️ Monitoring
Live CPU, RAM, disk, load and uptime per host. Docker containers (start/stop/restart/remove), networks, volumes, live logs, built-in SSH terminal (xterm.js).

### 🗄️ Databases
39 engines over SSH tunnels — categorized picker, table browse & edit, SQL/NoSQL queries, REST console, **Find on server** auto-discovery.

### 🎯 Threat intelligence
Real-time `auth.log` / journald analysis: top attacking IPs with **geo-IP**, attack geography, targeted usernames, successful-login review.

</td>
<td width="50%">

### 🛡️ Security posture
Per-host risk score: listening ports, sessions, failed logins, firewall, pending updates, SUID, SSH hardening — with actionable findings.

### 🚨 Incidents
Incident register with severity, status workflow, host linkage and a full timeline. **Auto-created** on brute-force thresholds.

### ⚖️ Compliance (GRC)
15 automated CIS/NIST controls over SSH + manual governance attestations, overall score, ISO/NIST/CIS framework tags.

### 📜 Audit
Append-only, searchable action log — evidence for audits and investigations, one-click CSV export.

### ⚙️ Settings
5 languages, 16 themes, acrylic window, UI scale, threat thresholds, geo-IP toggle — stored locally.

</td>
</tr>
</table>

---

## 🗄️ Database engines

### Full support (queries + browse)

| Family | Engines |
|--------|---------|
| **PostgreSQL** | PostgreSQL, TimescaleDB, CockroachDB, YugabyteDB, QuestDB, Redshift (self-hosted) |
| **MySQL** | MySQL, MariaDB |
| **Redis** | Redis, KeyDB, Valkey, Dragonfly |
| **Document** | MongoDB |
| **SQLite** | Local WASM browse over SSH (read-only; file loaded into memory) |

### REST console (HTTP adapter)

Elasticsearch · OpenSearch · CouchDB · ClickHouse · Meilisearch · Typesense · Qdrant · Weaviate · Chroma · ArangoDB · InfluxDB · Prometheus

### Coming soon (needs dedicated driver)

MS SQL · Oracle · Cassandra · ScyllaDB · Neo4j · Memgraph · Memcached · Milvus

### Cloud (vendor API keys — not available over SSH)

DynamoDB · BigQuery · Snowflake · Firebase · Firestore · Pinecone · Neptune

> Cloud databases require provider API keys and are outside the SSH agentless model. They are listed for transparency.

---

## 🛡️ SOC & GRC

Everything below runs on **real data collected over SSH** — no agents, nothing installed on the server.

| Module | What it does | Framework |
|--------|--------------|-----------|
| **Security posture** | Risk score from open ports, sessions, failed logins, firewall, updates, SUID, SSH hardening | — |
| **Threat intel** | Top attacking IPs from `auth.log`/journald, geo-IP (country · city · ISP), targeted usernames, attack map | — |
| **Incidents** | Register with severity, status workflow, timeline; **auto-created** on brute-force thresholds | NIST IR |
| **Compliance** | Automated SSH-hardening / firewall / auto-updates / auditd / time-sync checks + manual attestations | CIS · NIST · ISO 27001 |
| **Audit** | Append-only action log with CSV export — evidence for auditors | NIST AU |

**Auto-incident rule** — when failed SSH logins over 24h exceed the configurable threshold (default `300`), an incident is opened automatically and deduplicated per host. Toggle and tune in **Settings → Threats**.

> **Privacy note:** geo-IP enrichment sends *attackers' public IPs only* to a geolocation service. It is on by default and can be disabled in **Settings → Threats → Geo-IP enrichment**. Everything else stays on your machine.

---

## ⬇️ Installation

### Pre-built release (recommended)

1. Download [`SHOK-v1.4.0-win.zip`](https://github.com/kiurakku/shok-monitor/releases/latest) from [Releases](https://github.com/kiurakku/shok-monitor/releases)
2. Extract the archive
3. Run `SHOK.exe`

> Close the window — everything stops. No background services.

### From source

```bash
git clone https://github.com/kiurakku/shok-monitor.git
cd shok-monitor
npm install
npm run build
npm run dist:win    # → release/win-unpacked/SHOK.exe
```

---

## 🚀 Quick start

1. Launch **SHOK**
2. Go to **Hosts → Add host**
3. Enter IP, username, and auth method:
   - **SSH key** *(recommended)*: `C:\Users\User\.ssh\id_ed25519`
   - **Password**: standard SSH password
4. Click **Test connection** → **Add**

Within seconds you'll see live metrics, containers, and networks. Then explore:
- **Databases → Find on server** — auto-detect PostgreSQL, Redis, SQLite files, and more.
- **Security** / **Threats** — get an instant risk score and see who's brute-forcing your SSH (with geo-IP).
- **Compliance** — run CIS/NIST checks over SSH and attest governance controls.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────┐
│              Electron (SHOK.exe)                 │
│  ┌──────────────┐      ┌──────────────────────┐  │
│  │   React UI   │◄────►│   Node.js Engine     │  │
│  │   (Vite)     │  WS  │   (127.0.0.1)        │  │
│  └──────────────┘      └──────────┬───────────┘  │
└───────────────────────────────────┼──────────────┘
                                    │ SSH (port 22)
                         ┌──────────┴──────────────┐
                         │      Linux Server(s)     │
                         │ /proc · docker · db      │
                         │ auth.log · sshd · ss     │
                         └──────────────────────────┘
```

- **One persistent SSH connection** per host (multiplexing), separate channels per task
- **Metrics:** single script per poll (`/proc/stat`, `free`, `df`, `docker ps/stats`); CPU delta in one SSH round-trip
- **Databases:** SSH port-forward to local drivers (pg, mysql2, ioredis, mongodb) or HTTP proxy for REST engines
- **SQLite:** file streamed over SSH (base64) → opened locally with `sql.js` WASM (read-only)
- **SOC/GRC:** `security.js`, `threats.js`, `compliance.js` run hardened one-pass scripts over SSH; geo-IP resolved from a batch lookup; auto-incident monitor sweeps every 5 min

---

## 🛠️ Development

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend with HMR (requires running `server`) |
| `npm run server` | Engine standalone, opens browser |
| `npm run app` | Electron in dev mode |
| `npm run build` | Build frontend → `dist/` |
| `npm run dist:win` | Build `SHOK.exe` → `release/win-unpacked/` |

`ШОК.bat` — fallback launch via browser without Electron.

### Requirements

- **Windows 10/11** (pre-built exe needs nothing else)
- **Node.js 18+** (for development)
- **Linux servers** with SSH; Docker and databases are optional

---

## 🔐 Data & security

| What | Where |
|------|-------|
| Hosts / DBs / incidents / audit | `%APPDATA%\shok-monitor\config\` (local only) |
| Passwords | Stored in plain text — **use SSH keys** |
| Outbound traffic | None, except optional geo-IP (attacker public IPs only) |

> ⚠️ **Use SSH keys instead of passwords** for better security. The engine binds to `127.0.0.1` only.

---

## 📁 Project structure

```
shok-monitor/
├── electron/            # Electron main process (acrylic window)
├── server/              # Node.js SSH engine
│   ├── collector.js     # Host metrics (single-pass CPU delta)
│   ├── db.js            # 39 DB engines, tunnels, REST/SQLite
│   ├── engines.js       # Engine registry
│   ├── security.js      # SOC — host posture
│   ├── threats.js       # SOC — auth.log threat intel
│   ├── geoip.js         # Geo-IP batch lookup + cache
│   ├── compliance.js    # GRC — CIS/NIST controls
│   └── config.js        # Hosts, DBs, incidents, audit, SOC config
├── src/
│   ├── pages/           # Dashboard, Security, Threats, Incidents,
│   │                    #   Compliance, Audit, Database, Hosts, …
│   ├── components/ui.tsx # Design system v2
│   └── lib/             # api, engines, i18n (5 langs), settings
├── buildResources/      # App icon
└── .github/assets/      # Banner, logo, social preview
```

---

## 👥 Contributors

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/kiurakku">
        <img src="https://github.com/kiurakku.png" width="80" height="80" style="border-radius:50%" alt="kiurakku"/>
      </a>
      <br />
      <a href="https://github.com/kiurakku"><b>kiurakku</b></a>
      <br />
      <sub>Owner & Developer</sub>
    </td>
  </tr>
</table>

---

## 🤝 Contributing

Issues and Pull Requests are welcome! For large changes, please open an issue first to discuss.

---

<div align="center">

**Built with ⚡ for people who like simple monitoring without the bloat**

MIT © [kiurakku](https://github.com/kiurakku)

</div>
