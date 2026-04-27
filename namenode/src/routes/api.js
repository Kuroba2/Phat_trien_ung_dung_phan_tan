const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patient.controller');

router.get('/upload-location', patientController.getPatientUploadLocation);

router.post('/upload', patientController.uploadPatient);

router.get('/search', patientController.searchPatient);

module.exports = router;