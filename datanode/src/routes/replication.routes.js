const express = require("express");

function buildReplicationRoutes(replicationController) {
  const router = express.Router();

  router.post("/replicate", replicationController.replicate);
  router.post("/internal/sync", replicationController.syncNow);
  router.get("/degraded-list", replicationController.listDegraded);
  
  return router;
}

module.exports = {
  buildReplicationRoutes,
};
