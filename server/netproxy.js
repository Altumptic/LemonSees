// Мережевий шар приватності: SOCKS5 / HTTP CONNECT проксі (VPN-шлюз, Tor, корпоративний проксі)
// для SSH-зʼєднань і всіх вихідних HTTP-запитів (гео-IP, аптайм, інтеграції).
// Kill switch: якщо проксі задано й він недоступний — зʼєднання НЕ йде напряму (IP аналітика не світиться).
import net from "node:net";
import tls from "node:tls";
import { Agent, ProxyAgent, fetch as ufetch } from "undici";

let CFG = {
  proxy: { type: "none", host: "", port: 0, user: "", pass: "" },
  applySsh: true,
  applyOutbound: true,
  killSwitch: true,
  remoteDns: true,
  hardenedCrypto: true,
  strictHostKeys: true,
};

export function setNetConfig(cfg) {
  CFG = { ...CFG, ...cfg, proxy: { ...CFG.proxy, ...(cfg?.proxy || {}) } };
  dispatcher = null;
}
export const getNetConfig = () => CFG;
export const proxyEnabled = (p = CFG.proxy) => !!p && p.type !== "none" && !!p.host && !!p.port;

const withTimeout = (sock, ms, reject) => {
  sock.setTimeout(ms, () => {
    sock.destroy();
    reject(new Error("Проксі не відповідає (таймаут)"));
  });
};

/** TCP-зʼєднання до host:port через SOCKS5. Домен передається проксі (remote DNS, без DNS-витоку). */
function socks5(p, host, port, timeout) {
  return new Promise((resolve, reject) => {
    const s = net.connect(p.port, p.host);
    withTimeout(s, timeout, reject);
    s.once("error", (e) => reject(new Error(`SOCKS5: ${e.message}`)));
    let stage = 0;
    let buf = Buffer.alloc(0);
    s.once("connect", () => s.write(Buffer.from(p.user ? [5, 2, 0, 2] : [5, 1, 0])));
    s.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      if (stage === 0 && buf.length >= 2) {
        if (buf[0] !== 5) return fail("неочікувана відповідь");
        const method = buf[1];
        buf = buf.subarray(2);
        if (method === 2) {
          const u = Buffer.from(p.user || "");
          const pw = Buffer.from(p.pass || "");
          s.write(Buffer.concat([Buffer.from([1, u.length]), u, Buffer.from([pw.length]), pw]));
          stage = 1;
        } else if (method === 0) {
          request();
        } else return fail("метод автентифікації не підтримується");
      }
      if (stage === 1 && buf.length >= 2) {
        if (buf[1] !== 0) return fail("невірний логін/пароль проксі");
        buf = buf.subarray(2);
        request();
      }
      if (stage === 2 && buf.length >= 5) {
        if (buf[1] !== 0) return fail(`проксі відмовив (код ${buf[1]})`);
        const atyp = buf[3];
        const need = atyp === 1 ? 10 : atyp === 4 ? 22 : 7 + buf[4];
        if (buf.length < need) return;
        s.removeAllListeners("data");
        s.setTimeout(0);
        const rest = buf.subarray(need);
        if (rest.length) s.unshift(rest);
        resolve(s);
      }
    });
    function request() {
      stage = 2;
      const portB = Buffer.from([(port >> 8) & 255, port & 255]);
      let addr;
      if (net.isIPv4(host)) addr = Buffer.from([1, ...host.split(".").map(Number)]);
      else if (CFG.remoteDns || !net.isIP(host)) {
        const h = Buffer.from(host);
        addr = Buffer.concat([Buffer.from([3, h.length]), h]);
      } else addr = Buffer.from([3, host.length, ...Buffer.from(host)]);
      s.write(Buffer.concat([Buffer.from([5, 1, 0]), addr, portB]));
    }
    function fail(msg) {
      s.destroy();
      reject(new Error(`SOCKS5: ${msg}`));
    }
  });
}

/** TCP-тунель через HTTP CONNECT-проксі. */
function httpConnect(p, host, port, timeout) {
  return new Promise((resolve, reject) => {
    const s = net.connect(p.port, p.host);
    withTimeout(s, timeout, reject);
    s.once("error", (e) => reject(new Error(`HTTP-проксі: ${e.message}`)));
    s.once("connect", () => {
      const auth = p.user ? `Proxy-Authorization: Basic ${Buffer.from(`${p.user}:${p.pass || ""}`).toString("base64")}\r\n` : "";
      s.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
    });
    let buf = "";
    const onData = (d) => {
      buf += d.toString("latin1");
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      s.removeListener("data", onData);
      s.setTimeout(0);
      if (!/^HTTP\/1\.[01] 200/.test(buf)) {
        s.destroy();
        return reject(new Error(`HTTP-проксі відмовив: ${buf.split("\r\n")[0]}`));
      }
      const rest = Buffer.from(buf.slice(end + 4), "latin1");
      if (rest.length) s.unshift(rest);
      resolve(s);
    };
    s.on("data", onData);
  });
}

/** Відкрити TCP до цілі через вказаний проксі. */
export function dial(host, port, p = CFG.proxy, timeout = 15000) {
  if (p.type === "socks5") return socks5(p, host, port, timeout);
  if (p.type === "http") return httpConnect(p, host, port, timeout);
  return Promise.reject(new Error("Проксі не налаштовано"));
}

/** Сокет для SSH: персональний проксі хоста → глобальний → напряму (якщо дозволено). */
export async function sshSocket(hostCfg) {
  const own = hostCfg.proxy && proxyEnabled(hostCfg.proxy) ? hostCfg.proxy : null;
  const p = own || (CFG.applySsh && proxyEnabled() ? CFG.proxy : null);
  if (!p) return null;
  try {
    return await dial(hostCfg.host, hostCfg.port || 22, p);
  } catch (e) {
    if (CFG.killSwitch) throw new Error(`${e.message} — kill switch блокує пряме зʼєднання`);
    return null;
  }
}

/* ---------------- Вихідний HTTP ---------------- */

let dispatcher = null;
function getDispatcher() {
  if (!CFG.applyOutbound || !proxyEnabled()) return null;
  if (dispatcher) return dispatcher;
  const p = CFG.proxy;
  if (p.type === "http") {
    const auth = p.user ? `${encodeURIComponent(p.user)}:${encodeURIComponent(p.pass || "")}@` : "";
    dispatcher = new ProxyAgent(`http://${auth}${p.host}:${p.port}`);
  } else {
    dispatcher = new Agent({
      connect: (opts, cb) => {
        const port = Number(opts.port) || (opts.protocol === "https:" ? 443 : 80);
        socks5(p, opts.hostname, port, 15000).then(
          (sock) => {
            if (opts.protocol !== "https:") return cb(null, sock);
            const t = tls.connect({ socket: sock, servername: opts.servername || opts.hostname, ALPNProtocols: ["http/1.1"] });
            t.once("secureConnect", () => cb(null, t));
            t.once("error", (e) => cb(e, null));
          },
          (e) => cb(e, null),
        );
      },
    });
  }
  return dispatcher;
}

/** fetch, що поважає проксі та kill switch. */
export async function netFetch(url, init = {}) {
  const d = getDispatcher();
  if (d) return ufetch(url, { ...init, dispatcher: d });
  if (proxyEnabled() && CFG.killSwitch && CFG.applyOutbound) throw new Error("Kill switch: проксі неактивний");
  return fetch(url, init);
}

/** Яку публічну IP бачать зовнішні сервіси (через проксі, якщо увімкнено). */
export async function egressCheck() {
  const t0 = Date.now();
  const r = await netFetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  return { ip: j.ip, viaProxy: !!getDispatcher(), ms: Date.now() - t0 };
}

/* ---------------- SSH-криптографія ---------------- */

export function sshAlgorithms() {
  if (!CFG.hardenedCrypto) return undefined;
  return {
    kex: ["curve25519-sha256", "curve25519-sha256@libssh.org", "ecdh-sha2-nistp521", "ecdh-sha2-nistp384", "ecdh-sha2-nistp256", "diffie-hellman-group16-sha512", "diffie-hellman-group14-sha256"],
    cipher: ["chacha20-poly1305@openssh.com", "aes256-gcm@openssh.com", "aes128-gcm@openssh.com", "aes256-ctr", "aes192-ctr", "aes128-ctr"],
    hmac: ["hmac-sha2-512-etm@openssh.com", "hmac-sha2-256-etm@openssh.com", "hmac-sha2-512", "hmac-sha2-256"],
    serverHostKey: ["ssh-ed25519", "ecdsa-sha2-nistp521", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp256", "rsa-sha2-512", "rsa-sha2-256"],
  };
}
