const records = new Map();
const degradedQueue = new Map();

function upsertReplicaRecord(payload) {
  const existing = records.get(payload.patient_id);

  if (!existing) {
    const next = {
      ...payload,
      is_primary: false,
      updated_at: new Date().toISOString(),
    };
    records.set(payload.patient_id, next);
    return { action: "inserted", record: next };
  }

  if ((payload.version || 0) > (existing.version || 0)) {
    const next = {
      ...existing,
      ...payload,
      is_primary: false,
      updated_at: new Date().toISOString(),
    };
    records.set(payload.patient_id, next);
    return { action: "updated", record: next };
  }

  return { action: "ignored", record: existing };
}

function markDegradedReplication(entry) {
  degradedQueue.set(entry.patient_id, {
    ...entry,
    queued_at: new Date().toISOString(),
  });
}

function resolveDegradedReplication(patientId) {
  degradedQueue.delete(patientId);
}

function listDegradedReplications(limit = 100) {
  return Array.from(degradedQueue.values()).slice(0, limit);
}

module.exports = {
  upsertReplicaRecord,
  markDegradedReplication,
  resolveDegradedReplication,
  listDegradedReplications,
};
