// Клієнтський реєстр рушіїв БД (дзеркало server/engines.js).
export type Family = "pg" | "mysql" | "redis" | "mongo" | "sqlite" | "http" | "soon" | "cloud";

export type EngineDef = {
  id: string;
  label: string;
  family: Family;
  port: number;
  cat: string;
  file?: boolean;
};

export const ENGINES: Record<string, EngineDef> = {
  postgres: { id: "postgres", label: "PostgreSQL", family: "pg", port: 5432, cat: "sql" },
  timescaledb: { id: "timescaledb", label: "TimescaleDB", family: "pg", port: 5432, cat: "timeseries" },
  cockroachdb: { id: "cockroachdb", label: "CockroachDB", family: "pg", port: 26257, cat: "sql" },
  yugabytedb: { id: "yugabytedb", label: "YugabyteDB", family: "pg", port: 5433, cat: "sql" },
  questdb: { id: "questdb", label: "QuestDB", family: "pg", port: 8812, cat: "timeseries" },
  redshift: { id: "redshift", label: "Amazon Redshift", family: "pg", port: 5439, cat: "warehouse" },

  mysql: { id: "mysql", label: "MySQL", family: "mysql", port: 3306, cat: "sql" },
  mariadb: { id: "mariadb", label: "MariaDB", family: "mysql", port: 3306, cat: "sql" },

  redis: { id: "redis", label: "Redis", family: "redis", port: 6379, cat: "kv" },
  keydb: { id: "keydb", label: "KeyDB", family: "redis", port: 6379, cat: "kv" },
  valkey: { id: "valkey", label: "Valkey", family: "redis", port: 6379, cat: "kv" },
  dragonfly: { id: "dragonfly", label: "Dragonfly", family: "redis", port: 6379, cat: "kv" },

  mongodb: { id: "mongodb", label: "MongoDB", family: "mongo", port: 27017, cat: "document" },
  sqlite: { id: "sqlite", label: "SQLite", family: "sqlite", port: 0, cat: "sql", file: true },

  elasticsearch: { id: "elasticsearch", label: "Elasticsearch", family: "http", port: 9200, cat: "search" },
  opensearch: { id: "opensearch", label: "OpenSearch", family: "http", port: 9200, cat: "search" },
  couchdb: { id: "couchdb", label: "CouchDB", family: "http", port: 5984, cat: "document" },
  clickhouse: { id: "clickhouse", label: "ClickHouse", family: "http", port: 8123, cat: "warehouse" },
  meilisearch: { id: "meilisearch", label: "Meilisearch", family: "http", port: 7700, cat: "search" },
  typesense: { id: "typesense", label: "Typesense", family: "http", port: 8108, cat: "search" },
  qdrant: { id: "qdrant", label: "Qdrant", family: "http", port: 6333, cat: "vector" },
  weaviate: { id: "weaviate", label: "Weaviate", family: "http", port: 8080, cat: "vector" },
  chroma: { id: "chroma", label: "Chroma", family: "http", port: 8000, cat: "vector" },
  arangodb: { id: "arangodb", label: "ArangoDB", family: "http", port: 8529, cat: "multi" },
  influxdb: { id: "influxdb", label: "InfluxDB", family: "http", port: 8086, cat: "timeseries" },
  prometheus: { id: "prometheus", label: "Prometheus", family: "http", port: 9090, cat: "timeseries" },

  mssql: { id: "mssql", label: "MS SQL Server", family: "soon", port: 1433, cat: "sql" },
  oracle: { id: "oracle", label: "Oracle", family: "soon", port: 1521, cat: "sql" },
  cassandra: { id: "cassandra", label: "Cassandra", family: "soon", port: 9042, cat: "wide" },
  scylladb: { id: "scylladb", label: "ScyllaDB", family: "soon", port: 9042, cat: "wide" },
  neo4j: { id: "neo4j", label: "Neo4j", family: "soon", port: 7687, cat: "graph" },
  memgraph: { id: "memgraph", label: "Memgraph", family: "soon", port: 7687, cat: "graph" },
  memcached: { id: "memcached", label: "Memcached", family: "soon", port: 11211, cat: "kv" },
  milvus: { id: "milvus", label: "Milvus", family: "soon", port: 19530, cat: "vector" },

  dynamodb: { id: "dynamodb", label: "DynamoDB", family: "cloud", port: 0, cat: "cloud" },
  bigquery: { id: "bigquery", label: "BigQuery", family: "cloud", port: 0, cat: "cloud" },
  snowflake: { id: "snowflake", label: "Snowflake", family: "cloud", port: 0, cat: "cloud" },
  firebase: { id: "firebase", label: "Firebase", family: "cloud", port: 0, cat: "cloud" },
  firestore: { id: "firestore", label: "Firestore", family: "cloud", port: 0, cat: "cloud" },
  pinecone: { id: "pinecone", label: "Pinecone", family: "cloud", port: 0, cat: "cloud" },
  neptune: { id: "neptune", label: "AWS Neptune", family: "cloud", port: 8182, cat: "graph" },
};

// Порядок категорій у списку
export const CATEGORIES = [
  "sql",
  "timeseries",
  "warehouse",
  "document",
  "kv",
  "search",
  "vector",
  "wide",
  "graph",
  "multi",
  "cloud",
] as const;

export const CAT_LABEL: Record<string, string> = {
  sql: "SQL / реляційні",
  timeseries: "Часові ряди",
  warehouse: "Аналітичні (OLAP)",
  document: "Документні",
  kv: "Ключ-значення",
  search: "Пошукові",
  vector: "Векторні",
  wide: "Wide-column",
  graph: "Графові",
  multi: "Мульти-модель",
  cloud: "Хмарні (через SDK, не SSH)",
};

const CAT_ACCENT: Record<string, string> = {
  sql: "#7fb0d8",
  timeseries: "#86c29a",
  warehouse: "#d8a45f",
  document: "#86c29a",
  kv: "#d86a5f",
  search: "#e0c05f",
  vector: "#b99bd8",
  wide: "#d89a5f",
  graph: "#8fd0c0",
  multi: "#c0a0d8",
  cloud: "#9aa3b2",
};

export function engineOf(id: string): EngineDef {
  return ENGINES[id] ?? { id, label: id, family: "soon", port: 0, cat: "sql" };
}
export function engineAccent(id: string): string {
  return CAT_ACCENT[engineOf(id).cat] ?? "#9aa3b2";
}
export function familyOf(id: string): Family {
  return engineOf(id).family;
}
export function isFileBased(id: string): boolean {
  return !!engineOf(id).file;
}
// Редагування рядків підтримують лише SQL-родини на дротовому протоколі
export function isEditable(id: string): boolean {
  const f = familyOf(id);
  return f === "pg" || f === "mysql";
}
// Вкладка «Дані» (таблиця/колекція) є для табличних/документних баз
export function hasDataTab(id: string): boolean {
  return ["pg", "mysql", "mongo", "sqlite"].includes(familyOf(id));
}
export function isConnectable(id: string): boolean {
  const f = familyOf(id);
  return f !== "soon" && f !== "cloud";
}

export function groupedEngines(): { cat: string; label: string; items: EngineDef[] }[] {
  return CATEGORIES.map((cat) => ({
    cat,
    label: CAT_LABEL[cat] ?? cat,
    items: Object.values(ENGINES).filter((e) => e.cat === cat),
  })).filter((g) => g.items.length > 0);
}
