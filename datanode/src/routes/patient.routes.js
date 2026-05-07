const express = require("express");

const buildPatientRoutes = (controller) => {
    const router = express.Router();

    router.post("/upload-patient", controller.uploadPatient);
    router.get("/view-patient", controller.getPatient);
    router.get("/search", controller.searchPatient);
    router.get("/stats/today", controller.getTodayPatientStats);
    router.put("/update-patient", controller.updatePatient);
    router.delete("/delete-patient", controller.deletePatient);

    return router;
};

module.exports = { buildPatientRoutes };