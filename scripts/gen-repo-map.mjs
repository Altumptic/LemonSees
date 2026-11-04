// Генерує docs/ai/REPO_MAP.md: файл → однорядковий опис (перший коментар/doc-рядок) + розмір.
// `node scripts/gen-repo-map.mjs --check` — падає, якщо карта застаріла (використовується в CI).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const OUT = "docs/ai/REPO_MAP.md";
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n").filter(Boolean)
  .filter((f) => /^(server|src|electron|core\/[^/]+\/(src|Cargo)|scripts|bench|test|docs|\.github\/workflows)[/.]/.test(f) || /^[A-Z]+\.md$|^package\.json$/.test(f))
  .filter((f) => !f.startsWith("docs/ai/") && !/\.(wasm|sha256|lock|png|svg|ico)$/.test(f))
  .sort();

function describe(f) {
  let t;
  try { t = readFileSync(f, "utf8"); } catch { return ""; }
  for (const raw of t.split("\n").slice(0, 12)) {
    const l = raw.trim();
    const m = /^(?:\/\/[/!]?|\/\*+|\*|#|\/\/!)\s?(.*)$/.exec(l);
    if (m && m[1].trim() && !/^(eslint|@ts|!\/)/.test(m[1])) return m[1].replace(/\*\/$/, "").trim().slice(0, 140);
    if (/^#\s+/.test(l)) return l.replace(/^#+\s+/, "").slice(0, 140);
  }
  return "";
}

const rows = files.map((f) => `| \`${f}\` | ${describe(f).replace(/\|/g, "/")} |`);
const body = `# Repo map (generated — do not edit)

Regenerate: \`npm run docs:map\`. CI fails if this file is stale. For meaning and invariants read [AGENTS.md](../../AGENTS.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).

| File | What it is |
|---|---|
${rows.join("\n")}
`;
if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== body) { console.error("docs/ai/REPO_MAP.md is stale: run `npm run docs:map`"); process.exit(1); }
  console.log("repo map is up to date");
} else {
  writeFileSync(OUT, body);
  console.log(`wrote ${OUT} (${files.length} files)`);
}
