const express = require('express');
const router = express.Router();
// Nạp file controller vào
const patientController = require('../controllers/patient.controller');

// Định nghĩa các đường dẫn (Endpoints)
// 1. Postman gọi cái này để hỏi: "Lưu bệnh nhân ở đâu?"
router.get('/get-upload-location', patientController.getUploadLocation);

// 2. DataNode gọi cái này để báo: "Đã lưu xong, hãy cập nhật bản đồ Metadata"
router.post('/update-metadata', patientController.updateMetadata);

module.exports = router;