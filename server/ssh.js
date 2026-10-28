// SSH-пул: одне тривале з'єднання на хост (multiplexing),
// окремі канали під кожну задачу (exec / shell). Zero footprint на сервері.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import ssh2 from "ssh2";
import { getNetConfig, sshAlgorithms, sshSocket } from "./netproxy.js";

const { Client } = ssh2;

// Хуки від двигуна: бастіон (jump host) за id та збереження відбитка ключа хоста (TOFU)
const hooks = { jump: () => null, onHostKey: () => {} };
export function setSshHooks(h) {
  Object.assign(hooks, h);
}

export const fingerprint = (key) => "SHA256:" + crypto.createHash("sha256").update(key).digest("base64").replace(/=+$/, "");

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
  return p;
}

export class HostConnection {
  constructor(hostCfg, onStatus) {
    this.cfg = hostCfg;
    this.onStatus = onStatus || (() => {});
    this.client = null;
    this.ready = false;
    this.disposed = false;
    this.connecting = null;
    this.lastError = "";
    this.reconnectTimer = null;
    this.backoffMs = 3000;
  }

  updateConfig(hostCfg) {
    this.cfg = hostCfg;
  }

  async buildConnectOptions() {
    const c = this.cfg;
    const opts = {
      host: c.host,
      port: c.port || 22,
      username: c.user || "root",
      readyTimeout: 15000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
    };
    const algorithms = sshAlgorithms();
    if (algorithms) opts.algorithms = algorithms;

    // Закріплення ключа хоста: перший раз запамʼятовуємо, далі — лише збіг (захист від MITM)
    this.hostKeyMismatch = "";
    opts.hostVerifier = (key) => {
      const fp = fingerprint(key);
      this.seenHostKey = fp;
      if (!c.hostKey) {
        hooks.onHostKey(c.id, fp);
        return true;
      }
      if (c.hostKey === fp) return true;
      if (!getNetConfig().strictHostKeys) return true;
      this.hostKeyMismatch = `Ключ хоста змінився (очікувався ${c.hostKey}, отримано ${fp}). Можлива MITM-атака — зʼєднання заблоковано.`;
      return false;
    };

    // Маршрут: бастіон → проксі/Tor → напряму
    if (c.jumpHostId && c.jumpHostId !== c.id) {
      const jump = hooks.jump(c.jumpHostId);
      if (!jump) throw new Error("Бастіон (jump host) не знайдено");
      opts.sock = await jump.forwardOut(c.host, c.port || 22);
    } else {
      const sock = await sshSocket(c);
      if (sock) opts.sock = sock;
    }
    if (c.authType === "password") {
      opts.password = c.password || "";
    } else {
      const keyPath = expandHome(c.keyPath);
      opts.privateKey = fs.readFileSync(keyPath);
      if (c.passphrase) opts.passphrase = c.passphrase;
    }
    return opts;
  }

  setStatus(status, error = "") {
    this.lastError = error;
    this.onStatus(this.cfg.id, status, error);
  }

  connect() {
    if (this.disposed) return Promise.reject(new Error("disposed"));
    if (this.ready && this.client) return Promise.resolve(this.client);
    if (this.connecting) return this.connecting;

    this.setStatus("connecting");
    this.connecting = new Promise(async (resolve, reject) => {
      let opts;
      try {
        opts = await this.buildConnectOptions();
      } catch (e) {
        this.connecting = null;
        this.setStatus("error", e.code === "ENOENT" ? `Ключ не прочитано: ${e.message}` : e.message);
        this.scheduleReconnect();
        return reject(e);
      }

      const client = new Client();
      const fail = (err) => {
        this.connecting = null;
        this.ready = false;
        this.client = null;
        try { client.end(); } catch { /* ignore */ }
        this.setStatus("error", this.hostKeyMismatch || err?.message || String(err));
        this.scheduleReconnect();
        reject(err);
      };

      client.once("ready", () => {
        this.client = client;
        this.ready = true;
        this.connecting = null;
        this.backoffMs = 3000;
        this.setStatus("online");
        resolve(client);
      });
      client.once("error", fail);
      client.on("close", () => {
        if (this.client === client) {
          this.client = null;
          this.ready = false;
          if (!this.disposed) {
            this.setStatus("offline", this.lastError || "З'єднання закрито");
            this.scheduleReconnect();
          }
        }
      });

      try {
        client.connect(opts);
      } catch (e) {
        fail(e);
      }
    });
    return this.connecting;
  }

  scheduleReconnect() {
    if (this.disposed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed && !this.ready) {
        this.connect().catch(() => {});
      }
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 1.7, 30000);
  }

  /** Виконати команду; повертає {code, stdout, stderr}. */
  exec(command, { timeout = 25000 } = {}) {
    return this.connect().then(
      (client) =>
        new Promise((resolve, reject) => {
          let done = false;
          const timer = setTimeout(() => {
            if (!done) {
              done = true;
              reject(new Error("Таймаут виконання команди"));
            }
          }, timeout);

          client.exec(command, (err, stream) => {
            if (err) {
              clearTimeout(timer);
              if (!done) { done = true; reject(err); }
              return;
            }
            let stdout = "";
            let stderr = "";
            stream.on("data", (d) => (stdout += d.toString("utf8")));
            stream.stderr.on("data", (d) => (stderr += d.toString("utf8")));
            stream.on("close", (code) => {
              clearTimeout(timer);
              if (!done) { done = true; resolve({ code: code ?? 0, stdout, stderr }); }
            });
            stream.on("error", (e) => {
              clearTimeout(timer);
              if (!done) { done = true; reject(e); }
            });
          });
        }),
    );
  }

  /** Прокинути канал до dstHost:dstPort на віддаленому боці (local port forwarding). */
  forwardOut(dstHost, dstPort) {
    return this.connect().then(
      (client) =>
        new Promise((resolve, reject) => {
          client.forwardOut("127.0.0.1", 0, dstHost, dstPort, (err, stream) =>
            err ? reject(err) : resolve(stream),
          );
        }),
    );
  }

  /** Інтерактивний shell із PTY. Повертає stream. */
  shell({ cols = 120, rows = 32 } = {}) {
    return this.connect().then(
      (client) =>
        new Promise((resolve, reject) => {
          client.shell(
            { term: "xterm-256color", cols, rows },
            (err, stream) => (err ? reject(err) : resolve(stream)),
          );
        }),
    );
  }

  dispose() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.client) {
      try { this.client.end(); } catch { /* ignore */ }
    }
    this.client = null;
    this.ready = false;
  }
}
