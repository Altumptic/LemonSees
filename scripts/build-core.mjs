// Збірка Rust-ядра у WebAssembly → server/core/lemonsees_core.wasm (+ .sha256).
// Потрібно: rustup toolchain з core/rust-toolchain.toml (target wasm32-unknown-unknown).
// Якщо шлях до репозиторію містить пробіли/кирилицю і лінкер (mingw) скаржиться — задайте ASCII-каталог: LS_CORE_TARGET_DIR=D:/rust/ls-target
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = join(root, "core");
const target = process.env.LS_CORE_TARGET_DIR || process.env.CARGO_TARGET_DIR || join(coreDir, "target");
const optional = process.argv.includes("--optional");

const r = spawnSync("cargo", ["build", "--release", "--locked", "--target", "wasm32-unknown-unknown", "-p", "lemonsees-wasm"], {
  cwd: coreDir,
  stdio: "inherit",
  env: { ...process.env, CARGO_TARGET_DIR: target },
  shell: process.platform === "win32",
});
if (r.status !== 0) {
  if (optional) {
    console.warn("[build-core] Rust недоступний або збірка не вдалась — сервер працюватиме без ядра (резервний шлях). Це не помилка.");
    process.exit(0);
  }
  process.exit(r.status ?? 1);
}
const out = join(target, "wasm32-unknown-unknown", "release", "lemonsees_wasm.wasm");
const dest = join(root, "server", "core", "lemonsees_core.wasm");
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(out, dest);
const sha = createHash("sha256").update(readFileSync(dest)).digest("hex");
writeFileSync(dest + ".sha256", sha + "\n");
console.log(`[build-core] ${dest} (${(statSync(dest).size / 1024).toFixed(0)} KiB) sha256=${sha}`);
