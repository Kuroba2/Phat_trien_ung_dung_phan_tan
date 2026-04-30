require("dotenv").config();
const path = require("path");

const express = require("express");
const cors = require('cors');
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

app.use(cors());
app.use(express.json());

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "up",
    node_id: config.nodeId,
    node_url: config.nodeUrl,
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/patients", patientRoutes);
app.use("/api/replication", buildReplicationRoutes(replicationController));


if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`[DataNode] ${config.nodeId} đang chạy tại cổng ${config.port}`);
  });
}
app.use((req, res) => {
  console.log(`------------------------------------------`);
  console.log(`[${new Date().toLocaleTimeString()}] ❗ LOG CHECK 404 TẠI DATANODE:`);
  console.log(`- Method: ${req.method}`);
  console.log(`- URL nhận được: ${req.url}`);
  console.log(`- Full Path: ${req.originalUrl}`);
  console.log(`------------------------------------------`);
  res.status(404).json({
    error: "404 Not Found",
    message: " DataNode này không nhận ra cái link này!",
    received_url: req.originalUrl
  });
});

module.exports = {
  app,
  config,
  nodeRegistry,
  replicationService,
  syncService,
  pController
};