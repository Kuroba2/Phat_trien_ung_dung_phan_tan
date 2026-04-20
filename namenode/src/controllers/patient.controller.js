const { poolPromise, sql } = require('../config/database');

// Biến đếm dùng cho thuật toán xoay vòng Round Robin
let currentIndex = 0;

const patientController = {
    // 1. Điều phối Ghi: Chọn Node để lưu bệnh nhân mới
    getUploadLocation: async (req, res) => {
        // Lấy danh sách IP các máy đang sống từ biến global (đã tạo ở app.js)
        const availableNodes = Object.keys(global.nodeStatus).filter(
            nodeIp => global.nodeStatus[nodeIp] === 'UP'
        );

        if (availableNodes.length === 0) {
            return res.status(503).json({ error: "Tất cả chi nhánh đều đang sập!" });
        }

        // Chọn máy Gốc (Primary) theo Round Robin 
        const primary = availableNodes[currentIndex % availableNodes.length];
        currentIndex++;

        // Chọn máy tiếp theo trong danh sách làm Bản sao (Replica)
        const replicaIndex = (availableNodes.indexOf(primary) + 1) % availableNodes.length;
        const replica = availableNodes[replicaIndex];

        // Trả về chỉ định cho Client
        res.json({
            primary: primary,
            replica: replica
        });
    },

    // 2. Cập nhật Metadata: Lưu bản đồ vào SQL Server sau khi DataNode ghi xong
    updateMetadata: async (req, res) => {
        const { patient_id, primary_node, replica_node, status, version } = req.body;

        try {
            const pool = await poolPromise;
            await pool.request()
                .input('id', sql.VarChar, patient_id)
                .input('p_node', sql.VarChar, primary_node)
                .input('r_node', sql.VarChar, replica_node)
                .input('status', sql.VarChar, status) // healthy hoặc degraded
                .input('ver', sql.Int, version || 1)
                .query(`
                    INSERT INTO metadata (patient_id, primary_node, replica_node, status, version)
                    VALUES (@id, @p_node, @r_node, @status, @ver)
                `);

            res.json({ message: "Cập nhật Metadata thành công!" });
        } catch (err) {
            res.status(500).json({ error: "Lỗi lưu Metadata: " + err.message });
        }
    }
};

module.exports = patientController;