const express = require("express");

const buildPatientRoutes = (controller) => {
    const router = express.Router();
    
    router.post("/upload-patient", controller.uploadPatient);
    router.get("/view-patient", controller.getPatient); 
    router.get("/search", controller.getPatient); // Giả sử dùng chung logic tìm kiếm [cite: 62]
    
    return router;
};

module.exports = { buildPatientRoutes };