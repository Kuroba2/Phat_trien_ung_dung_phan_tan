const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patient.controller');

router.get('/get-upload-location', patientController.getUploadLocation);

router.post('/update-metadata', patientController.updateMetadata);

router.get('/search', patientController.searchPatient);

module.exports = router;