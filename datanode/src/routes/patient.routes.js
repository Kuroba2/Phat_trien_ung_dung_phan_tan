const express = require("express");

const buildPatientRoutes = (controller) => {
    const router = express.Router();
    
    router.post("/upload-patient", controller.uploadPatient);
    router.post("/api/upload-patient", controller.uploadPatient); // Cửa 2 (Dự phòng nếu máy Chính cộng chuỗi sai)
    router.post("/", controller.uploadPatient);
    router.get("/view-patient", controller.getPatient); 
    router.get("/search", controller.searchPatient);
    
    return router;
};

module.exports = { buildPatientRoutes };