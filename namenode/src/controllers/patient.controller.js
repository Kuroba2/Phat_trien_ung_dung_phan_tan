const { poolPromise, sql } = require('../config/database');
const axios = require('axios');
let currentIndex = 0;

const patientController = {

    getPrimaryNodes: async () => {
        const pool = await poolPromise;
        const nodesResult = await pool.request().query("SELECT DISTINCT primary_node FROM dbo.metadata WHERE primary_node IS NOT NULL");

        return nodesResult.recordset
            .map(node => node.primary_node?.replace(/\/$/, ""))
            .filter(Boolean);
    },

    //tạo mới bệnh nhân (đồng thời cập nhật Metadata trên NameNode và tự động đồng bộ xuống DataNode)
    uploadPatient: async (req, res) => {
        const { patient_id, name, symptom, facility } = req.body;
        const patientData = { patient_id, name, symptom, facility };

        try {
            // --- BƯỚC 1: KIỂM TRA TRÙNG LẶP TRÊN METADATA TRƯỚC ---
            const pool = await poolPromise;

            const checkExist = await pool.request()
                .input('id', sql.VarChar, patient_id)
                .query("SELECT patient_id FROM dbo.metadata WHERE patient_id = @id");

            if (checkExist.recordset.length > 0) {
                return res.status(400).json({ error: "Conflict", message: `Mã bệnh nhân ${patient_id} đã tồn tại!` });
            }

            // --- BƯỚC 2: TỰ ĐỘNG CHỌN MÁY SỐNG (AUTO-DISCOVERY) ---
            // Giả sử global.nodeStatus lưu trạng thái từ Heartbeat
            let aliveNodes = Object.keys(global.nodeStatus || {}).filter(ip => global.nodeStatus[ip] === 'UP');

            if (aliveNodes.length === 0) {
                return res.status(503).json({ error: "Service Unavailable", message: "Không có DataNode nào online!" });
            }

            // Ưu tiên chọn máy nhẹ tải (Random hoặc Round Robin đơn giản)
            aliveNodes.sort(() => Math.random() - 0.5);

            let primaryNode = null;
            let replicaNode = null;
            let logs = [];

            // --- BƯỚC 3: GỬI XUỐNG DATANODE (THỰC THI TRƯỚC) ---
            //Tầng 2 gửi dữ liệu xuống
            // 3.1 Tìm và ghi máy Chính (Primary)
            for (let i = 0; i < aliveNodes.length; i++) {
                try {
                    const targetUrl = aliveNodes[i].replace(/\/$/, "");
                    await axios.post(`${targetUrl}/api/upload-patient`,
                        { ...patientData, is_primary: 1 },
                        { timeout: 5000, headers: { 'ngrok-skip-browser-warning': 'true' } }
                    );
                    primaryNode = aliveNodes[i];
                    aliveNodes.splice(i, 1); // Đã chọn xong thì loại khỏi danh sách chờ cho máy phụ
                    break;
                } catch (err) {
                    logs.push(`Thử Primary tại ${aliveNodes[i]} thất bại: ${err.message}`);
                }
            }

            if (!primaryNode) {
                return res.status(500).json({ error: "Write Failed", message: "Tất cả các máy đều từ chối ghi dữ liệu!", logs });
            }

            // 3.2 Tìm và ghi máy Phụ (Replica) - Nếu còn máy khác sống
            for (let i = 0; i < aliveNodes.length; i++) {
                try {
                    const targetUrl = aliveNodes[i].replace(/\/$/, "");
                    await axios.post(`${targetUrl}/api/upload-patient`,
                        { ...patientData, is_primary: 0 },
                        { timeout: 5000, headers: { 'ngrok-skip-browser-warning': 'true' } }
                    );
                    replicaNode = aliveNodes[i];
                    break;
                } catch (err) {
                    logs.push(`Thử Replica tại ${aliveNodes[i]} thất bại, đang tìm máy tiếp theo...`);
                }
            }

            // --- BƯỚC 4: GHI VÀO METADATA 
            await pool.request()
                .input('id', sql.VarChar, patient_id)
                .input('p_node', sql.VarChar, primaryNode)
                .input('r_node', sql.VarChar, replicaNode || null) // Lưu NULL nếu không có máy phụ
                .input('status', sql.VarChar, 'Active')
                .query(`
                INSERT INTO dbo.metadata (patient_id, primary_node, replica_node, status, version, updated_at)
                VALUES (@id, @p_node, @r_node, @status, 1, SYSUTCDATETIME());
            `);

            // --- BƯỚC 5: TRẢ KẾT QUẢ CHO POSTMAN ---
            res.status(201).json({
                status: "Success",
                message: replicaNode ? "Đã lưu thành công (Chính & Phụ)" : "Lưu thành công (Chỉ có máy chính, không có bản sao)",
                assigned_nodes: { primary: primaryNode, replica: replicaNode },
                logs: logs
            });

        } catch (err) {
            console.error("Lỗi hệ thống:", err.message);
            res.status(500).json({ error: "Lỗi NameNode: " + err.message });
        }
    },






    //tìm kiếm bệnh nhân theo tên (có thể trả về nhiều kết quả)
    searchPatient: async (req, res) => {
        try {
            const { name } = req.query;
            console.log(` NameNode đang phát lệnh tìm kiếm tên: ${name}`);

            // 1. Lấy danh sách các máy DataNode từ DB Metadata (Cách này chắc chắn hơn global variable)
            const nodeList = await patientController.getPrimaryNodes();

            if (nodeList.length === 0) return res.json([]);

            // 2. Gửi yêu cầu tìm kiếm song song
            const requests = nodeList.map(node =>

                axios.get(`${node}/api/search?name=${encodeURIComponent(name)}`, {
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

    getTodayPatientStats: async (req, res) => {
        try {
            const nodeList = await patientController.getPrimaryNodes();

            if (nodeList.length === 0) {
                return res.json({
                    total_today: 0,
                    query_date_utc: new Date().toISOString().slice(0, 10),
                    per_node: [],
                    unavailable_nodes: []
                });
            }

            const requests = nodeList.map(node =>
                axios.get(`${node}/api/stats/today`, {
                    timeout: 5000,
                    headers: { 'ngrok-skip-browser-warning': 'true' }
                })
            );

            const results = await Promise.allSettled(requests);

            let totalToday = 0;
            const perNode = [];
            const unavailableNodes = [];

            results.forEach((result, index) => {
                const nodeUrl = nodeList[index];

                if (result.status === 'fulfilled') {
                    const total = Number(result.value.data?.total || 0);
                    totalToday += total;
                    perNode.push({
                        node: nodeUrl,
                        total
                    });
                } else {
                    unavailableNodes.push({
                        node: nodeUrl,
                        error: result.reason.message
                    });
                }
            });

            return res.json({
                total_today: totalToday,
                query_date_utc: new Date().toISOString().slice(0, 10),
                per_node: perNode,
                unavailable_nodes: unavailableNodes
            });
        } catch (err) {
            console.error(" Lỗi thống kê hôm nay:", err.message);
            res.status(500).json({ error: "Lỗi thống kê phân tán: " + err.message });
        }
    },

    //Tìm kiếm bệnh nhân theo ID (có cơ chế Failover sang máy phụ nếu máy chính không phản hồi)
    getPatientById: async (req, res) => {
        // Khai báo metadata bên ngoài try để khối catch phía dưới có thể truy cập được khi cần Failover
        let metadata = [];
        const { patient_id } = req.params;

        try {
            console.log(` NameNode đang tra Metadata cho bệnh nhân: ${patient_id}`);

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
            const targetUrl = `${primaryUrl}/api/view-patient?id=${patient_id}`;

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
                    const replicaTargetUrl = `${replicaUrl}/api/view-patient?id=${patient_id}`;

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
    },


    checkSystemStatus: async (req, res) => {
        try {
            const nodes = [
                { id: 'DataNode_1', url: 'https://thinning-recount-bondless.ngrok-free.dev' },
                { id: 'DataNode_2', url: 'https://cusp-broadly-smooth.ngrok-free.dev' },
                { id: 'DataNode_3', url: 'https://harmonica-defuse-tapping.ngrok-free.dev' }
            ];

            const statusReport = [];

            for (let node of nodes) {
                try {
                    // Gửi yêu cầu kèm theo header để vượt qua ngrok
                    await axios.get(`${node.url}/ping`, {
                        timeout: 5000, // Tăng lên 5s cho chắc chắn
                        headers: {
                            'ngrok-skip-browser-warning': 'true',
                            'User-Agent': 'axios'
                        }
                    });
                    statusReport.push({ id: node.id, status: 'Online ' });
                } catch (err) {
                    // QUAN TRỌNG: Dòng này sẽ hiện lỗi thật sự lên Terminal của NameNode
                    console.log(` Lỗi kết nối tới ${node.id} (${node.url}):`, err.message);

                    statusReport.push({ id: node.id, status: 'Offline ' });
                }
            }
            // Trả về báo cáo trạng thái
            return res.json(statusReport);

        } catch (err) {
            console.error('Lỗi kiểm tra trạng thái hệ thống:', err.message);
            return res.status(500).json({ error: 'Lỗi kiểm tra trạng thái hệ thống', detail: err.message });
        }

    },



    updatePatient: async (req, res) => {
        const { patient_id } = req.params;
        const updateData = req.body;

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('id', sql.VarChar, patient_id)
                .query("SELECT * FROM dbo.metadata WHERE patient_id = @id");

            const meta = result.recordset[0];
            if (!meta) return res.status(404).json({ error: "Không tìm thấy Metadata" });

            const primaryUrl = meta.primary_node ? meta.primary_node.replace(/\/$/, "") : null;
            const replicaUrl = meta.replica_node ? meta.replica_node.replace(/\/$/, "") : null;

            if (!primaryUrl) return res.status(500).json({ error: "Không có máy Chính" });

            // Gói địa chỉ máy phụ vào body để máy Chính gọi
            const payload = {
                ...updateData,
                replica_url: replicaUrl
            };

            // CHỈ GỌI MÁY CHÍNH
            const response = await axios.put(`${primaryUrl}/api/update-patient?id=${patient_id}`, payload);
            const { replica_success } = response.data;

            // XỬ LÝ KẾT QUẢ TỪ MÁY CHÍNH BÁO VỀ
            if (replica_success === false) {
                console.warn(`[DEGRADED] NameNode ghi nhận: Máy Phụ (${replicaUrl}) đang bị lỗi đồng bộ cho BN ${patient_id}. Đã đưa vào hàng đợi DataNode.`);
                // Nếu bảng metadata của Huy có cột trạng thái (ví dụ: status), Huy có thể Update nó thành 'DEGRADED' ở đây.
            }
            // Cập nhật Metadata tại NameNode
            await pool.request()
                .input('id', sql.VarChar, patient_id)
                .input('now', sql.DateTime, new Date())
                .query("UPDATE dbo.metadata SET updated_at = @now WHERE patient_id = @id");

            res.status(200).json({
                message: "Hoàn tất luồng NameNode -> Primary -> Replica",
                detail: response.data
            });

        } catch (error) {
            res.status(500).json({ error: "Lỗi luồng cập nhật", detail: error.message });
        }
    },



    // TRONG patient.controller.js CỦA NAMENODE

    deletePatient: async (req, res) => {
        const { patient_id } = req.params;

        try {
            // 1. Tìm thông tin Metadata
            const pool = await poolPromise;
            const result = await pool.request()
                .input('id', sql.VarChar, patient_id)
                .query("SELECT * FROM dbo.metadata WHERE patient_id = @id");

            const meta = result.recordset[0];
            if (!meta) return res.status(404).json({ error: "Bệnh nhân không tồn tại" });

            const primaryUrl = meta.primary_node ? meta.primary_node.replace(/\/$/, "") : null;
            const replicaUrl = meta.replica_node ? meta.replica_node.replace(/\/$/, "") : null;

            if (!primaryUrl) return res.status(500).json({ error: "Không xác định được máy Chính" });

            // 2. GỌI MÁY CHÍNH (Gắn kèm URL máy phụ vào Query)
            // Nếu có máy phụ, ta truyền nó vào biến replica_url. Nhớ dùng encodeURIComponent để URL không bị gãy.
            let targetUrl = `${primaryUrl}/api/delete-patient?id=${patient_id}`;
            if (replicaUrl) {
                targetUrl += `&replica_url=${encodeURIComponent(replicaUrl)}`;
            }

            // 3. Thực hiện gọi tới Máy Chính
            const response = await axios.delete(targetUrl);
            // 4. Kiểm tra trạng thái xóa ở Máy Phụ do Máy Chính báo về
            const { replica_success } = response.data;

            if (replica_success === false) {
                console.warn(`[DEGRADED] NameNode ghi nhận: Máy Phụ (${replicaUrl}) sập khi xóa BN ${patient_id}. Lệnh xóa đã được đẩy vào hàng đợi tự động.`);
            }
            // 5. Xóa Metadata tại NameNode (Chỉ thực hiện khi máy Chính báo thành công)
            await pool.request()
                .input('id', sql.VarChar, patient_id)
                .query("DELETE FROM dbo.metadata WHERE patient_id = @id");
            // 6. Phản hồi cho người dùng
            res.status(200).json({
                message: "Hoàn tất luồng xóa: NameNode -> Primary -> Replica",
                detail: response.data
            });

        } catch (error) {
            res.status(500).json({ error: "Lỗi luồng xóa", detail: error.message });
        }
    }

}



module.exports = patientController;