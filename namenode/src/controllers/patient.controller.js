const { poolPromise, sql } = require('../config/database');
const axios = require('axios');
let currentIndex = 0;

const patientController = {
    getPatientUploadLocation: async (req, res) => {
        const availableNodes = Object.keys(global.nodeStatus).filter(
            nodeIp => global.nodeStatus[nodeIp] === 'UP'
        );

        if (availableNodes.length === 0) {
            return res.status(503).json({ error: "Tất cả chi nhánh đều đang sập!" });
        }

        const primary = availableNodes[currentIndex % availableNodes.length];
        currentIndex++;

        let replica = null;
        if (availableNodes.length > 1) {
            const replicaIndex = (availableNodes.indexOf(primary) + 1) % availableNodes.length;
            replica = availableNodes[replicaIndex];
        }

        res.json({
            primary: primary,
            replica: replica,
            available_nodes: availableNodes.length
        });
    },

    uploadPatient: async (req, res) => {

        try {
            const { patient_id, primary_node, replica_node, status, version, name, symptom, facility } = req.body;


            // 1. Lưu vào SQL của NameNode (Metadata)
            const pool = await poolPromise;
            const checkExist = await pool.request()
                .input('id', sql.VarChar, patient_id)
                .query("SELECT patient_id FROM dbo.metadata WHERE patient_id = @id");

            if (checkExist.recordset.length > 0) {
                return res.status(400).json({
                    error: "Conflict",
                    message: `Mã bệnh nhân ${patient_id} đã tồn tại trên hệ thống!`
                });
            }
            await pool.request()
                .input('id', sql.VarChar, patient_id)
                .input('p_node', sql.VarChar, primary_node)
                .input('r_node', sql.VarChar, replica_node)
                .input('status', sql.VarChar, status)
                .input('ver', sql.Int, version || 1)
                .query(`
                    INSERT INTO dbo.metadata (patient_id, primary_node, replica_node, status, version, updated_at)
                    VALUES (@id, @p_node, @r_node, @status, @ver, SYSUTCDATETIME());
        `);

            // 2. Tự động đồng bộ xuống các DataNode
            try {
                const axiosConfig = {
                    headers: { 'ngrok-skip-browser-warning': 'true' },
                    timeout: 5000
                };
                const patientData = { patient_id, name, symptom, facility };
                if (primary_node) {
                    const cleanPrimaryUrl = primary_node.replace(/\/$/, ""); // Xóa dấu / ở cuối nếu có
                    const primaryPath = `${cleanPrimaryUrl}/api/patients/upload-patient`;
                    console.log(` NameNode gửi tới Primary: ${primaryPath}`);
                    console.log(` Yêu cầu Primary sau đó gửi tiếp cho: ${replica_node}`);

                    try {
                        const resPrimary = await axios.post(primaryPath,
                            { ...patientData, is_primary: 1, replica_url: replica_node },
                            { timeout: 10000, headers: { 'ngrok-skip-browser-warning': 'true' } }
                        );
                        console.log(" Hệ thống phản hồi (Đã lưu xong cả Chính & Phụ):", resPrimary.data.message || "OK");
                        return res.status(200).json({
                            message: "Đã lưu thành công trên toàn bộ chuỗi Pipeline!",
                            details: resPrimary.data
                        });
                    } catch (err) {
                        console.error(" Lỗi tại Primary:");

                        // LẤY THÔNG TIN LỖI CHI TIẾT
                        const errorStatus = err.response ? err.response.status : 500;
                        const errorMessage = err.response ? err.response.data.error : err.message;

                        // Phải trả về lỗi cho Client (Postman)
                        return res.status(errorStatus).json({
                            error: "Pipeline thất bại! Dữ liệu chưa được lưu đồng bộ.",
                            reason: errorMessage
                        });

                    }


                }

                console.log(` Hoàn tất xử lý đồng bộ cho bệnh nhân: ${patient_id}`);

            } catch (sendErr) {
                // Đây là catch tổng cho toàn bộ quá trình xử lý logic gửi tin
                const statusErr = sendErr.response ? sendErr.response.status : "OFFLINE";
                console.error(` Lỗi hệ thống khi đồng bộ: ${statusErr} - ${sendErr.message}`);
                if (statusErr === 404) {
                    console.log(" Nhắc bạn: Kiểm tra xem DataNode đã có route '/api/upload-patient' chưa!");
                }
            }

            res.status(200).json({
                message: "Cập nhật Metadata hoàn tất!",
                sync_details: {
                    primary: primary_node, // Đây là link máy chính
                    replica: replica_node  // Đây là link máy phụ
                }
            });
        } catch (err) {
            console.error(" Lỗi Metadata SQL:", err.message);
            res.status(500).json({ error: "Lỗi lưu Metadata: " + err.message });
        }
    },

    searchPatient: async (req, res) => {
        try {
            const { name } = req.query;
            console.log(` NameNode đang phát lệnh tìm kiếm tên: ${name}`);

            // 1. Lấy danh sách các máy DataNode từ DB Metadata (Cách này chắc chắn hơn global variable)
            const pool = await poolPromise;
            const nodesResult = await pool.request().query("SELECT DISTINCT primary_node FROM dbo.metadata");

            // Chuyển thành mảng các URL sạch (không có dấu / ở cuối)
            const nodeList = nodesResult.recordset.map(n => n.primary_node.replace(/\/$/, ""));

            if (nodeList.length === 0) return res.json([]);

            // 2. Gửi yêu cầu tìm kiếm song song
            const requests = nodeList.map(node =>
                // NHỚ: Thêm /patients/ vào đường dẫn cho khớp với DataNode
                axios.get(`${node}/api/patients/search?name=${encodeURIComponent(name)}`, {
                    timeout: 5000,
                    headers: { 'ngrok-skip-browser-warning': 'true' }
                })
            );

            const results = await Promise.allSettled(requests);

            // 3. Gom dữ liệu
            let allPatients = [];
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    // Đảm bảo dữ liệu từ DataNode trả về là mảng
                    const data = Array.isArray(result.value.data) ? result.value.data : [result.value.data];
                    allPatients = [...allPatients, ...data];
                } else {
                    console.error(` Máy ${nodeList[index]} không phản hồi search: ${result.reason.message}`);
                }
            });

            // 4. Lọc trùng bằng patient_id
            const uniquePatients = Array.from(
                new Map(allPatients.map(p => [p.patient_id, p])).values()
            );

            console.log(` Tổng kết tìm thấy: ${uniquePatients.length} bệnh nhân.`);
            res.json(uniquePatients);

        } catch (err) {
            console.error(" Lỗi Search:", err.message);
            res.status(500).json({ error: "Lỗi thực hiện truy vấn phân tán: " + err.message });
        }
    },
    getPatientById: async (req, res) => {
        // Khai báo metadata bên ngoài try để khối catch phía dưới có thể truy cập được khi cần Failover
        let metadata = [];
        const { patient_id } = req.params;

        try {
            console.log(`🔍 NameNode đang tra Metadata cho bệnh nhân: ${patient_id}`);

            // 1. Lấy Metadata từ SQL Server (NameNode)
            const pool = await poolPromise;
            const result = await pool.request()
                .input('id', sql.VarChar, patient_id)
                .query("SELECT * FROM dbo.metadata WHERE patient_id = @id");

            metadata = result.recordset;

            if (!metadata || metadata.length === 0) {
                return res.status(404).json({
                    error: `Không tìm thấy Metadata cho BN: ${patient_id}.`
                });
            }

            const meta = metadata[0];
            const primaryUrl = meta.primary_node.replace(/\/$/, "");
            const targetUrl = `${primaryUrl}/api/patients/view-patient?id=${patient_id}`;

            try {
                console.log(` Đang gọi máy CHÍNH: ${targetUrl}`);

                // 2. Gọi sang DataNode CHÍNH (để timeout 3s để chuyển máy cho nhanh nếu sập)
                const response = await axios.get(targetUrl, {
                    timeout: 3000,
                    headers: { 'ngrok-skip-browser-warning': 'true' }
                });

                // Dọn dẹp dữ liệu lặp
                const { patient_id: uId, version: uV, is_primary, ...cleanData } = response.data;

                return res.status(200).json({
                    message: "Lấy dữ liệu thành công từ máy CHÍNH",
                    routing_info: { source: "Primary", ...meta },
                    patient_data: cleanData
                });

            } catch (primaryError) {
                // --- BẮT ĐẦU LUỒNG FAILOVER ---
                console.warn(` Máy CHÍNH lỗi: ${primaryError.message}. Đang thử máy PHỤ...`);

                if (meta.replica_node) {
                    const replicaUrl = meta.replica_node.replace(/\/$/, "");
                    const replicaTargetUrl = `${replicaUrl}/api/patients/view-patient?id=${patient_id}`;

                    console.log(` NameNode đang gọi dự phòng sang máy PHỤ: ${replicaTargetUrl}`);

                    const responseReplica = await axios.get(replicaTargetUrl, {
                        timeout: 4000,
                        headers: { 'ngrok-skip-browser-warning': 'true' }
                    });

                    // Dọn dẹp dữ liệu lặp từ máy phụ
                    const { patient_id: uId2, version: uV2, is_primary: p2, ...cleanDataReplica } = responseReplica.data;

                    return res.status(200).json({
                        message: "Lấy dữ liệu thành công từ máy DỰ PHÒNG (Failover)",
                        routing_info: { source: "Replica", ...meta },
                        patient_data: cleanDataReplica
                    });
                } else {
                    throw new Error("Máy chính lỗi và không tìm thấy cấu hình máy phụ.");
                }
            }

        } catch (error) {
            console.error(" Lỗi hệ thống phân tán:", error.message);
            res.status(500).json({
                error: "Sập toàn hệ thống",
                message: "Không thể kết nối tới bất kỳ DataNode nào chứa dữ liệu này.",
                detail: error.message
            });
        }
    }
}

module.exports = patientController;