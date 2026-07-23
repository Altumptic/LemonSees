// Робота з базами даних через SSH-тунель (local port forwarding).
// Порти БД назовні не відкриваються — з'єднання йде всередині SSH-сесії.
import net from "node:net";
import http from "node:http";
import { createRequire } from "node:module";
import pg from "pg";
import mysql from "mysql2/promise";
import Redis from "ioredis";
import { MongoClient } from "mongodb";
import { engineFamily, enginePort } from "./engines.js";

const { Client: PgClient } = pg;
const require = createRequire(import.meta.url);

// dbId -> { server, port, conn }
const tunnels = new Map();

export async function ensureTunnel(dbId, conn, dstHost, dstPort) {
  const existing = tunnels.get(dbId);
  if (existing && existing.conn === conn && existing.server.listening) return existing.port;
  if (existing) closeTunnel(dbId);

  const server = net.createServer((sock) => {
    sock.on("error", () => {});
    conn.forwardOut(dstHost, dstPort).then(
      (stream) => {
        stream.on("error", () => sock.destroy());
        sock.pipe(stream).pipe(sock);
      },
      () => sock.destroy(),
    );
  });

  await new Promise((res, rej) => {
    server.once("error", rej);
    server.listen(0, "127.0.0.1", () => res());
  });

  const port = server.address().port;
  tunnels.set(dbId, { server, port, conn });
  return port;
}

export function closeTunnel(dbId) {
  const t = tunnels.get(dbId);
  if (t) {
    try {
      t.server.close();
    } catch {
      /* ignore */
    }
    tunnels.delete(dbId);
  }
}

export function closeTunnelsForHost(hostId, dbs) {
  for (const d of dbs) if (d.hostId === hostId) closeTunnel(d.id);
}

/* ---------------- ідентифікатори ---------------- */

const qPg = (s) => `"${String(s).replace(/"/g, '""')}"`;
const qMy = (s) => `\`${String(s).replace(/`/g, "``")}\``;

/* ---------------- довільний запит ---------------- */

function famOf(cfg) {
  const fam = engineFamily(cfg.type);
  if (!fam) throw new Error(`Невідомий тип БД: ${cfg.type}`);
  if (fam === "cloud") throw new Error("Хмарна БД: під'єднання через SSH недоступне (потрібні ключі API).");
  if (fam === "soon") throw new Error("Для цього рушія ще немає драйвера у ШОК. Скоро додамо.");
  return fam;
}

export async function runQuery(cfg, conn, sql) {
  const fam = famOf(cfg);
  if (fam === "sqlite") return sqliteRun(conn, cfg, sql);
  const port = await ensureTunnel(cfg.id, conn, cfg.dbHost, cfg.dbPort);
  if (fam === "pg") return pgQuery(port, cfg, sql);
  if (fam === "mysql") return myQuery(port, cfg, sql);
  if (fam === "redis") return redisQuery(port, cfg, sql);
  if (fam === "mongo") return mongoQuery(port, cfg, sql);
  if (fam === "http") return httpQuery(port, cfg, sql);
  throw new Error("Невідомий тип БД");
}

async function pgQuery(port, cfg, sql) {
  const client = new PgClient({
    host: "127.0.0.1",
    port,
    user: cfg.user || undefined,
    password: cfg.password || undefined,
    database: cfg.database || undefined,
    connectionTimeoutMillis: 12000,
    query_timeout: 30000,
    statement_timeout: 30000,
  });
  await client.connect();
  try {
    const res = await client.query({ text: sql, rowMode: "array" });
    const r = Array.isArray(res) ? res[res.length - 1] : res;
    const columns = (r.fields || []).map((f) => f.name);
    const rows = (r.rows || []).map((arr) => rowFromArray(columns, arr));
    return { columns, rows, rowCount: r.rowCount ?? rows.length, command: r.command || "" };
  } finally {
    await client.end().catch(() => {});
  }
}

async function myQuery(port, cfg, sql) {
  const c = await mysql.createConnection({
    host: "127.0.0.1",
    port,
    user: cfg.user || undefined,
    password: cfg.password || undefined,
    database: cfg.database || undefined,
    multipleStatements: true,
    connectTimeout: 12000,
    dateStrings: true,
  });
  try {
    let [rows, fields] = await c.query(sql);
    // multipleStatements → масив масивів; беремо останній результат
    if (Array.isArray(rows) && Array.isArray(rows[0]) && fields && Array.isArray(fields[0])) {
      rows = rows[rows.length - 1];
      fields = fields[fields.length - 1];
    }
    if (Array.isArray(rows)) {
      const columns = fields ? fields.map((f) => f.name) : rows[0] ? Object.keys(rows[0]) : [];
      return { columns, rows, rowCount: rows.length, command: "SELECT" };
    }
    return {
      columns: ["affectedRows", "insertId", "info"],
      rows: [{ affectedRows: rows.affectedRows, insertId: rows.insertId, info: rows.info || "" }],
      rowCount: rows.affectedRows ?? 0,
      command: "OK",
    };
  } finally {
    await c.end().catch(() => {});
  }
}

async function redisQuery(port, cfg, sql) {
  const r = new Redis({
    host: "127.0.0.1",
    port,
    password: cfg.password || undefined,
    db: parseInt(cfg.database, 10) || 0,
    lazyConnect: true,
    connectTimeout: 12000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  await r.connect();
  try {
    const lines = String(sql)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const rows = [];
    for (const line of lines) {
      const args = tokenize(line);
      if (!args.length) continue;
      let result;
      try {
        result = formatRedis(await r.call(...args));
      } catch (e) {
        result = `ERR ${e.message}`;
      }
      rows.push({ command: line, result });
    }
    return { columns: ["command", "result"], rows, rowCount: rows.length, command: "REDIS" };
  } finally {
    r.disconnect();
  }
}

/* ---------------- Mongo helpers ---------------- */

function mongoUri(port, cfg) {
  const auth = cfg.user
    ? `${encodeURIComponent(cfg.user)}:${encodeURIComponent(cfg.password || "")}@`
    : "";
  const src = cfg.user ? "?authSource=admin&directConnection=true" : "?directConnection=true";
  return `mongodb://${auth}127.0.0.1:${port}/${src}`;
}

async function withMongo(port, cfg, fn) {
  const client = new MongoClient(mongoUri(port, cfg), { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

async function mongoQuery(port, cfg, sql) {
  // Приймаємо JSON: { "collection":"users", "filter":{}, "limit":50, "sort":{} }
  // або { "command": { ... } } для db.command()
  let req;
  try {
    req = JSON.parse(sql);
  } catch {
    throw new Error('Для Mongo введи JSON, напр. {"collection":"users","filter":{},"limit":50}');
  }
  return withMongo(port, cfg, async (client) => {
    const db = client.db(cfg.database || undefined);
    if (req.command) {
      const r = await db.command(req.command);
      const rows = [{ result: r }];
      return { columns: ["result"], rows, rowCount: 1, command: "COMMAND" };
    }
    if (!req.collection) throw new Error("Вкажи collection");
    const docs = await db
      .collection(req.collection)
      .find(req.filter || {}, { limit: Math.min(500, req.limit || 50), sort: req.sort || {} })
      .toArray();
    return docsToResult(docs);
  });
}

function docsToResult(docs) {
  const colSet = new Set();
  for (const d of docs) for (const k of Object.keys(d)) colSet.add(k);
  const columns = [...colSet];
  const rows = docs.map((d) => {
    const o = {};
    for (const c of columns) o[c] = c in d ? normalizeMongoVal(d[c]) : undefined;
    return o;
  });
  return { columns, rows, rowCount: rows.length, command: "FIND" };
}

function normalizeMongoVal(v) {
  if (v && typeof v === "object" && typeof v.toHexString === "function") return v.toHexString();
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object") return JSON.stringify(v);
  return v;
}

/* ---------------- SQLite (файл читається по SSH, відкривається локально через sql.js) ---------------- */
// Не потребує встановленого sqlite3 на сервері. Відкривається лише для читання.

function shq(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

let sqlJsPromise = null;
function getSqlJs() {
  if (!sqlJsPromise) {
    const initSqlJs = require("sql.js");
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    sqlJsPromise = initSqlJs({ locateFile: () => wasmPath });
  }
  return sqlJsPromise;
}

const sqliteCache = new Map(); // dbId -> { db, at }

async function fetchSqliteBytes(conn, file) {
  const r = await conn.exec(
    `base64 -w0 ${shq(file)} 2>/dev/null || base64 ${shq(file)} 2>/dev/null | tr -d '\\n'`,
    { timeout: 60000 },
  );
  const b64 = r.stdout.trim();
  if (!b64) throw new Error("Не вдалося прочитати файл (перевір шлях і права доступу)");
  return Buffer.from(b64, "base64");
}

async function openSqlite(conn, cfg, fresh = false) {
  const cached = sqliteCache.get(cfg.id);
  if (!fresh && cached && Date.now() - cached.at < 30000) return cached.db;
  if (cached) {
    try {
      cached.db.close();
    } catch {
      /* ignore */
    }
  }
  const SQL = await getSqlJs();
  const bytes = await fetchSqliteBytes(conn, cfg.dbFile);
  const db = new SQL.Database(bytes);
  sqliteCache.set(cfg.id, { db, at: Date.now() });
  return db;
}

function sqliteResult(db, sql) {
  const res = db.exec(sql);
  if (!res.length) return { columns: [], rows: [], rowCount: 0, command: "OK" };
  const last = res[res.length - 1];
  const rows = last.values.map((v) => {
    const o = {};
    last.columns.forEach((c, i) => (o[c] = v[i]));
    return o;
  });
  return { columns: last.columns, rows, rowCount: rows.length, command: "SELECT" };
}

async function sqliteRun(conn, cfg, sql) {
  const db = await openSqlite(conn, cfg);
  try {
    return sqliteResult(db, sql);
  } catch (e) {
    throw new Error(e.message.replace(/^Error:\s*/, ""));
  }
}

/* ---------------- HTTP / REST адаптер ---------------- */

function httpRequest(port, cfg, method, pathq, body) {
  return new Promise((resolve, reject) => {
    const headers = { "content-type": "application/json" };
    if (cfg.user)
      headers.authorization =
        "Basic " + Buffer.from(`${cfg.user}:${cfg.password || ""}`).toString("base64");
    const req = http.request(
      { host: "127.0.0.1", port, method, path: pathq, headers, timeout: 20000 },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Таймаут HTTP-запиту")));
    if (body) req.write(body);
    req.end();
  });
}

async function httpQuery(port, cfg, raw) {
  const lines = String(raw).split("\n");
  const first = (lines[0] || "").trim();
  let method = "GET";
  let pathq = first || "/";
  const m = first.match(/^(GET|POST|PUT|DELETE|HEAD|PATCH)\s+(.+)$/i);
  if (m) {
    method = m[1].toUpperCase();
    pathq = m[2].trim();
  }
  if (!pathq.startsWith("/")) pathq = "/" + pathq;
  const body = lines.slice(1).join("\n").trim() || undefined;
  const r = await httpRequest(port, cfg, method, pathq, body);
  let parsed = null;
  try {
    parsed = JSON.parse(r.body);
  } catch {
    /* не JSON */
  }
  if (Array.isArray(parsed)) {
    const out = docsToResult(parsed);
    out.command = `HTTP ${r.status}`;
    return out;
  }
  return {
    columns: ["status", "response"],
    rows: [{ status: r.status, response: parsed ? JSON.stringify(parsed, null, 2) : r.body }],
    rowCount: 1,
    command: `HTTP ${r.status}`,
  };
}

const HTTP_HINTS = {
  elasticsearch: ["GET /_cat/indices?v", "GET /_cluster/health", 'POST /INDEX/_search\n{ "query": { "match_all": {} }, "size": 10 }'],
  opensearch: ["GET /_cat/indices?v", "GET /_cluster/health", 'POST /INDEX/_search\n{ "query": { "match_all": {} }, "size": 10 }'],
  couchdb: ["GET /_all_dbs", "GET /DB/_all_docs?include_docs=true&limit=10"],
  clickhouse: ["GET /?query=SHOW TABLES", "GET /?query=SELECT version()"],
  meilisearch: ["GET /indexes", "GET /health"],
  typesense: ["GET /collections", "GET /health"],
  qdrant: ["GET /collections", "GET /"],
  weaviate: ["GET /v1/schema", "GET /v1/meta"],
  chroma: ["GET /api/v1/collections", "GET /api/v1/heartbeat"],
  arangodb: ["GET /_api/database", "GET /_api/collection"],
  influxdb: ["GET /health", "GET /api/v2/buckets"],
  prometheus: ["GET /api/v1/query?query=up", "GET /api/v1/targets"],
};

function httpSchema(cfg) {
  return { kind: "http", hints: HTTP_HINTS[cfg.type] || ["GET /"] };
}

/* ---------------- схема ---------------- */

export async function getSchema(cfg, conn) {
  const fam = famOf(cfg);
  if (fam === "sqlite") return sqliteSchema(conn, cfg);
  if (fam === "http") return httpSchema(cfg);
  const port = await ensureTunnel(cfg.id, conn, cfg.dbHost, cfg.dbPort);
  if (fam === "pg") return pgSchema(port, cfg);
  if (fam === "mysql") return mySchema(port, cfg);
  if (fam === "redis") return redisSchema(port, cfg);
  if (fam === "mongo") return mongoSchema(port, cfg);
  throw new Error("Невідомий тип БД");
}

async function mongoSchema(port, cfg) {
  return withMongo(port, cfg, async (client) => {
    const db = client.db(cfg.database || undefined);
    const colls = await db.listCollections().toArray();
    const tables = [];
    for (const c of colls) {
      if (c.type === "view") continue;
      const sample = await db.collection(c.name).findOne({});
      // pk:false — редагування Mongo-документів у сітці не підтримуємо (лише перегляд)
      const columns = sample
        ? Object.keys(sample).map((k) => ({ name: k, type: mongoType(sample[k]), pk: false }))
        : [{ name: "_id", type: "objectId", pk: false }];
      tables.push({ schema: cfg.database || "db", name: c.name, columns });
    }
    return { kind: "sql", tables };
  });
}

function mongoType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (v instanceof Date) return "date";
  if (v && typeof v === "object" && typeof v.toHexString === "function") return "objectId";
  return typeof v;
}

async function sqliteSchema(conn, cfg) {
  const db = await openSqlite(conn, cfg, true);
  const tblRes = sqliteResult(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const tables = [];
  for (const tr of tblRes.rows) {
    const name = tr.name;
    const info = sqliteResult(db, `PRAGMA table_info(${shqIdent(name)})`);
    const columns = info.rows.map((c) => ({ name: c.name, type: c.type || "", pk: !!c.pk }));
    tables.push({ schema: "main", name, columns });
  }
  return { kind: "sql", tables };
}

function shqIdent(s) {
  return `"${String(s).replace(/"/g, '""')}"`;
}

async function pgSchema(port, cfg) {
  const client = new PgClient({
    host: "127.0.0.1",
    port,
    user: cfg.user || undefined,
    password: cfg.password || undefined,
    database: cfg.database || undefined,
    connectionTimeoutMillis: 12000,
  });
  await client.connect();
  try {
    const cols = await client.query(`
      SELECT table_schema, table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name, ordinal_position`);
    const pks = await client.query(`
      SELECT tc.table_schema, tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'`);
    return buildSqlSchema(cols.rows, pks.rows);
  } finally {
    await client.end().catch(() => {});
  }
}

async function mySchema(port, cfg) {
  const c = await mysql.createConnection({
    host: "127.0.0.1",
    port,
    user: cfg.user || undefined,
    password: cfg.password || undefined,
    database: cfg.database || undefined,
    connectTimeout: 12000,
  });
  try {
    const filter = cfg.database
      ? "table_schema = ?"
      : "table_schema NOT IN ('mysql','information_schema','performance_schema','sys')";
    const params = cfg.database ? [cfg.database] : [];
    const [cols] = await c.query(
      `SELECT table_schema, table_name, column_name, data_type, column_key
       FROM information_schema.columns WHERE ${filter}
       ORDER BY table_schema, table_name, ordinal_position`,
      params,
    );
    const pkRows = cols.filter((r) => r.COLUMN_KEY === "PRI").map((r) => ({
      table_schema: r.TABLE_SCHEMA,
      table_name: r.TABLE_NAME,
      column_name: r.COLUMN_NAME,
    }));
    const colRows = cols.map((r) => ({
      table_schema: r.TABLE_SCHEMA,
      table_name: r.TABLE_NAME,
      column_name: r.COLUMN_NAME,
      data_type: r.DATA_TYPE,
    }));
    return buildSqlSchema(colRows, pkRows);
  } finally {
    await c.end().catch(() => {});
  }
}

function buildSqlSchema(colRows, pkRows) {
  const pkSet = new Set(pkRows.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`));
  const map = new Map();
  for (const r of colRows) {
    const key = `${r.table_schema}.${r.table_name}`;
    if (!map.has(key)) map.set(key, { schema: r.table_schema, name: r.table_name, columns: [] });
    map.get(key).columns.push({
      name: r.column_name,
      type: r.data_type,
      pk: pkSet.has(`${r.table_schema}.${r.table_name}.${r.column_name}`),
    });
  }
  return { kind: "sql", tables: [...map.values()] };
}

async function redisSchema(port, cfg) {
  const r = new Redis({
    host: "127.0.0.1",
    port,
    password: cfg.password || undefined,
    db: parseInt(cfg.database, 10) || 0,
    lazyConnect: true,
    connectTimeout: 12000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  await r.connect();
  try {
    const dbsize = await r.dbsize();
    const [, keys] = await r.scan(0, "COUNT", 300);
    const sample = [];
    for (const k of keys.slice(0, 200)) {
      const type = await r.type(k);
      sample.push({ key: k, type });
    }
    const infoRaw = await r.info();
    const info = {};
    for (const line of infoRaw.split("\n")) {
      const m = line.match(/^([a-z_0-9]+):(.*)$/i);
      if (m && ["redis_version", "used_memory_human", "connected_clients", "uptime_in_days", "role"].includes(m[1]))
        info[m[1]] = m[2].trim();
    }
    return { kind: "redis", dbsize, keys: sample, info };
  } finally {
    r.disconnect();
  }
}

/* ---------------- перегляд таблиці ---------------- */

export async function browseTable(cfg, conn, { schema, table, limit = 100, offset = 0 }) {
  const fam = famOf(cfg);
  limit = Math.max(1, Math.min(500, limit));
  offset = Math.max(0, offset);

  if (fam === "sqlite") {
    const db = await openSqlite(conn, cfg);
    const rel = shqIdent(table);
    const cnt = sqliteResult(db, `SELECT count(*) AS c FROM ${rel}`);
    const r = sqliteResult(db, `SELECT * FROM ${rel} LIMIT ${limit} OFFSET ${offset}`);
    return { columns: r.columns, rows: r.rows, total: cnt.rows[0]?.c ?? r.rows.length };
  }

  const port = await ensureTunnel(cfg.id, conn, cfg.dbHost, cfg.dbPort);

  if (fam === "mongo") {
    return withMongo(port, cfg, async (client) => {
      const db = client.db(cfg.database || undefined);
      const coll = db.collection(table);
      const total = await coll.estimatedDocumentCount();
      const docs = await coll.find({}, { limit, skip: offset }).toArray();
      const r = docsToResult(docs);
      return { columns: r.columns, rows: r.rows, total };
    });
  }

  if (fam === "pg") {
    const client = new PgClient({
      host: "127.0.0.1",
      port,
      user: cfg.user || undefined,
      password: cfg.password || undefined,
      database: cfg.database || undefined,
      connectionTimeoutMillis: 12000,
    });
    await client.connect();
    try {
      const rel = `${qPg(schema)}.${qPg(table)}`;
      const cnt = await client.query(`SELECT count(*)::int AS c FROM ${rel}`);
      const res = await client.query({
        text: `SELECT * FROM ${rel} LIMIT $1 OFFSET $2`,
        values: [limit, offset],
        rowMode: "array",
      });
      const columns = (res.fields || []).map((f) => f.name);
      const rows = (res.rows || []).map((arr) => rowFromArray(columns, arr));
      return { columns, rows, total: cnt.rows[0].c };
    } finally {
      await client.end().catch(() => {});
    }
  }
  if (fam === "mysql") {
    const c = await mysql.createConnection({
      host: "127.0.0.1",
      port,
      user: cfg.user || undefined,
      password: cfg.password || undefined,
      database: cfg.database || undefined,
      connectTimeout: 12000,
      dateStrings: true,
    });
    try {
      const rel = `${qMy(schema)}.${qMy(table)}`;
      const [cntRows] = await c.query(`SELECT count(*) AS c FROM ${rel}`);
      const [rows, fields] = await c.query(`SELECT * FROM ${rel} LIMIT ? OFFSET ?`, [limit, offset]);
      const columns = fields ? fields.map((f) => f.name) : rows[0] ? Object.keys(rows[0]) : [];
      return { columns, rows, total: cntRows[0].c };
    } finally {
      await c.end().catch(() => {});
    }
  }
  throw new Error("Перегляд таблиць доступний лише для SQL-баз");
}

export async function updateRow(cfg, conn, { schema, table, pk, changes }) {
  const fam = famOf(cfg);
  if (fam !== "pg" && fam !== "mysql")
    throw new Error("Редагування рядків доступне лише для PostgreSQL- і MySQL-сумісних баз");
  if (!pk || Object.keys(pk).length === 0) throw new Error("Немає первинного ключа — рядок не редагується");
  if (!changes || Object.keys(changes).length === 0) return { affected: 0 };

  const port = await ensureTunnel(cfg.id, conn, cfg.dbHost, cfg.dbPort);

  if (fam === "pg") {
    const client = new PgClient({
      host: "127.0.0.1",
      port,
      user: cfg.user || undefined,
      password: cfg.password || undefined,
      database: cfg.database || undefined,
      connectionTimeoutMillis: 12000,
    });
    await client.connect();
    try {
      const setCols = Object.keys(changes);
      const pkCols = Object.keys(pk);
      const vals = [];
      const setSql = setCols.map((c) => `${qPg(c)} = $${vals.push(changes[c])}`).join(", ");
      const whereSql = pkCols.map((c) => `${qPg(c)} = $${vals.push(pk[c])}`).join(" AND ");
      const res = await client.query(
        `UPDATE ${qPg(schema)}.${qPg(table)} SET ${setSql} WHERE ${whereSql}`,
        vals,
      );
      return { affected: res.rowCount };
    } finally {
      await client.end().catch(() => {});
    }
  }
  {
    const c = await mysql.createConnection({
      host: "127.0.0.1",
      port,
      user: cfg.user || undefined,
      password: cfg.password || undefined,
      database: cfg.database || undefined,
      connectTimeout: 12000,
    });
    try {
      const setCols = Object.keys(changes);
      const pkCols = Object.keys(pk);
      const vals = [];
      const setSql = setCols.map((col) => (vals.push(changes[col]), `${qMy(col)} = ?`)).join(", ");
      const whereSql = pkCols.map((col) => (vals.push(pk[col]), `${qMy(col)} = ?`)).join(" AND ");
      const [res] = await c.query(
        `UPDATE ${qMy(schema)}.${qMy(table)} SET ${setSql} WHERE ${whereSql}`,
        vals,
      );
      return { affected: res.affectedRows };
    } finally {
      await c.end().catch(() => {});
    }
  }
  throw new Error("Редагування доступне лише для SQL-баз");
}

/* ---------------- автодетект баз на хості ---------------- */

const PORT_TYPE = {
  5432: "postgres",
  3306: "mysql",
  6379: "redis",
  27017: "mongodb",
  8123: "clickhouse",
  9200: "elasticsearch",
  5984: "couchdb",
  7700: "meilisearch",
  8108: "typesense",
  6333: "qdrant",
  8529: "arangodb",
  8086: "influxdb",
  9090: "prometheus",
  26257: "cockroachdb",
  7687: "neo4j",
  9042: "cassandra",
  1433: "mssql",
  11211: "memcached",
  8812: "questdb",
};
const IMAGE_TYPE = [
  [/timescale/i, "timescaledb"],
  [/cockroach/i, "cockroachdb"],
  [/yugabyte/i, "yugabytedb"],
  [/questdb/i, "questdb"],
  [/postgres|postgis|pgvector/i, "postgres"],
  [/mariadb/i, "mariadb"],
  [/mysql|percona/i, "mysql"],
  [/keydb/i, "keydb"],
  [/valkey/i, "valkey"],
  [/dragonfly/i, "dragonfly"],
  [/redis/i, "redis"],
  [/mongo/i, "mongodb"],
  [/clickhouse/i, "clickhouse"],
  [/opensearch/i, "opensearch"],
  [/elasticsearch/i, "elasticsearch"],
  [/couchdb/i, "couchdb"],
  [/meilisearch/i, "meilisearch"],
  [/typesense/i, "typesense"],
  [/qdrant/i, "qdrant"],
  [/weaviate/i, "weaviate"],
  [/chroma/i, "chroma"],
  [/arangodb/i, "arangodb"],
  [/influxdb/i, "influxdb"],
  [/prom\/prometheus|prometheus/i, "prometheus"],
  [/scylla/i, "scylladb"],
  [/cassandra/i, "cassandra"],
  [/memgraph/i, "memgraph"],
  [/neo4j/i, "neo4j"],
  [/memcached/i, "memcached"],
];

const DETECT = `
LANG=C
echo "@@DOCKER@@"
docker ps --format '{{.Image}}|{{.Names}}|{{.Ports}}' 2>/dev/null
echo "@@PORTS@@"
(ss -tlnH 2>/dev/null || netstat -tlnp 2>/dev/null) | awk '{print $4}'
echo "@@FILES@@"
find /home /srv /opt /root /var/www /app /data /usr/local -maxdepth 5 \\
  \\( -path '*/docker/*' -o -name 'containerd' -o -path '*/fwupd/*' -o -path '*/PackageKit/*' \\
     -o -path '*/command-not-found/*' -o -path '*/snapd/*' -o -path '*/dpkg/*' -o -path '*/.cache/*' \\
     -o -path '*/node_modules/*' \\) -prune -o \\
  -type f \\( -name '*.sqlite' -o -name '*.sqlite3' -o -name '*.db' \\) -print 2>/dev/null | head -40
echo "@@END@@"
`.trim();

function splitSections(text) {
  const sections = {};
  let cur = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "").trim();
    const m = line.match(/^@@([A-Z]+)@@$/);
    if (m) {
      cur = m[1];
      sections[cur] = [];
    } else if (cur && line !== "") {
      sections[cur].push(line);
    }
  }
  return sections;
}

export async function detectDatabases(conn) {
  const { stdout } = await conn.exec(DETECT, { timeout: 25000 });
  const sections = splitSections(stdout);
  const found = [];
  const seen = new Set();
  const push = (item) => {
    const key = `${item.type}:${item.dbHost}:${item.dbPort}:${item.dbFile || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(item);
  };

  // Docker-контейнери
  for (const line of sections.DOCKER || []) {
    const [image, names, ports] = line.split("|");
    const match = IMAGE_TYPE.find(([re]) => re.test(image || ""));
    if (!match) continue;
    const type = match[1];
    // Спробуємо витягти опублікований порт (напр. 0.0.0.0:5432->5432/tcp)
    const pub = (ports || "").match(/:(\d+)->/);
    push({
      type,
      dbHost: "127.0.0.1",
      dbPort: pub ? parseInt(pub[1], 10) : enginePort(type),
      name: `${type} · ${names || image}`,
      source: `docker: ${names || image}`,
    });
  }

  // Слухаючі порти
  for (const addr of sections.PORTS || []) {
    const m = String(addr).match(/:(\d+)$/);
    if (!m) continue;
    const port = parseInt(m[1], 10);
    const type = PORT_TYPE[port];
    if (!type) continue;
    push({
      type,
      dbHost: "127.0.0.1",
      dbPort: port,
      name: `${type} · :${port}`,
      source: `порт :${port}`,
    });
  }

  // Файли SQLite
  for (const file of sections.FILES || []) {
    if (!file) continue;
    push({
      type: "sqlite",
      dbHost: "",
      dbPort: 0,
      dbFile: file,
      name: `sqlite · ${file.split("/").pop()}`,
      source: file,
    });
  }

  return found;
}

/* ---------------- утиліти ---------------- */

function rowFromArray(columns, arr) {
  const o = {};
  columns.forEach((c, i) => (o[c] = arr[i]));
  return o;
}

function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function formatRedis(v) {
  if (v === null || v === undefined) return "(nil)";
  if (Array.isArray(v)) return v.map(formatRedis).join(", ");
  if (Buffer.isBuffer(v)) return v.toString("utf8");
  return String(v);
}
