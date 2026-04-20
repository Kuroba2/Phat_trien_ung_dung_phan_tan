const { getPool, sql } = require('../config/db');

async function createPatient(data) {
	const pool = await getPool();

	const request = pool.request();
	request.input('patient_id', sql.VarChar(20), data.patientId);
	request.input('name', sql.NVarChar(255), data.name);
	request.input('symptom', sql.NVarChar(1000), data.symptom || null);
	request.input('facility', sql.VarChar(50), data.facility);
	request.input('is_primary', sql.Bit, data.isPrimary ?? true);
	request.input('version', sql.Int, data.version ?? 1);

	const result = await request.query(`
		INSERT INTO dbo.patients (
			patient_id,
			name,
			symptom,
			facility,
			is_primary,
			version
		)
		OUTPUT INSERTED.patient_id, INSERTED.name, INSERTED.symptom, INSERTED.facility,
			INSERTED.is_primary, INSERTED.created_at, INSERTED.version
		VALUES (
			@patient_id,
			@name,
			@symptom,
			@facility,
			@is_primary,
			@version
		);
	`);

	return result.recordset[0];
}

async function getPatientById(id) {
	const pool = await getPool();

	const result = await pool
		.request()
		.input('patient_id', sql.VarChar(20), id)
		.query(`
			SELECT
				patient_id,
				name,
				symptom,
				facility,
				is_primary,
				created_at,
				version
			FROM dbo.patients
			WHERE patient_id = @patient_id;
		`);

	return result.recordset[0] || null;
}

async function searchByName(name) {
	const pool = await getPool();
	const keyword = `${name || ''}%`;

	const result = await pool
		.request()
		.input('keyword', sql.NVarChar(255), keyword)
		.query(`
			SELECT TOP (100)
				patient_id,
				name,
				symptom,
				facility,
				is_primary,
				created_at,
				version
			FROM dbo.patients
			WHERE name LIKE @keyword
			ORDER BY name ASC, patient_id ASC;
		`);

	return result.recordset;
}

async function updatePatient(id, data) {
	const pool = await getPool();

	const request = pool.request();
	request.input('patient_id', sql.VarChar(20), id);
	request.input('name', sql.NVarChar(255), data.name);
	request.input('symptom', sql.NVarChar(1000), data.symptom || null);
	request.input('facility', sql.VarChar(50), data.facility);
	request.input('is_primary', sql.Bit, data.isPrimary ?? true);
	request.input('version', sql.Int, data.version ?? 1);

	const result = await request.query(`
		UPDATE dbo.patients
		SET
			name = @name,
			symptom = @symptom,
			facility = @facility,
			is_primary = @is_primary,
			version = @version
		OUTPUT INSERTED.patient_id, INSERTED.name, INSERTED.symptom, INSERTED.facility,
			INSERTED.is_primary, INSERTED.created_at, INSERTED.version
		WHERE patient_id = @patient_id;
	`);

	return result.recordset[0] || null;
}

async function deletePatient(id) {
	const pool = await getPool();

	const result = await pool
		.request()
		.input('patient_id', sql.VarChar(20), id)
		.query(`
			DELETE FROM dbo.patients
			OUTPUT DELETED.patient_id
			WHERE patient_id = @patient_id;
		`);

	return result.recordset[0] || null;
}

module.exports = {
	createPatient,
	getPatientById,
	searchByName,
	updatePatient,
	deletePatient,
};