const { fetchJson } = require("../../../shared/http-client/fetch-json");
const {
  markDegradedReplication,
  resolveDegradedReplication,
} = require("./replication.store");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error) {
  if (!error) return false;
  if (!error.status) return true;
  return error.status >= 500;
}

function createReplicationService(config) {
  async function notifyNameNode(payload) {
    if (!config.namenodeUrl) return;

    const endpoint = `${config.namenodeUrl}/api/upload`;
    await fetchJson(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async function replicateToNode({ targetNodeUrl, data }) {
    const endpoint = `${targetNodeUrl}/api/replication/replicate`;  
    return fetchJson(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "ngrok-skip-browser-warning": "true"  
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(config.replicationTimeoutMs),
    });
  }

  async function retryReplication({ targetNodeUrl, data }) {
    let lastError = null;

    for (let attempt = 1; attempt <= config.replicationMaxRetries; attempt += 1) {
      try {
        const result = await replicateToNode({ targetNodeUrl, data });
        return { ok: true, attempt, result };
      } catch (error) {
        lastError = error;
        if (!shouldRetry(error) || attempt === config.replicationMaxRetries) break;
        await sleep(300 * attempt);
      }
    }

    return { ok: false, error: lastError };
  }

  async function replicateWithRetry({
    patient,
    primaryNodeUrl,
    replicaNodeUrl,
    statusSource = "datanode",
  }) {
    const data = {
      ...patient,
      is_primary: false,
    };

    const replication = await retryReplication({
      targetNodeUrl: replicaNodeUrl,
      data,
    });

    const metadataPayload = {
      patient_id: patient.patient_id,
      primary_node: primaryNodeUrl,
      replica_node: replicaNodeUrl,
      source: statusSource,
      updated_at: new Date().toISOString(),
    };

    if (replication.ok) {
      resolveDegradedReplication(patient.patient_id);
      await notifyNameNode({
        ...metadataPayload,
        status: "healthy",
      });

      return {
        status: "healthy",
        attempt: replication.attempt,
      };
    }

    markDegradedReplication({
      ...metadataPayload,
      payload: patient,
      reason: replication.error ? replication.error.message : "Replication failed",
    });

    await notifyNameNode({
      ...metadataPayload,
      status: "degraded",
    });

    return {
      status: "degraded",
      error: replication.error ? replication.error.message : "Replication failed",
    };
  }

  return {
    replicateToNode,
    retryReplication,
    replicateWithRetry,
    notifyNameNode,
  };
}

module.exports = {
  createReplicationService,
};
