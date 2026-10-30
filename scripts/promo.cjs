// LemonSees by Altumptic — промо-ролик із ЖИВОГО застосунку (демо-режим), без монтажу картинок.
//   1) npm run build && npm start            (двигун на :5199 роздає зібраний UI)
//   2) npx electron scripts/promo.cjs <out-dir> [url]
// Офскрін-вікно 1920×1080, сценарій керує справжнім UI, кадри йдуть у ffmpeg (H.264, 30 fps).
const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const OUT = path.resolve(process.argv[2] || "promo-out");
const BASE = process.argv[3] || "http://127.0.0.1:5199/";
const W = 1920;
const H = 1080;
const FPS = 30;
// Сповільнений час: реальне захоплення ~8–10 к/с, тож сцена йде в SLOW разів повільніше, а кадри маркуються віртуальним часом
const SLOW = Number(process.env.PROMO_SLOW || 4);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SLOW));
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.commandLine.appendSwitch("force-color-profile", "srgb");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    frame: false,
    backgroundColor: "#f4f2ea",
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.setContentSize(W, H);
  const wc = win.webContents;
  wc.setFrameRate(30);

  const settings = (theme) =>
    JSON.stringify({ v: 4, demo: true, theme, scale: 125, lang: "en", sidebar: true, effects: true, geoip: true, refreshSec: 0, notify: false, clock24: true, hostId: "h_web01", hiddenWidgets: [] });
  await wc.loadURL(BASE);
  await wc.executeJavaScript(`localStorage.setItem("shok.settings", ${JSON.stringify(settings("light"))}); true`);
  await wc.loadURL(BASE + "#/siem/overview");
  await realSleep(2500);
  const overlay = fs.readFileSync(path.join(__dirname, "promo-overlay.js"), "utf8");
  await wc.executeJavaScript(`window.__SLOW = ${SLOW}; true`);
  await wc.executeJavaScript(overlay + "; true");
  // Оверлей сам масштабує свої анімації на SLOW (без DevTools-дебагера — він дестабілізував офскрін-запис)
  let step = 0;
  const P = (code) => {
    step++;
    console.log(`step ${step}: ${code.slice(0, 70)}`);
    return wc.executeJavaScript(`(async () => { const p = window.__promo; ${code} })()`);
  };
  wc.on("render-process-gone", (_e, d) => console.log("RENDERER GONE", JSON.stringify(d)));
  wc.on("did-start-navigation", (_e, url, inPlace, isMain) => isMain && !inPlace && console.log("NAVIGATION", url));

  /* ---------------- Запис ---------------- */
  let latest = null;
  wc.beginFrameSubscription(false, (img) => {
    latest = img;
  });
  await realSleep(500);
  while (!latest) await realSleep(20);
  const SZ = latest.getSize();
  console.log(`capture ${SZ.width}x${SZ.height} -> ${W}x${H}`);
  const ff = spawn(process.env.FFMPEG || "ffmpeg", ["-y", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", `${SZ.width}x${SZ.height}`, "-r", String(FPS), "-i", "-", "-vf", `crop=${W}:${H}:0:0`, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "12", "-pix_fmt", "yuv420p", path.join(OUT, "capture.mkv")], { stdio: ["pipe", "ignore", "pipe"] });
  let ffErr = "";
  ff.stderr.on("data", (d) => (ffErr = (ffErr + d).slice(-4000)));
  let frames = 0;
  let written = 0;
  let recording = true;
  const t0 = Date.now();
  const marks = [];
  const pump = (async () => {
    while (recording) {
      const due = Math.floor(((Date.now() - t0) / 1000 / SLOW) * FPS);
      while (frames < due && latest) {
        const buf = latest.toBitmap();
        if (buf.length === SZ.width * SZ.height * 4) {
          if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
          written++;
        }
        frames++;
      }
      await realSleep(8);
    }
  })();
  const mark = (name) => marks.push({ name, t: (Date.now() - t0) / 1000 / SLOW });

  const finish = async () => {
    recording = false;
    await pump;
    try {
      wc.endFrameSubscription();
    } catch {}
    ff.stdin.end();
    await new Promise((r) => ff.on("close", r));
  };
  try {
  /* ---------------- Сценарій ---------------- */
  // 1. Відкриття: знак, назва
  mark("open");
  await P(`await p.card([p.MARK, '<div class="serif" style="font-size:92px">LemonSees</div>', '<div class="sans" style="font-size:28px;margin-top:14px">by <span class="clay" style="font-weight:600">Altumptic</span></div>'], { hold: 2200 })`);
  await P(`await p.hideCard()`);
  await P(`await p.card(['<div class="serif" style="font-size:76px">Your servers are talking.</div>', '<div class="sans" style="font-size:32px;margin-top:22px">Most security tools ask you to install something before they listen.</div>'], { hold: 2600 })`);
  await P(`await p.hideCard()`);
  await P(`await p.card(['<div class="serif" style="font-size:84px">LemonSees just <span class="clay">sees</span>.</div>', '<div class="sans" style="font-size:32px;margin-top:22px">Agentless security operations over plain SSH.</div>'], { hold: 2400 })`);
  await P(`await p.hideCard()`);

  // 2. Огляд — живий дашборд
  mark("overview");
  await P(`await p.caption("Agentless", "SSH is the agent. Nothing to install on your servers.")`);
  await P(`await p.move(1100, 520, 1200)`);
  await P(`await p.move(1450, 560, 1100)`);
  await sleep(600);
  await P(`await p.scroll(620, 2200)`);
  await P(`await p.move(900, 700, 1200)`);
  await P(`await p.move(1300, 690, 1500)`);
  await sleep(700);

  // 3. Палітра команд → MITRE
  mark("mitre");
  await P(`await p.scroll(0, 900)`);
  await P(`p.key("k", { ctrlKey: true })`);
  await sleep(500);
  await P(`await p.type("mitre", 140)`);
  await sleep(600);
  await P(`p.key("Enter")`);
  await sleep(1300);
  await P(`await p.caption("MITRE ATT&CK", "Every incident lands on the matrix, automatically.")`);
  await P(`await p.scroll(330, 1600)`);
  await P(`await p.moveTo("button", { text: "Brute Force", ms: 1300 })`);
  await sleep(500);
  await P(`await p.moveTo("button", { text: "Exploitation for Privilege Escalation", ms: 1100 })`);
  await sleep(900);

  // 4. Аналітика — Sankey, SLA
  mark("analytics");
  await P(`location.hash = "#/siem/analytics"`);
  await sleep(1400);
  await P(`await p.caption("SOC analytics", "Follow every alert from category to resolution.")`);
  await P(`await p.scroll(780, 2000)`);
  await P(`await p.move(760, 640, 1000)`);
  await P(`await p.move(1060, 700, 1300)`);
  await P(`await p.move(1350, 560, 1300)`);
  await sleep(1200);

  // 5. Приватність — Tor, kill switch
  mark("privacy");
  await P(`location.hash = "#/system/privacy"`);
  await sleep(1400);
  await P(`window.scrollTo(0,0)`);
  await P(`await p.caption("Privacy by design", "Route through Tor or a proxy. Servers never see your IP.")`);
  await P(`await p.click("button", { text: "Tor", ms: 1200 })`);
  await sleep(500);
  await P(`await p.click("button", { text: "Which IP do servers see?", ms: 1300 })`);
  await sleep(1600);
  await P(`await p.moveTo("*", { text: "Kill switch", ms: 1200 })`);
  await sleep(1300);

  // 6. Тема Graphite
  mark("dark");
  await P(`location.hash = "#/siem/overview"`);
  await sleep(900);
  await P(`await p.hideCaption()`);
  await P(`await p.click("button[title='Dark theme']", { ms: 1100 })`);
  await sleep(900);
  await P(`await p.caption("Ivory or Graphite", "Calm enough for a long shift.", true)`);
  await P(`await p.move(1200, 600, 1500)`);
  await sleep(1800);
  await P(`await p.hideCaption()`);

  // 7. Фінал
  mark("end");
  await P(`await p.card([p.MARK, '<div class="serif" style="font-size:96px">LemonSees</div>', '<div class="sans" style="font-size:34px;margin-top:18px">The calm, agentless SOC.</div>'], { hold: 600 })`);
  await P(`await p.addLine('<div class="sans" style="font-size:24px;margin-top:40px">Web · Windows portable · Linux AppImage &nbsp;·&nbsp; Signed, attested releases</div>', 500)`);
  await P(`await p.addLine('<div class="sans" style="font-size:24px;margin-top:16px">by <span class="clay" style="font-weight:600">Altumptic</span> &nbsp;·&nbsp; github.com/Altumptic/LemonSees</div>', 700)`);
  await sleep(4200);

  } catch (e) {
    console.log("SCENARIO ERROR at step", step, e.message);
  }
  /* ---------------- Завершення ---------------- */
  await finish();
  fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify({ frames, seconds: frames / FPS, marks }, null, 2));
  console.log(`PROMO frames=${frames} written=${written} seconds=${(frames / FPS).toFixed(1)}`);
  if (written < frames) console.log(ffErr);
}

app.whenReady().then(async () => {
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
  app.quit();
});
