const axios = require("axios");

const patientController = (dbService, replicationService) => ({
  uploadPatient: async (req, res) => {
    const patientData = {
      ...req.body,
      is_primary: true,
      version: req.body.version || 1,
    };

    const replicaNode = req.body.replica_node;

    try {
      // 1. Lưu bản gốc vào DB cục bộ (Bắt buộc)
      const savedPatient = await dbService.createPatient(patientData);

      // 2. Kiểm tra xem có cần sao lưu không
      if (replicaNode) {
        // Chỉ làm việc sao lưu, không báo NameNode ở đây
        replicationService
          .replicateToNode({
            targetNodeUrl: replicaNode,
            data: { ...savedPatient, is_primary: false, version: patientData.version },
          })
          .catch((err) => {
            console.error("Replication failed:", err.message);
          });
      }

      // 3. Luôn báo cho NameNode (dù có replica hay không)
      try {
        await axios.post(`${process.env.NAMENODE_URL}/api/update-metadata`, {
          patient_id: savedPatient.patient_id || patientData.patient_id || patientData.id,
          primary_node: process.env.NODE_URL || process.env.NODE_ID,
          replica_node: replicaNode || null,
          status: replicaNode ? "healthy" : "degraded",
          version: patientData.version,
        });
      } catch (err) {
        console.error("NameNode đang sập, nhưng dữ liệu đã được bảo toàn tại local!");
      }

      return res.status(201).json({
        message: "Lưu bệnh nhân gốc thành công!",
        patient_id: savedPatient.patient_id,
        version: patientData.version,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

  getPatient: async (req, res) => {
    try {
      const patient = await dbService.getPatientById(req.query.id);
      if (!patient) return res.status(404).json({ message: "Không tìm thấy" });
      return res.json(patient);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },

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