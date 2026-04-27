const axios = require("axios");

const patientController = (dbService, replicationService) => ({
    // 1. Hàm này chỉ làm nhiệm vụ LƯU VÀO DATABASE CỦA DATANODE
    uploadPatient: async (req, res) => {
        try {
            // Nhận dữ liệu từ NameNode bắn sang
            const patientData = {
                ...req.body,
                version: req.body.version || 1,
            };

            console.log(` Đang nhận dữ liệu bệnh nhân: ${patientData.patient_id}`);

            // Lưu vào DB cục bộ của chi nhánh thông qua dbService
            const savedPatient = await dbService.createPatient(patientData);

            return res.status(201).json({
                message: "DataNode đã lưu dữ liệu thành công!",
                patient_id: savedPatient.patient_id
            });
        } catch (err) {
            console.error(" Lỗi tại DataNode:", err.message);
            return res.status(500).json({ error: err.message });
        }
    },


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