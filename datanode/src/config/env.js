const DEFAULT_REPLICATION_TIMEOUT_MS = 2000;
const DEFAULT_REPLICATION_MAX_RETRIES = 3;
const DEFAULT_HEALTH_TIMEOUT_MS = 2000;

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeNodeUrl(url) {
  if (!url) return "";
  return String(url).trim().replace(/\/+$/, "");
}

function loadNodeRegistry() {
  const rawNodeList = process.env.ALL_NODE_URLS || "";
  const listFromAllNodeUrls = rawNodeList
    .split(",")
    .map((item) => normalizeNodeUrl(item))
    .filter(Boolean);

  const envNodeUrls = [
    process.env.NODE_1_URL,
    process.env.NODE_2_URL,
    process.env.NODE_3_URL,
  ]
    .map((item) => normalizeNodeUrl(item))
    .filter(Boolean);

  const combined = [...listFromAllNodeUrls, ...envNodeUrls];
  return [...new Set(combined)];
}

function loadEnv() {
  return {
    nodeId: process.env.NODE_ID || process.env.NODE_NAME || "datanode-unknown",
    nodeUrl: normalizeNodeUrl(process.env.NODE_URL),
    port: parseInteger(process.env.PORT, 3001),
    namenodeUrl: normalizeNodeUrl(process.env.NAMENODE_URL),
    replicationTimeoutMs: parseInteger(
      process.env.REPLICATION_TIMEOUT_MS,
      DEFAULT_REPLICATION_TIMEOUT_MS
    ),
    replicationMaxRetries: parseInteger(
      process.env.REPLICATION_MAX_RETRIES,
      DEFAULT_REPLICATION_MAX_RETRIES
    ),
    healthTimeoutMs: parseInteger(
      process.env.HEALTH_TIMEOUT_MS,
      DEFAULT_HEALTH_TIMEOUT_MS
    ),
    syncBatchSize: parseInteger(process.env.SYNC_BATCH_SIZE, 100),
    nodeRegistry: loadNodeRegistry(),
  };
}

module.exports = {
  loadEnv,
};
