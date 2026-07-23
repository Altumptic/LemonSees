// Реєстр рушіїв БД. family визначає, який адаптер використовує сервер:
//   pg      — протокол PostgreSQL (драйвер pg)
//   mysql   — протокол MySQL (драйвер mysql2)
//   redis   — протокол RESP (драйвер ioredis)
//   mongo   — MongoDB (драйвер mongodb)
//   sqlite  — файл, читається по SSH і відкривається локально (sql.js)
//   http    — універсальна REST-консоль поверх тунелю
//   soon    — потрібен окремий драйвер (поки лише позначка)
//   cloud   — керована хмарна БД, недоступна через SSH-тунель
export const ENGINES = {
  // PostgreSQL-сумісні
  postgres: { label: "PostgreSQL", family: "pg", port: 5432, cat: "sql" },
  timescaledb: { label: "TimescaleDB", family: "pg", port: 5432, cat: "timeseries" },
  cockroachdb: { label: "CockroachDB", family: "pg", port: 26257, cat: "sql" },
  yugabytedb: { label: "YugabyteDB", family: "pg", port: 5433, cat: "sql" },
  questdb: { label: "QuestDB", family: "pg", port: 8812, cat: "timeseries" },
  redshift: { label: "Amazon Redshift", family: "pg", port: 5439, cat: "warehouse" },

  // MySQL-сумісні
  mysql: { label: "MySQL", family: "mysql", port: 3306, cat: "sql" },
  mariadb: { label: "MariaDB", family: "mysql", port: 3306, cat: "sql" },

  // Redis-сумісні
  redis: { label: "Redis", family: "redis", port: 6379, cat: "kv" },
  keydb: { label: "KeyDB", family: "redis", port: 6379, cat: "kv" },
  valkey: { label: "Valkey", family: "redis", port: 6379, cat: "kv" },
  dragonfly: { label: "Dragonfly", family: "redis", port: 6379, cat: "kv" },

  // Документні / файл
  mongodb: { label: "MongoDB", family: "mongo", port: 27017, cat: "document" },
  sqlite: { label: "SQLite", family: "sqlite", port: 0, cat: "sql", file: true },

  // HTTP / REST
  elasticsearch: { label: "Elasticsearch", family: "http", port: 9200, cat: "search" },
  opensearch: { label: "OpenSearch", family: "http", port: 9200, cat: "search" },
  couchdb: { label: "CouchDB", family: "http", port: 5984, cat: "document" },
  clickhouse: { label: "ClickHouse", family: "http", port: 8123, cat: "warehouse" },
  meilisearch: { label: "Meilisearch", family: "http", port: 7700, cat: "search" },
  typesense: { label: "Typesense", family: "http", port: 8108, cat: "search" },
  qdrant: { label: "Qdrant", family: "http", port: 6333, cat: "vector" },
  weaviate: { label: "Weaviate", family: "http", port: 8080, cat: "vector" },
  chroma: { label: "Chroma", family: "http", port: 8000, cat: "vector" },
  arangodb: { label: "ArangoDB", family: "http", port: 8529, cat: "multi" },
  influxdb: { label: "InfluxDB", family: "http", port: 8086, cat: "timeseries" },
  prometheus: { label: "Prometheus", family: "http", port: 9090, cat: "timeseries" },

  // Потрібен окремий драйвер (позначка)
  mssql: { label: "MS SQL Server", family: "soon", port: 1433, cat: "sql" },
  oracle: { label: "Oracle", family: "soon", port: 1521, cat: "sql" },
  cassandra: { label: "Cassandra", family: "soon", port: 9042, cat: "wide" },
  scylladb: { label: "ScyllaDB", family: "soon", port: 9042, cat: "wide" },
  neo4j: { label: "Neo4j", family: "soon", port: 7687, cat: "graph" },
  memgraph: { label: "Memgraph", family: "soon", port: 7687, cat: "graph" },
  memcached: { label: "Memcached", family: "soon", port: 11211, cat: "kv" },
  milvus: { label: "Milvus", family: "soon", port: 19530, cat: "vector" },

  // Хмарні (через ключі API, не через SSH)
  dynamodb: { label: "DynamoDB", family: "cloud", port: 0, cat: "cloud" },
  bigquery: { label: "BigQuery", family: "cloud", port: 0, cat: "cloud" },
  snowflake: { label: "Snowflake", family: "cloud", port: 0, cat: "cloud" },
  firebase: { label: "Firebase", family: "cloud", port: 0, cat: "cloud" },
  firestore: { label: "Firestore", family: "cloud", port: 0, cat: "cloud" },
  pinecone: { label: "Pinecone", family: "cloud", port: 0, cat: "cloud" },
  neptune: { label: "AWS Neptune", family: "cloud", port: 8182, cat: "graph" },
};

export function engineFamily(type) {
  return ENGINES[type]?.family ?? null;
}

export function enginePort(type) {
  return ENGINES[type]?.port ?? 0;
}
