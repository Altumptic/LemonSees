// Імпорт хостів з ~/.ssh/config (лише читання, лише на запит аналітика).
//
// Що робить: розбирає файл конфігурації OpenSSH тієї машини, де працює LemonSees, і пропонує список хостів з їхнім User, Port,
// HostName та ключем. Самі хости додаються звичайним POST /api/hosts з його валідацією — тут нічого не записується.
//
// Принципи безпеки:
//   * шлях фіксований (~/.ssh/config), клієнт не може вказати інший файл;
//   * вміст приватних ключів НЕ читається: для IdentityFile робиться лише stat (чи є файл);
//   * розмір файлу, кількість рядків і записів обмежені; шаблони порівнюються без регулярних виразів;
//   * що не підтримується (Include, Match, ProxyCommand, підстановки %-токенів) не імпортується мовчки, а позначається.
//
// Семантика OpenSSH, яку ми відтворюємо: для кожного параметра діє ПЕРШЕ знайдене значення; блок `Host` застосовується,
// якщо аліас збігається з одним із його шаблонів (`*`, `?`) і не збігається з жодним шаблоном-запереченням (`!шаблон`).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MAX_BYTES = 1024 * 1024;
export const MAX_LINES = 20_000;
export const MAX_ENTRIES = 500;
const DEFAULT_KEYS = ["id_ed25519", "id_ecdsa", "id_rsa"];

/** Розбиття значення на аргументи з урахуванням лапок. */
function splitArgs(s) {
  const out = [];
  let cur = "";
  let q = false;
  let had = false;
  for (const ch of s) {
    if (ch === '"') {
      q = !q;
      had = true;
    } else if (!q && /\s/.test(ch)) {
      if (cur || had) out.push(cur);
      cur = "";
      had = false;
    } else cur += ch;
  }
  if (cur || had) out.push(cur);
  return out;
}

/** Порівняння шаблону з `*` та `?` без регулярних виразів (ітеративно, без експоненційного відкату). */
function wild(pat, s) {
  pat = pat.toLowerCase();
  s = s.toLowerCase();
  let p = 0;
  let i = 0;
  let star = -1;
  let mark = 0;
  while (i < s.length) {
    if (p < pat.length && (pat[p] === "?" || pat[p] === s[i])) {
      p++;
      i++;
    } else if (p < pat.length && pat[p] === "*") {
      star = p++;
      mark = i;
    } else if (star >= 0) {
      p = star + 1;
      i = ++mark;
    } else return false;
  }
  while (p < pat.length && pat[p] === "*") p++;
  return p === pat.length;
}

/** Чи застосовується блок `Host` із цими шаблонами до аліасу (OpenSSH: заперечення перемагає). */
function applies(patterns, alias) {
  let hit = false;
  for (const raw of patterns) {
    const neg = raw.startsWith("!");
    const pat = neg ? raw.slice(1) : raw;
    if (pat.length > 255) continue;
    if (wild(pat, alias)) {
      if (neg) return false;
      hit = true;
    }
  }
  return hit;
}

const isConcrete = (a) => a.length > 0 && a.length <= 255 && !/[*?!]/.test(a) && !/\s/.test(a);

/**
 * Розбирає текст конфігурації. `ctx`: { home, user, exists(path) } — підставляються в тестах.
 * Повертає { entries, skipped, warnings }.
 */
export function parseSshConfig(text, ctx = {}) {
  const home = ctx.home ?? os.homedir();
  const localUser = ctx.user ?? safeUser();
  const exists = ctx.exists ?? ((p) => {
    try {
      return fs.statSync(p).isFile(); // лише stat: вміст ключа не читаємо
    } catch {
      return false;
    }
  });

  const warnings = new Set();
  // Блоки в порядку появи. Перший блок — "глобальний" (до першого Host): діє на всіх.
  const blocks = [{ patterns: ["*"], opts: {} }];
  let cur = blocks[0];
  let skipping = false; // всередині Match: його умови ми не обчислюємо, тож параметри ігноруються
  const aliases = [];

  const lines = String(text).split(/\r?\n/).slice(0, MAX_LINES);
  for (const raw of lines) {
    if (raw.length > 4096) continue; // жоден рядок не повинен навантажувати розбір
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^([A-Za-z][A-Za-z0-9]*)(?:\s*=\s*|\s+)(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const args = splitArgs(m[2].trim());

    if (key === "host") {
      skipping = false;
      cur = { patterns: args, opts: {} };
      blocks.push(cur);
      for (const a of args) if (isConcrete(a) && !aliases.includes(a)) aliases.push(a);
    } else if (key === "match") {
      skipping = true;
      warnings.add("Match blocks are not evaluated; hosts that depend on them may be incomplete.");
    } else if (key === "include") {
      warnings.add("Include is not followed; only ~/.ssh/config itself is read.");
    } else if (!skipping && args.length && !(key in cur.opts)) {
      cur.opts[key] = key === "identityfile" ? args[0] : args.join(" ");
    }
  }

  // Ефективні параметри аліасу: перше значення з усіх блоків, що застосовуються, у порядку файлу
  const effective = (alias) => {
    const o = {};
    for (const b of blocks) {
      if (!applies(b.patterns, alias)) continue;
      for (const [k, v] of Object.entries(b.opts)) if (!(k in o)) o[k] = v;
    }
    return o;
  };

  const expand = (p) => (p.startsWith("~/") ? path.join(home, p.slice(2)) : p === "~" ? home : p.replace(/%d/g, home));

  const entries = [];
  let skipped = 0;
  for (const alias of aliases) {
    if (entries.length >= MAX_ENTRIES) {
      warnings.add(`Only the first ${MAX_ENTRIES} hosts are listed.`);
      break;
    }
    const o = effective(alias);
    let host = (o.hostname ?? alias).replace(/%%/g, "\0").replace(/%h/g, alias).replace(/\0/g, "%");
    const reasons = [];
    if (/%/.test(host)) reasons.push("HostName uses a substitution that LemonSees does not expand");
    if (host.length > 255 || /\s/.test(host)) reasons.push("HostName is not a valid address");
    const port = parseInt(o.port, 10);
    const portOk = Number.isInteger(port) && port >= 1 && port <= 65535;
    if (o.port !== undefined && !portOk) reasons.push("Port is not a valid number");

    // Ключ: IdentityFile із конфігу, інакше стандартні ключі в ~/.ssh (як робить ssh)
    let keyPath = "";
    let keySource = "none";
    if (o.identityfile) {
      keyPath = expand(o.identityfile);
      keySource = "config";
      if (!path.isAbsolute(keyPath)) reasons.push("IdentityFile is not an absolute path");
    } else {
      for (const k of DEFAULT_KEYS) {
        const p = path.join(home, ".ssh", k);
        if (exists(p)) {
          keyPath = p;
          keySource = "default";
          break;
        }
      }
    }
    const keyExists = keyPath ? exists(keyPath) : false;
    if (!keyPath) reasons.push("No key found: add IdentityFile or place a key in ~/.ssh");
    else if (!keyExists) reasons.push("The key file does not exist");
    if (o.proxycommand) reasons.push("ProxyCommand is not supported");

    entries.push({
      alias,
      host: host.slice(0, 255),
      user: (o.user ?? localUser).slice(0, 64),
      userSource: o.user ? "config" : "local",
      port: portOk ? port : 22,
      keyPath: keyPath.slice(0, 500),
      keySource,
      keyExists,
      proxyJump: o.proxyjump ? o.proxyjump.slice(0, 255) : "",
      ready: reasons.length === 0,
      reasons,
    });
  }
  skipped = [...new Set(blocks.flatMap((b) => b.patterns))].filter((p) => !isConcrete(p) && p !== "*").length;
  return { entries, skipped, warnings: [...warnings] };
}

function safeUser() {
  try {
    return os.userInfo().username || "root";
  } catch {
    return "root";
  }
}

/** Читає ~/.ssh/config цієї машини. Шлях фіксований; ніколи не кидає. */
export function readSshConfig(ctx = {}) {
  const home = ctx.home ?? os.homedir();
  const file = path.join(home, ".ssh", "config");
  const base = { path: "~/.ssh/config", found: false, entries: [], skipped: 0, warnings: [] };
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return base;
  }
  if (!st.isFile()) return base;
  if (st.size > MAX_BYTES) return { ...base, found: true, warnings: [`The file is larger than ${MAX_BYTES / 1024} KiB and was not read.`] };
  try {
    return { ...base, found: true, ...parseSshConfig(fs.readFileSync(file, "utf8"), { ...ctx, home }) };
  } catch {
    return { ...base, found: true, warnings: ["The file could not be read."] };
  }
}
