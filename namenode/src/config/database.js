const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../env/namenode.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST,
    database: process.env.DB_NAME, // metadata_db
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log(' NameNode đã kết nối SQL Server (Metadata) thành công!');
        return pool;
    })
    .catch(err => {
        console.error('❌ Lỗi kết nối SQL Server tại NameNode: ', err);
        throw err;
    });

module.exports = { sql, poolPromise };