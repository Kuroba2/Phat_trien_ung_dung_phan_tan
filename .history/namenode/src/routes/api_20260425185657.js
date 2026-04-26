const express = require('express');
const router = express.Router();
// Nạp file controller vào
const patientController = require('../controllers/patient.controller');

// --- CÁC ĐƯỜNG DẪN API CHO NAMENODE ---

// 1. Postman/Client gọi để hỏi: "Lưu bệnh nhân mới ở đâu?"
// Trả về IP máy Primary và Replica theo thuật toán Round Robin
router.get('/get-upload-location', patientController.getUploadLocation);

// 2. DataNode gọi để báo: "Tôi đã lưu xong, hãy ghi lại bản đồ vào Metadata DB"
// Dùng sau khi DataNode đã thực hiện xong lưu trữ và sao lưu
router.post('/update-metadata', patientController.updateMetadata);

// 3. Tìm kiếm bệnh nhân theo tên (Truy vấn phân tán)
// NameNode sẽ nhận yêu cầu này và gọi đồng thời tới 3 DataNode để lấy kết quả
router.get('/search', patientController.searchPatient);

module.exports = router;