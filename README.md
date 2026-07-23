<div align="center">

<img src=".github/assets/logo.png" alt="ШОК" width="128" height="128" />

# ШОК

**Моніторинг Linux-серверів і Docker по SSH — без агентів**

[![Release](https://img.shields.io/github/v/release/4am-png/shok-monitor?style=for-the-badge&logo=github&logoColor=white)](https://github.com/4am-png/shok-monitor/releases)
[![License](https://img.shields.io/github/license/4am-png/shok-monitor?style=for-the-badge&color=blue)](LICENSE)
[![Platform](https://img.shields.io/badge/Windows-10%2F11-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/4am-png/shok-monitor/releases)
[![Electron](https://img.shields.io/badge/Electron-43-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

[![Downloads](https://img.shields.io/github/downloads/4am-png/shok-monitor/total?style=flat-square&logo=github)](https://github.com/4am-png/shok-monitor/releases)
[![Stars](https://img.shields.io/github/stars/4am-png/shok-monitor?style=flat-square&logo=github)](https://github.com/4am-png/shok-monitor/stargazers)
[![Issues](https://img.shields.io/github/issues/4am-png/shok-monitor?style=flat-square&logo=github)](https://github.com/4am-png/shok-monitor/issues)
[![Last commit](https://img.shields.io/github/last-commit/4am-png/shok-monitor?style=flat-square&logo=github)](https://github.com/4am-png/shok-monitor/commits/main)

[⬇️ Завантажити v1.0.0](https://github.com/4am-png/shok-monitor/releases/latest) · [🐛 Повідомити про баг](https://github.com/4am-png/shok-monitor/issues/new) · [📖 Документація](#-швидкий-старт)

</div>

---

## ✨ Про проєкт

**ШОК** — десктопна програма для моніторингу Linux-серверів і Docker-контейнерів через SSH. На віддалені машини **нічого не встановлюється** — потрібен лише SSH (порт 22).

| | |
|---|---|
| 🖥️ **Платформа** | Windows 10/11 (готовий `.exe`) |
| 🔌 **Підключення** | SSH-ключ або пароль |
| 🐳 **Docker** | Контейнери, мережі, томи, логи |
| 🔒 **Безпека** | Двигун слухає лише `127.0.0.1` |
| ⚡ **Легкість** | Без агентів, без фонових служб |

---

## 📸 Можливості

<table>
<tr>
<td width="50%">

### 📊 Огляд флоту
Всі хости на одному екрані — CPU, RAM, диск наживо. Автоматичні попередження при перевантаженні або рестарт-циклах контейнерів.

### 🖧 Управління хостами
Додавання, редагування, перевірка SSH-з'єднання. Підтримка ключів `ed25519` / RSA.

### 📦 Docker-контейнери
Старт, стоп, рестарт, видалення. Перегляд логів у реальному часі.

</td>
<td width="50%">

### 🌐 Мережі та томи
Повний реєстр `docker network` і `docker volume` на кожному хості.

### 💻 Вбудований термінал
Повноцінний SSH-термінал (xterm.js) прямо у вікні програми.

### 🔄 Ефективний збір метрик
Один SSH-канал, multiplexing, дельта `/proc/stat` — мінімальне навантаження на сервер.

</td>
</tr>
</table>

---

## ⬇️ Встановлення

### Готовий білд (рекомендовано)

1. Завантаж [`SHOK-v1.0.0-win.zip`](https://github.com/4am-png/shok-monitor/releases/latest) з [Releases](https://github.com/4am-png/shok-monitor/releases)
2. Розпакуй архів
3. Запусти `SHOK.exe`

> Закрив вікно — все зупинилось. Жодних фонових служб.

### З вихідного коду

```bash
git clone https://github.com/4am-png/shok-monitor.git
cd shok-monitor
npm install
npm run build
npm run dist:win    # → release/win-unpacked/SHOK.exe
```

---

## 🚀 Швидкий старт

1. Запусти **ШОК**
2. Перейди в **Хости → Додати хост**
3. Вкажи IP, користувача та спосіб входу:
   - **SSH-ключ** *(рекомендовано)*: `C:\Users\User\.ssh\id_ed25519`
   - **Пароль**: звичайний SSH-пароль
4. Натисни **«Перевірити з'єднання»** → **«Додати»**

Через кілька секунд з'являться метрики CPU/RAM/диску, контейнери, мережі й томи.

---

## 🏗️ Архітектура

```
┌─────────────────────────────────────────┐
│           Electron (SHOK.exe)           │
│  ┌─────────────┐    ┌─────────────────┐  │
│  │  React UI   │◄──►│  Node.js Engine │  │
│  │  (Vite)     │ WS │  (127.0.0.1)    │  │
│  └─────────────┘    └────────┬────────┘  │
└──────────────────────────────┼───────────┘
                               │ SSH (порт 22)
                    ┌──────────┴──────────┐
                    │   Linux Server(s)   │
                    │  /proc · docker ps  │
                    └─────────────────────┘
```

- **Одне тривале SSH-з'єднання** на хост (multiplexing), окремі канали під задачі
- Кожні N секунд один скрипт збирає всі метрики (`/proc/stat`, `free`, `df`, `docker ps/stats`)
- CPU рахується як дельта між опитуваннями — без зайвого навантаження

---

## 🛠️ Розробка

| Команда | Опис |
|---------|------|
| `npm run dev` | Фронтенд з HMR (потрібен запущений `server`) |
| `npm run server` | Двигун окремо, відкриє браузер |
| `npm run app` | Electron у dev-режимі |
| `npm run build` | Збірка фронтенду → `dist/` |
| `npm run dist:win` | Збірка `SHOK.exe` → `release/win-unpacked/` |

`ШОК.bat` — запасний запуск через браузер без Electron.

### Вимоги

- **Windows 10/11** (готовий exe нічого не потребує)
- **Node.js 18+** (для розробки)
- **Linux-сервери** з SSH; Docker — опційно

---

## 🔐 Дані та безпека

| Що | Де |
|----|-----|
| Список серверів | `%APPDATA%\SHOK\config\hosts.json` |
| Паролі | У `hosts.json` відкритим текстом |

> ⚠️ **Для безпеки використовуй SSH-ключі**, а не паролі.

---

## 📁 Структура проєкту

```
shok-monitor/
├── electron/          # Electron main process
├── server/            # Node.js SSH engine + WebSocket
├── src/               # React UI (Vite + Tailwind)
├── buildResources/    # Іконка для збірки
├── public/            # Статичні ресурси
└── .github/assets/    # Лого та social preview
```

---

## 🤝 Внесок

Issues і Pull Requests вітаються! Перед великими змінами — створи issue для обговорення.

---

<div align="center">

**Зроблено з ⚡ для тих, хто любить простий моніторинг без зайвого**

MIT © [4am-png](https://github.com/4am-png)

</div>
