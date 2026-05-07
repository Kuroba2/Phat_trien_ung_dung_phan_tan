const { upsertReplicaRecord, listDegradedReplications } = require("../services/replication.store");
const { getPool, sql } = require("../config/db");

function isValidReplicationPayload(body) {
  if (!body || typeof body !== "object") return false;
  if (!body.patient_id || typeof body.patient_id !== "string") return false;
  if (body.version === undefined || typeof body.version !== "number") return false;
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
      const pool = await getPool();
      const request = pool.request();
      request.input('patient_id', sql.VarChar(20), payload.patient_id);
      request.input('name', sql.NVarChar(255), payload.name);
      request.input('symptom', sql.NVarChar(1000), payload.symptom || null);
      request.input('facility', sql.VarChar(50), payload.facility);
      request.input('is_primary', sql.Bit, false);
      request.input('version', sql.Int, payload.version || 1);

      await request.query(`
        MERGE INTO dbo.patients AS target
        USING (SELECT @patient_id as patient_id) AS source
        ON target.patient_id = source.patient_id
        WHEN MATCHED AND @version >= target.version THEN
          UPDATE SET
            name = @name,
            symptom = @symptom,
            facility = @facility,
            is_primary = @is_primary,
            version = @version
        WHEN NOT MATCHED THEN
          INSERT (patient_id, name, symptom, facility, is_primary, version)
          VALUES (@patient_id, @name, @symptom, @facility, @is_primary, @version);
      `);

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

  async function listDegraded(_req, res) {
    try {
      const queue = listDegradedReplications();
      return res.status(200).json({
        queue: queue
      });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to list degraded replications",
        error: error.message
      });
    }
  }

  return {
    replicate,
    syncNow,
    listDegraded
  };
}

module.exports = {
  createReplicationController,
};