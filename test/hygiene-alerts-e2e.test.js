// Наскрізно: скан → порівняння з попереднім → інциденти, з планувальником. Справжнє Rust-ядро, фейковий SSH-хост, фейковий Express.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SHOK_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ls-hygalerts-cfg-"));
const { core } = await import("../server/core/index.js");
const { mountHygiene } = await import("../server/hygiene.js");
const { saveSoc, loadHygiene, saveHygiene } = await import("../server/config.js");
const have = core.available();

// Реальні публічні ключі (згенеровані ssh-keygen), як у test/hygiene.test.js
const ED = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOsaPnH+kDs2S8IZea60Y+gd2+FeoTvbpM+ECev87Q4g alice@laptop";
const ECDSA = "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBDPW7fodqxG5H2HDLpeq4YhvkOgUad3nxkxbSOlLG7OjRgFLxHhL/U+RrJ5INlM9SqrhHheDZnObyvKiUy5cY80= carol@ci";
const RSA1024 = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQDV4SEBmw/0d+fJs3/dt3d/YhyJBTZw2bqycX2J2RlJ43WJ7pPPmJSmTLHMsM4Mfu6eEFz57oY8w7ZQwK8c/Gli/7RYoBFRrrn177af4JQfBYVoaBiT1A71gd5JWOssvuFzV6b6lqqnAlVpk8BA817jBUpW+bJ5rsFaYMAKCxHtwQ== old@weak";
const RSA2048 = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCvjovJzCv/s/YAOxJyYcz8Jqw5tItZ1MzMah0fpnkGUs7yZw/RojA2WRLYO8nbb9NWCY7jhprOJUFaE+n+bfOjTwJ55x8qShMBjfZljgUUKmtQZI614uGpNtC0ar4KFaw8zw9FNJyTw8oKJkjzdpFmIukNPGxV980+Hd3n/9dZhbsZY+PvDaV9HIOEqIm2mqSqRww8yoXgsvLnBCyUnfEGCc9Ccb8Vw8+Gkfrawcr7JxFW9ae+Lb9qDk0j5cupmlLBke+emAfFyVCZZou4POMKvliycu4gDzRE9GmHZuoY2ayavHt2uEL2KfJYGrdginBGROxTBPZvyJhJHMC5C8eT bob@work";

const NOW = 1_793_780_101;
const SETTINGS = (over = {}) => ({ permitrootlogin: "no", passwordauthentication: "no", permitemptypasswords: "no", maxauthtries: "4", ...over });

/** Один «сервер»: його стан змінюють тести, а exec повертає вивід так, як це зробили б справжні скрипти. */
function makeHost() {
  const state = { keys: { alice: [ED] }, settings: SETTINGS(), ready: true };
  const conn = {
    get ready() {
      return state.ready;
    },
    async exec(cmd) {
      const n = /@@NOW:([0-9a-f]+)@@/.exec(cmd)[1];
      if (cmd.includes("@@KEYS:")) {
        const files = Object.entries(state.keys).flatMap(([user, ks]) => [`@@FILE:${n}@@\t${user}\t/home/${user}/.ssh/authorized_keys`, ...ks, "", `@@ENDFILE:${n}@@`]);
        const sshd = Object.entries(state.settings).map(([k, v]) => `${k} ${v}`);
        return { code: 0, stderr: "", stdout: [`@@NOW:${n}@@ ${NOW} +0200`, `@@SSHD:${n}@@`, "SOURCE sshd -T", ...sshd, `@@KEYS:${n}@@`, ...files, `@@END:${n}@@`, ""].join("\n") };
      }
      return { code: 0, stderr: "", stdout: [`@@NOW:${n}@@ ${NOW} +0200`, `@@OLDEST:${n}@@`, "2025-01-01T00:00:00+0000 h sshd[1]: x", `@@USAGE:${n}@@`, "", `@@END:${n}@@`, ""].join("\n") };
    },
  };
  return { state, conn };
}

function harness() {
  // Кожен тест починає без попереднього скану й без списку очікуваних ключів: теку конфігурації тести ділять між собою,
  // і без скидання «базовий» скан порівнювався б із залишками попереднього тесту
  saveHygiene({});
  const { state, conn } = makeHost();
  const routes = {};
  const app = { get: (p, h) => (routes[`GET ${p}`] = h), post: (p, h) => (routes[`POST ${p}`] = h), put: (p, h) => (routes[`PUT ${p}`] = h) };
  const raised = [];
  const audit = [];
  const api = mountHygiene(app, {
    hosts: () => [{ id: "a", name: "web-01" }],
    conns: new Map([["a", conn]]),
    audit: (action, target, meta) => audit.push({ action, target, meta }),
    version: "t",
    addIncident: (spec) => raised.push({ ...spec, status: "open", createdAt: Date.now() }),
    incidents: () => raised,
  });
  const call = async (method, p, body = {}) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await routes[`${method} ${p}`]({ body, query: {} }, res);
    return res;
  };
  return { state, raised, audit, api, call, scan: () => call("POST", "/api/hygiene/scan") };
}

const soc = (over = {}) => saveSoc({ autoIncidents: true, bruteThreshold: 300, hygieneHours: 24, ...over });

test("the first scan is a baseline: nothing is raised, whatever it contains", { skip: !have }, async () => {
  soc();
  const h = harness();
  h.state.keys.alice.push(RSA1024); // навіть слабкий ключ у ПЕРШОМУ скані не є «новим»: порівнювати ще нема з чим
  h.state.settings = SETTINGS({ permitrootlogin: "yes" });
  const r = await h.scan();
  assert.equal(r.code, 200);
  assert.deepEqual(h.raised, []);
  assert.equal(h.audit.at(-1).meta.trigger, "manual");
  assert.equal(h.audit.at(-1).meta.raised, 0);
});

test("after the baseline, a new key and a worse setting each become one incident; a repeat scan adds none", { skip: !have }, async () => {
  soc();
  const h = harness();
  await h.scan();
  h.state.keys.alice.push(ECDSA);
  h.state.settings = SETTINGS({ permitrootlogin: "yes" });
  await h.scan();
  assert.equal(h.raised.length, 2);
  assert.ok(h.raised.some((i) => /^ssh-setting:a:permitrootlogin$/.test(i.rule) && i.severity === "high"));
  assert.ok(h.raised.some((i) => /^ssh-newkey:a:alice:SHA256:/.test(i.rule) && i.severity === "medium"));
  assert.equal(h.audit.at(-1).meta.raised, 2);
  await h.scan();
  await h.scan();
  assert.equal(h.raised.length, 2, "unchanged state: no new incidents, no duplicates");
});

test("a weak new key and a new key for root are high", { skip: !have }, async () => {
  soc();
  const h = harness();
  await h.scan();
  h.state.keys.alice.push(RSA1024);
  h.state.keys.root = [ED];
  await h.scan();
  const bySev = Object.fromEntries(h.raised.map((i) => [i.rule.split(":")[2], i.severity]));
  assert.equal(bySev.alice, "high", "1024-bit RSA");
  assert.equal(bySev.root, "high", "a key for root");
});

test("an expected key is only 'low', and a key the analyst did not list is 'high' once a list exists", { skip: !have }, async () => {
  soc();
  const h = harness();
  await h.scan();
  const fp = (await h.call("GET", "/api/hygiene")).body.hosts[0].keys[0].fingerprint;
  await h.call("PUT", "/api/hygiene/expected", { expected: [{ fingerprint: fp, owner: "Alice", hosts: [] }] });
  h.state.keys.alice.push(ECDSA);
  await h.scan();
  assert.equal(h.raised.length, 1);
  assert.equal(h.raised[0].severity, "high", "ECDSA is not on the expected list");
});

test("OUTAGE: a failed scan keeps the last good data, so recovery raises only what really changed", { skip: !have }, async () => {
  soc();
  const h = harness();
  h.state.keys.alice.push(RSA2048);
  await h.scan(); // baseline: два ключі
  h.state.ready = false;
  const down = await h.scan();
  const view = down.body.hosts[0];
  assert.ok(view.error, "the host is reported as not scanned");
  assert.deepEqual(view.keys, [], "stale keys are not shown as current");
  assert.ok(loadHygiene().scan.hosts[0].host.keys.length === 2, "…but the last good data is kept on disk for the next comparison");
  h.state.keys.alice.push(ECDSA); // зʼявився за час збою
  h.state.ready = true;
  await h.scan();
  assert.equal(h.raised.length, 1, "exactly the one new key, not all three");
  assert.match(h.raised[0].rule, /ssh-newkey:a:alice:/);
});

test("with automatic incidents off, scans still store results but raise nothing", { skip: !have }, async () => {
  soc({ autoIncidents: false });
  const h = harness();
  await h.scan();
  h.state.keys.alice.push(ECDSA);
  await h.scan();
  assert.deepEqual(h.raised, []);
  assert.equal(loadHygiene().scan.hosts[0].host.keys.length, 2, "the new data is stored");
});

test("scheduled scan: runs when due, not before, not when switched off, not without connected hosts", { skip: !have }, async () => {
  soc({ hygieneHours: 1 });
  const h = harness();
  assert.deepEqual(await h.api.scheduled().then((r) => r && { ok: r.ok }), { ok: 1 }, "no scan yet: due immediately (this is the baseline)");
  assert.equal(await h.api.scheduled(), null, "just scanned: not due");
  const st = loadHygiene();
  saveHygiene({ ...st, scan: { ...st.scan, at: Date.now() - 2 * 3_600_000 } });
  h.state.keys.alice.push(ECDSA);
  const r = await h.api.scheduled();
  assert.deepEqual([r.ok, r.raised], [1, 1], "due again after two hours: the change is detected");
  assert.equal(h.audit.at(-1).meta.trigger, "scheduled");

  saveHygiene({ ...loadHygiene(), scan: { ...loadHygiene().scan, at: 0 } });
  soc({ hygieneHours: 0 });
  assert.equal(await h.api.scheduled(), null, "0 hours means off");
  soc({ hygieneHours: 1 });
  h.state.ready = false;
  assert.equal(await h.api.scheduled(), null, "no connected host: nothing to scan");
});

test("the view reports the schedule so the page can say what happens automatically", { skip: !have }, async () => {
  soc({ hygieneHours: 12 });
  assert.equal((await harness().call("GET", "/api/hygiene")).body.scanEveryHours, 12);
  soc({ hygieneHours: 0 });
  assert.equal((await harness().call("GET", "/api/hygiene")).body.scanEveryHours, 0, "0 is preserved, not replaced by the default");
});
