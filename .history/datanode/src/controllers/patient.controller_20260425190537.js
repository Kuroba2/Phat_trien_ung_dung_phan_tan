const patientController = (dbService, replicationService) => ({
    // 1. Nhận hồ sơ từ Bác sĩ (Người 4 - [cite: 60])
    uploadPatient: async (req, res) => {
        const patientData = req.body;
        try {
            // Lưu vào SQL Server cục bộ (Người 2 - [cite: 45])
            await dbService.createPatient({
                ...patientData,
                is_primary: true, // Đây là bản gốc [cite: 124]
                version: 1
            });

            // Gọi máy Sao lưu (Người 3 - [cite: 128])
            // Lấy IP máy Replica từ Header hoặc Body do NameNode chỉ định
            const replicaNode = req.headers['x-replica-node']; 
            if (replicaNode) {
                await replicationService.replicateToNode(replicaNode, patientData); 
            }

            res.status(201).json({ message: "Lưu bệnh nhân gốc thành công!" });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // 2. Lấy thông tin bệnh nhân theo ID (Người 4 - [cite: 61])
    getPatient: async (req, res) => {
        try {
            const patient = await dbService.getPatientById(req.query.id); 
            if (!patient) return res.status(404).json({ message: "Không tìm thấy" });
            res.json(patient);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
});

module.exports = { patientController };