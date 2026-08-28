// LemonSees — десктопна SOC-оболонка. Двигун (Express + SSH) живе в цьому ж процесі:
// закрив вікно — все зупинилось.
import { app, BrowserWindow, Menu, shell, Notification } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5199;

// Одна копія програми
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let win = null;

  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  process.env.SHOK_NO_OPEN = "1";
  process.env.SHOK_PORT = String(PORT);
  // Конфіг хостів — у профілі користувача (переживає оновлення програми)
  const configDir = path.join(app.getPath("userData"), "config");
  process.env.SHOK_CONFIG_DIR = configDir;

  // Міграція конфігу зі старого імені (ШОК → LemonSees), щоб не втратити хости
  try {
    if (!fs.existsSync(path.join(configDir, "hosts.json"))) {
      const roaming = app.getPath("appData");
      for (const oldName of ["shok-monitor", "SHOK"]) {
        const oldDir = path.join(roaming, oldName, "config");
        if (fs.existsSync(path.join(oldDir, "hosts.json"))) {
          fs.mkdirSync(configDir, { recursive: true });
          for (const f of fs.readdirSync(oldDir)) {
            try { fs.copyFileSync(path.join(oldDir, f), path.join(configDir, f)); } catch { /* ignore */ }
          }
          break;
        }
      }
    }
  } catch { /* ignore */ }

  // Desktop-сповіщення (двигун викликає при даунтаймі моніторів)
  globalThis.__lemonNotify = (title, body) => {
    try {
      if (Notification.isSupported()) new Notification({ title: String(title), body: String(body) }).show();
    } catch { /* ignore */ }
  };

  async function waitForServer(url, tries = 60) {
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url);
        if (r.ok) return true;
      } catch {
        /* ще не піднявся */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }

  async function createWindow() {
    // Стартуємо двигун у цьому ж процесі
    await import("../server/index.js");
    await waitForServer(`http://127.0.0.1:${PORT}/api/state`);

    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
      width: 1480,
      height: 920,
      minWidth: 980,
      minHeight: 640,
      show: false,
      // Прозорий фон вікна + акриловий матеріал Windows 11 — «скляний» блюр робочого столу.
      // Поки в застосунку не ввімкнено скляний режим, тіло непрозоре й вікно виглядає звично.
      backgroundColor: "#00000000",
      backgroundMaterial: "acrylic",
      title: "LemonSees — SOC Platform",
      icon: path.join(__dirname, "..", "buildResources", "icon.png"),
      autoHideMenuBar: true,
      // Ховаємо системний заголовок — лишаються тільки темні кнопки вікна
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#00000000", symbolColor: "#e8e6df", height: 42 },
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    // Одразу на весь екран
    win.maximize();
    win.show();

    // Зовнішні посилання — у системний браузер
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });

    win.loadURL(`http://127.0.0.1:${PORT}`);
    win.on("closed", () => (win = null));
  }

  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}
