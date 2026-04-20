const sql = require('mssql');

const sqlConfig = {
	server: process.env.DB_HOST || 'localhost',
	port: Number(process.env.DB_PORT) || 1433,
	database: process.env.DB_NAME || 'facility_db_1',
	user: process.env.DB_USER || 'sa',
	password: process.env.DB_PASSWORD || '',
	options: {
		trustServerCertificate: true,
		enableArithAbort: true,
	},
	pool: {
		max: 10,
		min: 0,
		idleTimeoutMillis: 30000,
	},
};

let poolPromise;

function getPool() {
	if (!poolPromise) {
		poolPromise = new sql.ConnectionPool(sqlConfig)
			.connect()
			.catch((error) => {
				poolPromise = undefined;
				throw error;
			});
	}

	return poolPromise;
}

module.exports = {
	sql,
	sqlConfig,
	getPool,
};