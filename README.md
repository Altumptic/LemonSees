<div align="center">

<img src=".github/assets/logo.png" alt="SHOK" width="128" height="128" />

# SHOK

**Agentless Linux server, Docker & database monitoring over SSH**

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

[⬇️ Download v1.2.1](https://github.com/kiurakku/shok-monitor/releases/latest) · [🐛 Report a bug](https://github.com/kiurakku/shok-monitor/issues/new) · [📖 Quick start](#-quick-start)

</div>

---

## ✨ About

**SHOK** is a Windows desktop app for monitoring Linux servers, Docker, and databases over SSH. Nothing is installed on remote machines — only SSH (port 22) is required.

| | |
|---|---|
| 🖥️ **Platform** | Windows 10/11 (ready-to-run `.exe`) |
| 🔌 **Connection** | SSH key or password |
| 🐳 **Docker** | Containers, networks, volumes, logs |
| 🗄️ **Databases** | 39 engines — query, browse, REST console |
| 🌍 **Languages** | Ukrainian, English, Russian, Polish, Chinese |
| 🎨 **Themes** | 6 built-in color themes + acrylic window |
| 🔒 **Security** | Engine listens on `127.0.0.1` only |
| ⚡ **Lightweight** | No agents, no background services |

---

## 🆕 What's new in v1.2.1

- **Real metrics** — rewritten collector; CPU is computed from two `/proc/stat` reads in a single SSH call. Live-tested: values differ per host and update correctly.
- **SQLite works** — no `sqlite3` on the server; `.db` files are fetched over SSH and opened locally with a WASM engine (read-only browse).
- **Database hub** — 39 engines grouped by category, auto-discovery on the server (Docker, listening ports, SQLite files).
- **REST console** — HTTP adapters for Elasticsearch, OpenSearch, ClickHouse, InfluxDB, Prometheus, vector DBs, and more.
- **UI polish** — acrylic glass window, glow accents in Settings, version badge in the sidebar.

---

## 📸 Features

<table>
<tr>
<td width="50%">

### 📊 Fleet overview
Live CPU, RAM, disk, load, and uptime for every host. Warnings for overloads and container restart loops.

### 🖧 Host management
Add, edit, and test SSH connections. Supports `ed25519` / RSA keys.

### 📦 Docker
Start, stop, restart, remove containers. Networks, volumes, live logs.

### 💻 Built-in terminal
Full SSH terminal (xterm.js) inside the app.

</td>
<td width="50%">

### 🗄️ Databases
Connect to 30+ engines over SSH tunnels. Categorized picker, tabs per engine type, table browse, SQL/NoSQL queries.

### 🔍 Auto-discovery
**Find on server** scans Docker containers, listening ports, and SQLite files — suggests connections automatically.

### 🌐 REST console
HTTP-based engines (search, vector, time-series) with quick-query presets.

### ⚙️ Settings
5 languages, 6 themes, acrylic window, local preferences.

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

## ⬇️ Installation

### Pre-built release (recommended)

1. Download [`SHOK-v1.2.1-win.zip`](https://github.com/kiurakku/shok-monitor/releases/latest) from [Releases](https://github.com/kiurakku/shok-monitor/releases)
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

Within seconds you'll see live metrics, containers, and networks. Open **Databases** → **Find on server** to auto-detect PostgreSQL, Redis, SQLite files, and more.

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
                         ┌──────────┴──────────┐
                         │   Linux Server(s)   │
                         │ /proc · docker · db │
                         └─────────────────────┘
```

- **One persistent SSH connection** per host (multiplexing), separate channels per task
- Metrics: single script per poll (`/proc/stat`, `free`, `df`, `docker ps/stats`); CPU delta in one SSH round-trip
- Databases: SSH port-forward to local drivers (pg, mysql2, ioredis, mongodb) or HTTP proxy for REST engines
- SQLite: file copied over SFTP → `sql.js` WASM locally

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
| Server list | `%APPDATA%\SHOK\config\hosts.json` |
| DB connections | `%APPDATA%\SHOK\config\` (local only) |
| Passwords | Stored in plain text — **use SSH keys** |

> ⚠️ **Use SSH keys instead of passwords** for better security.

---

## 📁 Project structure

```
shok-monitor/
├── electron/          # Electron main process
├── server/            # SSH engine, collector, DB drivers
│   ├── collector.js   # Metrics (fixed CPU parser)
│   ├── db.js          # DB connections & queries
│   └── engines.js     # Engine registry (39 engines)
├── src/
│   ├── pages/Database.tsx
│   └── lib/engines.ts
├── buildResources/    # App icon
└── .github/assets/    # Logo & social preview
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
