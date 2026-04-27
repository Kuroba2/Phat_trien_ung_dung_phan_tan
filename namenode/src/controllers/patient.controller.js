const { poolPromise, sql } = require('../config/database');
const axios = require('axios');

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

    updateMetadata: async (req, res) => {
        const { patient_id, primary_node, replica_node, status, version, name, symptom, facility } = req.body;

        try {
            // 1. Lưu vào SQL của NameNode (Metadata)
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
                    console.log(` Đang đẩy dữ liệu tới Primary: ${primaryPath}`);
                    
                    await axios.post(primaryPath, { ...patientData, is_primary: 1 }, { timeout: 5000 });
                }
                // Gửi sang Replica (nếu có)
                if (replica_node) {
                    const cleanReplicaUrl = replica_node.replace(/\/$/, "");
                    const replicaPath = `${cleanReplicaUrl}/api/patients/upload-patient`;
                    console.log(` Đang đẩy tới Replica: ${replicaPath}`);
                    
                    await axios.post(replicaPath, { ...patientData, is_primary: 0 }, axiosConfig);
                }
                console.log(` Đã đồng bộ bệnh nhân ${patient_id} xuống DataNodes`);
            } catch (err) {
            console.error(" Lỗi Metadata SQL:", err.message);
            res.status(500).json({ error: "Lỗi lưu Metadata: " + err.message });
        }

            res.json({ 
                message: "Cập nhật Metadata hoàn tất!", 
                sync_status: "Check NameNode terminal for details" 
            });
        } catch (err) {
            console.error(" Lỗi Metadata SQL:", err.message);
            res.status(500).json({ error: "Lỗi lưu Metadata: " + err.message });
        }
    },

    searchPatient: async (req, res) => {
        const { name } = req.query;
        const availableNodes = Object.keys(global.nodeStatus).filter(
            nodeIp => global.nodeStatus[nodeIp] === 'UP'
        );

        try {
            const requests = availableNodes.map(node => {
                const cleanNodeUrl = node.replace(/\/$/, "");
                return axios.get(`${cleanNodeUrl}/api/patients/search?name=${encodeURIComponent(name)}`, { 
                    headers: { 'ngrok-skip-browser-warning': 'true' },
                    timeout: 5000 
                });
            });
            
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