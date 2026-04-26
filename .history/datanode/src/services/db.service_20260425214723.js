// Wrapper service để cấp patientService cho DataNode app.js
const {
    createPatient,
    getPatientById,
    searchByName,
    updatePatient,
    deletePatient
} = require('./patient.service');

const dbService = {
    createPatient,
    getPatientById,
    searchByName,
    updatePatient,
    deletePatient
};

module.exports = { dbService };
