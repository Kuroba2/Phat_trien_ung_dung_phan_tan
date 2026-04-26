const patientController = (dbService, replicationService) => ({
    uploadPatient: async (req, res) => {
        const patientData = req.body;
        const replicaNode = req.body.replica_node;
        const primaryNodeUrl = req.body.primary_node;
        
        try {
            const patientWithDefaults = {
                ...patientData,
                is_primary: true,
                version: patientData.version || 1
            };

            const savedPatient = await dbService.createPatient(patientWithDefaults);

            res.status(201).json({ 
                message: "Lưu bệnh nhân gốc thành công!",
                patient_id: savedPatient.patient_id,
                version: patientWithDefaults.version
            });

            if (replicaNode) {
                replicationService.replicateWithRetry({
                    patient: { ...savedPatient, version: patientWithDefaults.version },
                    primaryNodeUrl: primaryNodeUrl,
                    replicaNodeUrl: replicaNode,
                    statusSource: "patient-upload"
                }).catch(err => {
                    console.error(`Background replication failed for ${savedPatient.patient_id}:`, err.message);
                });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    getPatient: async (req, res) => {
        try {
            const patient = await dbService.getPatientById(req.query.id); 
            if (!patient) return res.status(404).json({ message: "Không tìm thấy" });
            res.json(patient);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    searchPatient: async (req, res) => {
        try {
            const { name } = req.query;
            const patients = await dbService.searchByName(name);
            res.json(patients);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
});

module.exports = { patientController };