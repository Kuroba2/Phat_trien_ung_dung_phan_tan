const axios = require("axios");


const patientController = (dbService, replicationService) => ({
    // Lưu xong tự động đẩy sang máy tiếp theo trong chuỗi
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
            const existing = await dbService.getPatientById(patientData.patient_id);
            if (!existing) {
                await dbService.createPatient(patientData);
                console.log(` Đã lưu mới thành công.`);
            } else {
                console.log(` Bệnh nhân đã tồn tại, bỏ qua bước lưu để tránh lỗi PK.`);
            }


            // BƯỚC B: LOGIC PIPELINE - Nếu mình là máy CHÍNH và NameNode có chỉ định máy PHỤ
            if (is_primary && replica_url) {
                console.log(` Pipeline: Đang chuyển tiếp dữ liệu sang máy phụ: ${replica_url}`);

                try {
                    const cleanUrl = replica_url.replace(/\/$/, "");
                    // Máy chính đóng vai trò "Shipper" gọi sang máy phụ
                    const replicaRes = await axios.post(`${cleanUrl}/api/upload-patient`, {
                        ...patientData,
                        is_primary: 0,    // Đánh dấu cho máy kia biết nó là máy phụ
                        replica_url: null // Ngắt chuỗi để không lặp vô tận
                    }, {
                        timeout: 10000,
                        headers: {
                            'ngrok-skip-browser-warning': 'true',
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    });

                    console.log(" Máy phụ phản hồi:", replicaRes.data.message);
                } catch (replicaErr) {
                    console.error(" Lỗi Pipeline: Không thể đẩy dữ liệu sang máy phụ!");
                    throw new Error("Lỗi sao chép dữ liệu sang máy phụ: " + replicaErr.message);
                }
            }

            // BƯỚC C: Phản hồi về cho NameNode khi tất cả đã xong
            return res.status(201).json({
                message: (is_primary && replica_url)
                    ? "Hệ thống đã lưu thành công trên cả chuỗi Chính & Phụ!"
                    : "DataNode đã lưu dữ liệu thành công!",
                patient_id: patientData.patient_id
            });

        } catch (err) {
            console.error(" Lỗi tại DataNode khi xử lý ghi:", err.message);
            return res.status(500).json({ error: "Lỗi ghi Database: " + err.message });
        }
    },

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

    getTodayPatientStats: async (_req, res) => {
        try {
            const total = await dbService.countPatientsCreatedToday();

            return res.json({
                total,
                scope: 'primary_records',
                date_utc: new Date().toISOString().slice(0, 10)
            });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    },


    updatePatient: async (req, res) => {
        try {
            const id = req.query.id;

            // 1. TÁCH REPLICA_URL RA KHỎI DỮ LIỆU UPDATE
            // Dấu ...updateData sẽ gom tất cả các trường còn lại (name, age...) vào 1 biến sạch
            const { replica_url, ...updateData } = req.body;

            if (!id) return res.status(400).json({ error: "Thiếu ID" });

            // 2. Máy Chính tự Update bằng cục dữ liệu ĐÃ LÀM SẠCH
            await dbService.updatePatient(id, updateData);

            // 3. Chuyển tiếp sang Máy Phụ (Nếu có)
            let isReplicaSuccess = true;
            if (replica_url) {
                try {
                    // CHỈ GỬI ĐI updateData SẠCH (Không còn chứa replica_url bên trong nữa)
                    const targetUrl = `${replica_url}/api/update-patient?id=${id}`;
                    await replicationService.replicateWithRetry(targetUrl, 'PUT', updateData);
                } catch (err) {
                    console.warn(`[CẢNH BÁO] Replica sập, đã đưa vào hàng đợi Sync Service: ${err.message}`);
                    isReplicaSuccess = false; // Đánh dấu degraded
                }
            }

            // 4. Trả kết quả
            res.json({
                message: "DataNode Chính: Cập nhật thành công!",
                replica_success: isReplicaSuccess
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // TRONG patient.controller.js CỦA DATANODE

    // TRONG patient.controller.js CỦA DATANODE

    deletePatient: async (req, res) => {
        try {
            const id = req.query.id;
            const replica_url = req.query.replica_url; // Lấy địa chỉ máy phụ từ query do NameNode gửi

            if (!id) return res.status(400).json({ error: "Thiếu ID" });

            // 1. Máy Chính tự xóa dữ liệu của nó trước
            await dbService.deletePatient(id);

            let isReplicaSuccess = true;

            // 2. Chuyển tiếp lệnh xóa sang Máy Phụ thông qua Hàng đợi (Replication Service)
            if (replica_url) {
                try {
                    const targetUrl = `${replica_url}/api/delete-patient?id=${id}`;

                    // THAY THẾ axios.delete BẰNG replicationService
                    // Tham số: URL, HTTP Method ('DELETE'), và Dữ liệu body (null vì delete không cần body)
                    await replicationService.replicateWithRetry(targetUrl, 'DELETE', null);

                } catch (err) {
                    // MÁY PHỤ HỎNG: Đã được replicationService ném vào hàng đợi tự động
                    console.warn(`[CẢNH BÁO] Replica sập khi xóa, đã đưa vào hàng đợi Sync Service: ${err.message}`);
                    isReplicaSuccess = false; // Đánh dấu degraded
                }
            }

            // 3. Trả báo cáo về cho NameNode bằng cờ boolean
            res.json({
                message: "DataNode Chính: Đã xóa bệnh nhân!",
                replica_success: isReplicaSuccess
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },
});

module.exports = { patientController };