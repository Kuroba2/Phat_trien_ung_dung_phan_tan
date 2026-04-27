const axios = require("axios");

const patientController = (dbService, replicationService) => ({
    uploadPatient: async (req, res) => {
        try {
            // Kiểm tra dữ liệu đầu vào cơ bản
            if (!req.body.patient_id) {
                return res.status(400).json({ error: "Thiếu patient_id!" });
            }

            const patientData = {
                patient_id: req.body.patient_id,
                name: req.body.name || "Không rõ",
                symptom: req.body.symptom || "",
                facility: req.body.facility || "",
                version: req.body.version || 1,
                is_primary: req.body.is_primary // Để biết mình là chính hay phụ
            };

            console.log(` DataNode đang ghi bản ghi: ${patientData.patient_id}`);

            // Lưu vào Database
            await dbService.createPatient(patientData);

            // Phản hồi cho NameNode biết là tôi đã xong việc
            return res.status(201).json({
                message: "DataNode đã lưu dữ liệu thành công!",
                patient_id: patientData.patient_id
            });
        } catch (err) {
            console.error(" Lỗi tại DataNode khi xử lý ghi:", err.message);
            return res.status(500).json({ error: "Lỗi ghi Database: " + err.message });
        }
    },
    
    // Đừng quên hàm searchPatient bên dưới nhé Huy!


    // 2. Hàm lấy chi tiết bệnh nhân 
    getPatient: async (req, res) => {
        try {
            const patient = await dbService.getPatientById(req.query.id);
            if (!patient) return res.status(404).json({ message: "Không tìm thấy" });
            return res.json(patient);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },



    // 3. Hàm tìm kiếm phục vụ truy vấn phân tán 
    searchPatient: async (req, res) => {
        try {
            const { name } = req.query;
            const patients = await dbService.searchByName(name);
            return res.json(patients);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },
});

module.exports = { patientController };