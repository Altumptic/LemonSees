// Імпорт з ~/.ssh/config: семантика OpenSSH, безпека читання, стійкість до сміття.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSshConfig, readSshConfig, MAX_BYTES, MAX_ENTRIES } from "../server/sshconfig.js";

const HOME = path.resolve("/home/alice");
const KEY = path.join(HOME, ".ssh", "id_ed25519");
const ctx = (existing = [KEY]) => ({ home: HOME, user: "alice", exists: (p) => existing.includes(p) });
const parse = (text, existing) => parseSshConfig(text, ctx(existing));
const by = (r, alias) => r.entries.find((e) => e.alias === alias);

test("a plain host block", () => {
  const r = parse("Host web\n  HostName 203.0.113.7\n  User deploy\n  Port 2222\n  IdentityFile ~/.ssh/id_ed25519\n");
  const e = by(r, "web");
  assert.deepEqual([e.host, e.user, e.port, e.keyPath, e.keySource, e.ready], ["203.0.113.7", "deploy", 2222, KEY, "config", true]);
});

test("several aliases on one line become separate entries", () => {
  const r = parse("Host a b c\n  User u\n");
  assert.deepEqual(r.entries.map((e) => e.alias), ["a", "b", "c"]);
  assert.ok(r.entries.every((e) => e.user === "u"));
});

test("OpenSSH rule: the FIRST value wins, so a specific block before `Host *` beats it", () => {
  const specific = parse("Host web\n  User deploy\nHost *\n  User fallback\n");
  assert.equal(by(specific, "web").user, "deploy");
  const generalFirst = parse("Host *\n  User fallback\nHost web\n  User deploy\n");
  assert.equal(by(generalFirst, "web").user, "fallback", "a `Host *` placed first wins, as in ssh");
});

test("defaults from `Host *` and global options apply to hosts without their own", () => {
  const r = parse("User globaluser\nPort 2200\nHost web\n  HostName h\nHost *\n  IdentityFile ~/.ssh/id_ed25519\n");
  const e = by(r, "web");
  assert.deepEqual([e.user, e.port, e.keyPath], ["globaluser", 2200, KEY]);
});

test("wildcard hosts are not listed as hosts but their options apply", () => {
  const r = parse("Host *.example.com\n  User corp\nHost db.example.com\n  HostName 10.0.0.5\nHost web*\n  User x\n");
  assert.deepEqual(r.entries.map((e) => e.alias), ["db.example.com"]);
  assert.equal(by(r, "db.example.com").user, "corp");
  assert.ok(r.skipped >= 2);
});

test("a negated pattern excludes the host, whatever else matches", () => {
  const r = parse("Host web db\n  User a\nHost * !web\n  User b\n");
  assert.equal(by(r, "web").user, "a");
  assert.equal(by(r, "db").user, "a", "first value still wins for db");
  const r2 = parse("Host *.internal !bastion.internal\n  User ops\nHost bastion.internal other.internal\n  HostName x\n");
  assert.equal(by(r2, "other.internal").user, "ops");
  assert.equal(by(r2, "bastion.internal").user, "alice", "negation excludes bastion; local user is the default");
});

test("HostName defaults to the alias; %h is expanded; unknown tokens are flagged", () => {
  const r = parse("Host a\n  User u\nHost b\n  HostName %h.example.org\nHost c\n  HostName %x.bad\n");
  assert.equal(by(r, "a").host, "a");
  assert.equal(by(r, "b").host, "b.example.org");
  assert.equal(by(r, "c").ready, false);
  assert.match(by(r, "c").reasons.join(), /substitution/);
});

test("keywords are case-insensitive; `=` separators, quotes and CRLF work", () => {
  const r = parse('host "web"\r\n  hostname=10.1.1.1\r\n  USER = "deploy"\r\n  port 2022\r\n');
  const e = by(r, "web");
  assert.deepEqual([e.host, e.user, e.port], ["10.1.1.1", "deploy", 2022]);
});

test("without IdentityFile the standard key is used, as ssh does; with none, the host is not ready", () => {
  const withDefault = by(parse("Host a\n"), "a");
  assert.deepEqual([withDefault.keySource, withDefault.keyPath, withDefault.ready], ["default", KEY, true]);
  const none = by(parse("Host a\n", []), "a");
  assert.deepEqual([none.keySource, none.ready], ["none", false]);
  assert.match(none.reasons.join(), /No key/);
});

test("a missing, relative or tilde-only key path is handled", () => {
  assert.match(by(parse("Host a\n  IdentityFile ~/.ssh/nope\n"), "a").reasons.join(), /does not exist/);
  assert.match(by(parse("Host a\n  IdentityFile keys/id\n", ["keys/id"]), "a").reasons.join(), /absolute/);
});

test("unsupported features are flagged, never imported silently", () => {
  const r = parse("Include other.conf\nMatch host x\n  User ignored\nHost a\n  ProxyCommand ssh -W %h:%p jump\nHost b\n  ProxyJump jump.example\n");
  assert.equal(by(r, "a").ready, false);
  assert.match(by(r, "a").reasons.join(), /ProxyCommand/);
  assert.equal(by(r, "b").proxyJump, "jump.example");
  assert.ok(r.warnings.some((w) => /Include/.test(w)));
  assert.ok(r.warnings.some((w) => /Match/.test(w)));
  assert.notEqual(by(r, "a").user, "ignored", "options inside Match are not applied");
});

test("an invalid port is reported and falls back to 22", () => {
  const e = by(parse("Host a\n  Port banana\n"), "a");
  assert.deepEqual([e.port, e.ready], [22, false]);
});

test("limits: entry cap, line length, garbage input", () => {
  const many = Array.from({ length: MAX_ENTRIES + 50 }, (_, i) => `Host h${i}\n`).join("");
  const r = parse(many);
  assert.equal(r.entries.length, MAX_ENTRIES);
  assert.ok(r.warnings.some((w) => /first/.test(w)));
  const long = parse(`Host ok\n${" ".repeat(10000)}User evil\nHost b\n`);
  assert.deepEqual(long.entries.map((e) => e.alias), ["ok", "b"]);
  for (const junk of ["", "\0\0\0", "Host", "Host \n =\n", "�".repeat(5000), "Host a\n".repeat(3) + "User\n", '"""\n=\nHost "'])
    assert.doesNotThrow(() => parse(junk), JSON.stringify(junk).slice(0, 30));
});

test("a hostile wildcard pattern cannot stall the matcher", () => {
  const t0 = Date.now();
  const r = parse(`Host ${"*a".repeat(100)}b\n  User x\nHost ${"a".repeat(240)}\n  HostName h\n`);
  assert.ok(Date.now() - t0 < 500);
  assert.equal(r.entries.length, 1);
});

// ---- читання файлу ----

const tmpHome = () => fs.mkdtempSync(path.join(os.tmpdir(), "ls-sshcfg-"));

test("readSshConfig: no file, a directory and an oversized file do not throw", () => {
  const home = tmpHome();
  assert.equal(readSshConfig({ home }).found, false);
  fs.mkdirSync(path.join(home, ".ssh", "config"), { recursive: true });
  assert.equal(readSshConfig({ home }).found, false, "a directory is not a config file");
  fs.rmSync(path.join(home, ".ssh", "config"), { recursive: true });
  fs.writeFileSync(path.join(home, ".ssh", "config"), "x".repeat(MAX_BYTES + 1));
  const big = readSshConfig({ home });
  assert.equal(big.found, true);
  assert.equal(big.entries.length, 0);
  assert.match(big.warnings.join(), /larger/);
});

test("readSshConfig reads the fixed path and only stats keys, never their contents", () => {
  const home = tmpHome();
  fs.mkdirSync(path.join(home, ".ssh"), { recursive: true });
  const key = path.join(home, ".ssh", "id_ed25519");
  fs.writeFileSync(key, "-----BEGIN OPENSSH PRIVATE KEY-----\nSECRET-MARKER\n");
  fs.writeFileSync(path.join(home, ".ssh", "config"), "Host web\n  HostName 203.0.113.9\n  User deploy\n");
  const r = readSshConfig({ home });
  assert.equal(r.path, "~/.ssh/config", "the absolute path is not exposed");
  const e = r.entries[0];
  assert.deepEqual([e.alias, e.keyPath, e.keyExists, e.ready], ["web", key, true, true]);
  assert.ok(!JSON.stringify(r).includes("SECRET-MARKER"), "key contents never appear in the result");
});
