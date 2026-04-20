const {
  listDegradedReplications,
  resolveDegradedReplication,
} = require("./replication.store");

function createSyncService({ replicationService, nodeRegistry, config }) {
  async function resyncDegradedRecords() {
    const degradedEntries = listDegradedReplications(config.syncBatchSize);
    if (degradedEntries.length === 0) {
      return { total: 0, recovered: 0, failed: 0, details: [] };
    }

    const details = [];
    let recovered = 0;
    let failed = 0;

    for (const entry of degradedEntries) {
      const replicaNodeUrl =
        entry.replica_node || nodeRegistry.pickReplicaNode([entry.primary_node]);

      if (!replicaNodeUrl || !entry.payload) {
        failed += 1;
        details.push({
          patient_id: entry.patient_id,
          status: "failed",
          reason: "Missing replica node or payload",
        });
        continue;
      }

      const result = await replicationService.retryReplication({
        targetNodeUrl: replicaNodeUrl,
        data: {
          ...entry.payload,
          is_primary: false,
        },
      });

      if (result.ok) {
        recovered += 1;
        resolveDegradedReplication(entry.patient_id);
        await replicationService.notifyNameNode({
          patient_id: entry.patient_id,
          primary_node: entry.primary_node || nodeRegistry.selfUrl,
          replica_node: replicaNodeUrl,
          status: "healthy",
          source: "sync-service",
          updated_at: new Date().toISOString(),
        });
        details.push({
          patient_id: entry.patient_id,
          status: "recovered",
          attempt: result.attempt,
        });
      } else {
        failed += 1;
        details.push({
          patient_id: entry.patient_id,
          status: "failed",
          reason: result.error ? result.error.message : "Sync failed",
        });
      }
    }

    return {
      total: degradedEntries.length,
      recovered,
      failed,
      details,
    };
  }

  return {
    resyncDegradedRecords,
  };
}

module.exports = {
  createSyncService,
};
