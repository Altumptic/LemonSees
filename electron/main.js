// LemonSees by Altumptic — десктопна SOC-оболонка для Windows і Linux.
// Двигун (Express + SSH) живе в цьому ж процесі: закрив вікно — все зупинилось.
// Портативний режим: дані лежать поруч із LemonSees-*-portable.exe / AppImage у теці LemonSees-data.
import { app, BrowserWindow, Menu, shell, Notification, safeStorage } from "electron";
import crypto from "node:crypto";
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
  app.setAppUserModelId("com.altumptic.lemonsees");

  // Де зберігати конфіг: поруч із портативним exe/AppImage (якщо можна писати),
  // інакше — у профілі користувача (переживає оновлення програми).
  function resolveConfigDir() {
    const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR || (process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : "");
    if (portableRoot) {
      const dir = path.join(portableRoot, "LemonSees-data");
      // AppImage — лише якщо теку створено свідомо; portable.exe — завжди
      if (process.env.PORTABLE_EXECUTABLE_DIR || fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          fs.accessSync(dir, fs.constants.W_OK);
          return dir;
        } catch {
          /* немає прав — падаємо назад у профіль */
        }
      }
    }
    return path.join(app.getPath("userData"), "config");
  }
  const configDir = resolveConfigDir();
  const portable = !configDir.startsWith(app.getPath("userData"));

  // Ключ сховища секретів, захищений ОС (DPAPI / Keychain / libsecret).
  // Портативний режим лишає файл-ключ поруч із даними, щоб теку можна було перенести на інший ПК.
  function useOsVault() {
    try {
      if (portable || process.env.LEMONSEES_MASTER_KEY || !safeStorage.isEncryptionAvailable()) return;
      const sealed = path.join(configDir, "vault.key.os");
      const legacy = path.join(configDir, ".vault.key");
      let hex;
      if (fs.existsSync(sealed)) {
        hex = safeStorage.decryptString(fs.readFileSync(sealed));
      } else {
        hex = fs.existsSync(legacy) ? fs.readFileSync(legacy).toString("hex") : crypto.randomBytes(32).toString("hex");
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(sealed, safeStorage.encryptString(hex));
        if (fs.existsSync(legacy)) fs.rmSync(legacy);
      }
      process.env.LEMONSEES_VAULT_KEY = hex;
    } catch {
      /* лишаємо файл-ключ */
    }
  }
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
    useOsVault();
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
      backgroundColor: process.platform === "win32" ? "#00000000" : "#faf9f5",
      ...(process.platform === "win32" ? { backgroundMaterial: "acrylic" } : {}),
      title: "LemonSees — by Altumptic",
      icon: path.join(__dirname, "..", "buildResources", "icon.png"),
      autoHideMenuBar: true,
      // Ховаємо системний заголовок — нейтральні кнопки вікна читаються на обох темах
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#00000000", symbolColor: "#8a877d", height: 60 },
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false },
    });
    // Одразу на весь екран
    win.maximize();
    win.show();

    // PSB §5.2: мінімум дозволів ОС — лише сповіщення та запис у буфер обміну
    const ALLOWED_PERMISSIONS = new Set(["notifications", "clipboard-sanitized-write"]);
    win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED_PERMISSIONS.has(permission)));
    win.webContents.session.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));

    // Навігація лише в межах локального двигуна; зовнішні https-посилання — у системний браузер
    const ORIGIN = `http://127.0.0.1:${PORT}`;
    win.webContents.on("will-navigate", (e, url) => {
      if (!url.startsWith(ORIGIN)) e.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });

    win.loadURL(`http://127.0.0.1:${PORT}`);
    win.on("closed", () => (win = null));
  }

  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}
