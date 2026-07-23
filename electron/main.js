// ШОК — десктопна оболонка. Двигун (Express + SSH) живе в цьому ж процесі:
// закрив вікно — все зупинилось.
import { app, BrowserWindow, Menu, shell } from "electron";
import path from "node:path";
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
  process.env.SHOK_CONFIG_DIR = path.join(app.getPath("userData"), "config");

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
      backgroundColor: "#101014",
      title: "ШОК — Моніторинг серверів",
      icon: path.join(__dirname, "..", "buildResources", "icon.png"),
      autoHideMenuBar: true,
      // Ховаємо системний заголовок — лишаються тільки темні кнопки вікна,
      // верхня панель програми стає суцільною
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#101014", symbolColor: "#e8e6df", height: 42 },
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
