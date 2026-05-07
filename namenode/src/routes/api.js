const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patient.controller');

//router.get('/upload-location', patientController.getPatientUploadLocation);
router.get('/status', patientController.checkSystemStatus);// check system status

router.post('/patients', patientController.uploadPatient);// upload patient data

router.get('/patients/search', patientController.searchPatient);// search patients by name or other criteria

router.get('/patients/stats/today', patientController.getTodayPatientStats);

router.get('/patients/:patient_id', patientController.getPatientById);// get patient details by ID

router.put('/patients/:patient_id', patientController.updatePatient);

router.delete('/patients/:patient_id', patientController.deletePatient);

module.exports = router;