const path = require("path");

const nodeInstance = process.env.NODE_INSTANCE || "1";
const envFilePath = path.join(__dirname, `../../env/datanode_${nodeInstance}.env`);
require("dotenv").config({ path: envFilePath });

const express = require("express");
const { loadEnv } = require("./config/env");
const { buildNodeRegistry } = require("./services/node-registry.service");
const { createReplicationService } = require("./services/replication.service");
const { createSyncService } = require("./services/sync.service");
const { createReplicationController } = require("./controllers/replication.controller");
const { buildReplicationRoutes } = require("./routes/replication.routes");

const { dbService } = require("./services/db.service"); 
const { patientController } = require("./controllers/patient.controller");
const { buildPatientRoutes } = require("./routes/patient.routes");

const config = loadEnv();
const nodeRegistry = buildNodeRegistry(config);
const replicationService = createReplicationService(config);
const syncService = createSyncService({
  replicationService,
  nodeRegistry,
  config,
});
const replicationController = createReplicationController({ syncService });

const pController = patientController(dbService, replicationService);
const patientRoutes = buildPatientRoutes(pController);

const app = express();
app.use(express.json());

app.use(buildReplicationRoutes(replicationController));
app.use("/api", patientRoutes);

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