<div align="center">

<img src=".github/assets/logo.png" alt="SHOK" width="128" height="128" />

# SHOK

**Agentless Linux server & Docker monitoring over SSH**

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

[⬇️ Download v1.1.0](https://github.com/kiurakku/shok-monitor/releases/latest) · [🐛 Report a bug](https://github.com/kiurakku/shok-monitor/issues/new) · [📖 Quick start](#-quick-start)

</div>

---

## ✨ About

**SHOK** is a desktop app for monitoring Linux servers and Docker containers over SSH. Nothing is installed on remote machines — only SSH (port 22) is required.

| | |
|---|---|
| 🖥️ **Platform** | Windows 10/11 (ready-to-run `.exe`) |
| 🔌 **Connection** | SSH key or password |
| 🐳 **Docker** | Containers, networks, volumes, logs |
| 🌍 **Languages** | Ukrainian, English, Russian, Polish, Chinese |
| 🎨 **Themes** | 6 built-in color themes |
| 🔒 **Security** | Engine listens on `127.0.0.1` only |
| ⚡ **Lightweight** | No agents, no background services |

---

## 📸 Features

<table>
<tr>
<td width="50%">

### 📊 Fleet overview
All hosts on one screen — live CPU, RAM, and disk. Automatic warnings for overloads and container restart loops.

### 🖧 Host management
Add, edit, and test SSH connections. Supports `ed25519` / RSA keys.

### 📦 Docker containers
Start, stop, restart, remove. Live log streaming.

</td>
<td width="50%">

### 🌐 Networks & volumes
Full registry of `docker network` and `docker volume` on every host.

### 💻 Built-in terminal
Full SSH terminal (xterm.js) right inside the app window.

### ⚙️ Settings
Switch language and theme. Preferences are stored locally on your PC.

</td>
</tr>
</table>

---

## ⬇️ Installation

### Pre-built release (recommended)

1. Download [`SHOK-v1.1.0-win.zip`](https://github.com/kiurakku/shok-monitor/releases/latest) from [Releases](https://github.com/kiurakku/shok-monitor/releases)
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

Within a few seconds you'll see CPU/RAM/disk metrics, containers, networks, and volumes.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│           Electron (SHOK.exe)           │
│  ┌─────────────┐    ┌─────────────────┐  │
│  │  React UI   │◄──►│  Node.js Engine │  │
│  │  (Vite)     │ WS │  (127.0.0.1)    │  │
│  └─────────────┘    └────────┬────────┘  │
└──────────────────────────────┼───────────┘
                               │ SSH (port 22)
                    ┌──────────┴──────────┐
                    │   Linux Server(s)   │
                    │  /proc · docker ps  │
                    └─────────────────────┘
```

- **One persistent SSH connection** per host (multiplexing), separate channels per task
- Every N seconds a single script collects all metrics (`/proc/stat`, `free`, `df`, `docker ps/stats`)
- CPU is calculated as a delta between polls — minimal server load

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
- **Linux servers** with SSH; Docker is optional

---

## 🔐 Data & security

| What | Where |
|------|-------|
| Server list | `%APPDATA%\SHOK\config\hosts.json` |
| Passwords | Stored in plain text in `hosts.json` |

> ⚠️ **Use SSH keys instead of passwords** for better security.

---

## 📁 Project structure

```
shok-monitor/
├── electron/          # Electron main process
├── server/            # Node.js SSH engine + WebSocket
├── src/               # React UI (Vite + Tailwind)
├── buildResources/    # Build icon
├── public/            # Static assets
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
