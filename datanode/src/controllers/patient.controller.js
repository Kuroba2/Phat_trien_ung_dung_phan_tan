const axios = require("axios");

const patientController = (dbService, replicationService) => ({
    // 1. Hàm đã nâng cấp: Lưu xong tự động đẩy sang máy tiếp theo trong chuỗi
    uploadPatient: async (req, res) => {
        try {
            // Lấy thêm replica_url và is_primary từ NameNode gửi sang
            const { replica_url, is_primary, ...data } = req.body;

            const patientData = {
                ...data,
                version: req.body.version || 1,
                is_primary: req.body.is_primary // Để biết mình là chính hay phụ
            };

            console.log(` Đang nhận dữ liệu BN: ${patientData.patient_id} (${is_primary ? 'MÁY CHÍNH' : 'MÁY PHỤ'})`);

            // BƯỚC A: Lưu vào DB cục bộ của chính máy này thông qua dbService
            const savedPatient = await dbService.createPatient(patientData);
            console.log(` Đã lưu thành công vào SQL máy mình.`);

            // BƯỚC B: LOGIC PIPELINE - Nếu mình là máy CHÍNH và NameNode có chỉ định máy PHỤ
            if (is_primary && replica_url) {
                console.log(` Pipeline: Đang chuyển tiếp dữ liệu sang máy phụ: ${replica_url}`);
                
                try {
                    const cleanUrl = replica_url.replace(/\/$/, "");
                    // Máy chính đóng vai trò "Shipper" gọi sang máy phụ
                    const replicaRes = await axios.post(`${cleanUrl}/api/upload-patient`, {
                        ...patientData,
                        is_primary: 0,    // Đánh dấu cho máy kia biết nó là máy phụ
                        replica_url: null // Quan trọng: Ngắt chuỗi để không lặp vô tận
                    }, { 
                        timeout: 5000,
                        headers: { 'ngrok-skip-browser-warning': 'true' } 
                    });
                    
                    console.log(" Máy phụ phản hồi:", replicaRes.data.message);
                } catch (replicaErr) {
                    console.error(" Lỗi Pipeline: Không thể đẩy dữ liệu sang máy phụ!");
                    // Nếu muốn Strong Consistency, ta có thể throw lỗi ở đây để NameNode biết
                    throw new Error("Lỗi sao chép dữ liệu sang máy phụ: " + replicaErr.message);
                }
            }

            // BƯỚC C: Phản hồi về cho NameNode khi tất cả đã xong
            return res.status(201).json({
                message: (is_primary && replica_url) 
                    ? "Hệ thống đã lưu thành công trên cả chuỗi Chính & Phụ!" 
                    : "DataNode đã lưu dữ liệu thành công!",
                patient_id: savedPatient.patient_id
            });

        } catch (err) {
            console.error(" Lỗi tại DataNode khi xử lý ghi:", err.message);
            return res.status(500).json({ error: "Lỗi ghi Database: " + err.message });
        }
    },
    
    // Đừng quên hàm searchPatient bên dưới nhé Huy!

    // 2. Hàm lấy chi tiết bệnh nhân (Giữ nguyên)
    getPatient: async (req, res) => {
        try {
            const patient = await dbService.getPatientById(req.query.id);
            if (!patient) return res.status(404).json({ message: "Không tìm thấy" });
            return res.json(patient);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },

    // 3. Hàm tìm kiếm phục vụ truy vấn phân tán (Giữ nguyên)
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