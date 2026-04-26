const express = require("express");
const { loadEnv } = require("./config/env");
const { buildNodeRegistry } = require("./services/node-registry.service");
const { createReplicationService } = require("./services/replication.service");
const { createSyncService } = require("./services/sync.service");
const { createReplicationController } = require("./controllers/replication.controller");
const { buildReplicationRoutes } = require("./routes/replication.routes");

// --- PHẦN NGƯỜI 4 THÊM VÀO ---
// Nạp Service của Người 2 (Database) và Controller/Routes của Người 4
const { dbService } = require("./services/db.service"); 
const { patientController } = require("./controllers/patient.controller");
const { buildPatientRoutes } = require("./routes/patient.routes");
// ----------------------------

const config = loadEnv();
const nodeRegistry = buildNodeRegistry(config);
const replicationService = createReplicationService(config);
const syncService = createSyncService({
  replicationService,
  nodeRegistry,
  config,
});
const replicationController = createReplicationController({ syncService });

// --- KHỞI TẠO LOGIC BỆNH NHÂN (Người 4) ---
// Ráp dbService và replicationService vào PatientController
const pController = patientController(dbService, replicationService);
const patientRoutes = buildPatientRoutes(pController);
// ------------------------------------------

const app = express();
app.use(express.json());

// Kích hoạt các đường dẫn
app.use(buildReplicationRoutes(replicationController)); // Route của người 3
app.use("/api", patientRoutes); // Route của người 4 (Dùng /api/upload-patient,...)

// Endpoint Health Check cho NameNode gọi sang [cite: 33, 179]
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "up",
    node_id: config.nodeId,
    node_url: config.nodeUrl,
    timestamp: new Date().toISOString(),
  });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`[DataNode] ${config.nodeId} đang chạy tại cổng ${config.port}`);
  });
}

module.exports = {
  app,
  config,
  nodeRegistry,
  replicationService,
  syncService,
  pController // Xuất thêm để test nếu cần
};