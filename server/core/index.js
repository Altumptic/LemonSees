// Фасад Rust-ядра (WebAssembly). Усі гарячі шляхи (аналіз auth-журналів, правила, FIM-diff) викликаються звідси.
// Ядро — необовʼязкове: якщо .wasm відсутній або зламаний, available() === false і виклики повертають null —
// тоді виклична сторона використовує старий (повільніший) шлях. Нічого не ламається, лише втрачається швидкодія.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WASM = join(dirname(fileURLToPath(import.meta.url)), "lemonsees_core.wasm");
const OP = { auth: 1, rules: 2, fim: 3, info: 4, selftest: 5 };
const enc = new TextEncoder();
const dec = new TextDecoder();

let mod = null; // WebAssembly.Module
let inst = null;
let meta = { backend: "none", version: null, sha256: null, reason: null };

function load() {
  if (process.env.LEMONSEES_CORE === "off") {
    meta = { ...meta, reason: "disabled by LEMONSEES_CORE=off" };
    return;
  }
  try {
    if (!existsSync(WASM)) throw new Error("lemonsees_core.wasm not built (npm run build:core)");
    const bytes = readFileSync(WASM);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    mod = new WebAssembly.Module(bytes);
    instantiate();
    const st = call(OP.selftest, {}, "");
    if (!st.ok || !st.data?.ok) throw new Error("selftest failed");
    const info = call(OP.info, {}, "");
    meta = { backend: "wasm", version: info.data?.version ?? null, sha256, reason: null };
  } catch (e) {
    mod = inst = null;
    meta = { backend: "none", version: null, sha256: null, reason: String(e?.message || e) };
  }
}

function instantiate() {
  inst = new WebAssembly.Instance(mod, {});
}

// Один виклик: пишемо вхід у памʼять модуля, викликаємо, читаємо JSON, звільняємо буфери.
function call(op, params, text) {
  const x = inst.exports;
  const a = enc.encode(JSON.stringify(params));
  const b = typeof text === "string" ? enc.encode(text) : text;
  let ap = 0, bp = 0;
  try {
    ap = x.ls_alloc(a.length);
    new Uint8Array(x.memory.buffer, ap, a.length).set(a);
    if (b.length) {
      bp = x.ls_alloc(b.length);
      new Uint8Array(x.memory.buffer, bp, b.length).set(b);
    }
    const status = x.ls_call(op, ap, a.length, bp, b.length);
    const out = new Uint8Array(x.memory.buffer, x.ls_out_ptr(), x.ls_out_len());
    const data = JSON.parse(dec.decode(out));
    return { ok: status === 0, status, data };
  } finally {
    if (ap) x.ls_free(ap, a.length);
    if (bp) x.ls_free(bp, b.length);
  }
}

function run(op, params, text = "") {
  if (!inst) return null;
  try {
    return call(op, params, text);
  } catch (e) {
    // trap у WASM (OOM, panic=abort) → екземпляр у невизначеному стані: створюємо новий і даємо виклику шанс впасти на резервний шлях
    try {
      instantiate();
    } catch {
      inst = null;
    }
    console.warn("[core] trap:", String(e?.message || e));
    return null;
  }
}

load();

export const core = {
  available: () => meta.backend === "wasm" && !!inst,
  info: () => ({ ...meta }),
  /** Аналіз auth-журналу. Повертає звіт або null (ядро недоступне). */
  auth(text, opts = {}) {
    const r = run(OP.auth, opts, text);
    return r?.ok ? r.data : null;
  },
  /** Правила → { results, lines, truncated } | { error:{rule_id,message} } | null. */
  rules(text, rules, opts = {}) {
    const r = run(OP.rules, { rules, ...opts }, text);
    if (!r) return null;
    return r.ok ? r.data : r.status === 3 ? { error: r.data } : null;
  },
  /** FIM-diff. */
  fim(input) {
    const r = run(OP.fim, input, "");
    return r?.ok ? r.data : null;
  },
};
