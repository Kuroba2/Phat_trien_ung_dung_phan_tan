const { upsertReplicaRecord } = require("../services/replication.store");

function isValidReplicationPayload(body) {
  if (!body || typeof body !== "object") return false;
  if (!body.patient_id || typeof body.patient_id !== "string") return false;
  if (typeof body.version !== "number") return false;
  return true;
}

function createReplicationController({ syncService }) {
  async function replicate(req, res) {
    const payload = req.body;
    if (!isValidReplicationPayload(payload)) {
      return res.status(400).json({
        message: "Invalid replication payload",
        required: ["patient_id", "version"],
      });
    }

    try {
      const result = upsertReplicaRecord(payload);
      return res.status(200).json({
        message: "Replication handled",
        action: result.action,
        patient_id: payload.patient_id,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to process replication",
        error: error.message,
      });
    }
  }

  async function syncNow(_req, res) {
    try {
      const result = await syncService.resyncDegradedRecords();
      return res.status(200).json({
        message: "Sync completed",
        ...result,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Sync failed",
        error: error.message,
      });
    }
  }

  return {
    replicate,
    syncNow,
  };
}

module.exports = {
  createReplicationController,
};
