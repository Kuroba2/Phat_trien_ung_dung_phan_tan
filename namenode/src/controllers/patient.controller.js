const { poolPromise, sql } = require('../config/database');
const axios = require('axios');

// Biến đếm dùng cho thuật toán xoay vòng Round Robin
let currentIndex = 0;

const patientController = {
    getUploadLocation: async (req, res) => {
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

    // 2. Cập nhật Metadata: Lưu bản đồ vào SQL Server sau khi DataNode ghi xong
    updateMetadata: async (req, res) => {
        const { patient_id, primary_node, replica_node, status, version } = req.body;

        try {
            const pool = await poolPromise;
            await pool.request()
                .input('id', sql.VarChar, patient_id)
                .input('p_node', sql.VarChar, primary_node)
                .input('r_node', sql.VarChar, replica_node)
                .input('status', sql.VarChar, status)
                .input('ver', sql.Int, version || 1)
                .query(`
                    MERGE INTO metadata AS target
                    USING (SELECT @id as patient_id) AS source
                    ON target.patient_id = source.patient_id
                    WHEN MATCHED THEN
                      UPDATE SET
                        primary_node = @p_node,
                        replica_node = @r_node,
                        status = @status,
                        version = @ver,
                        updated_at = SYSUTCDATETIME()
                    WHEN NOT MATCHED THEN
                      INSERT (patient_id, primary_node, replica_node, status, version, updated_at)
                      VALUES (@id, @p_node, @r_node, @status, @ver, SYSUTCDATETIME());
                `);

            res.json({ message: "Cập nhật Metadata thành công!" });
        } catch (err) {
            res.status(500).json({ error: "Lỗi lưu Metadata: " + err.message });
        }
    },

    searchPatient: async (req, res) => {
        const { name } = req.query;
        const availableNodes = Object.keys(global.nodeStatus).filter(
            nodeIp => global.nodeStatus[nodeIp] === 'UP'
        );

        try {
            const requests = availableNodes.map(node => 
                axios.get(`${node}/api/search?name=${encodeURIComponent(name)}`, { timeout: 3000 })
            );
            
            const results = await Promise.allSettled(requests);
            
            let allPatients = [];
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    allPatients = [...allPatients, ...result.value.data];
                }
            });

            const uniquePatients = Array.from(new Map(allPatients.map(p => [p.patient_id, p])).values());

            res.json(uniquePatients);
        } catch (err) {
            res.status(500).json({ error: "Lỗi thực hiện truy vấn phân tán: " + err.message });
        }
    }
};

module.exports = patientController;