const express = require('express');
const axios = require('axios');
const path = require('path');
// 1. Đảm bảo đường dẫn tới file env chính xác để nhận link Ngrok của bạn bè
require('dotenv').config({ path: path.join(__dirname, '../../env/namenode.env') });

const app = express();
app.use(express.json()); 

// 2. KÍCH HOẠT HỆ THỐNG ĐƯỜNG DẪN (ROUTES)
// Việc này giúp app.js hiểu được các link /api/get-upload-location, /api/search, v.v.
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes); 

// --- HỆ THỐNG GIÁM SÁT (HEALTH CHECK) ---
const dataNodes = [
    process.env.DATANODE_1,
    process.env.DATANODE_2,
    process.env.DATANODE_3
];

// Biến toàn cục để theo dõi trạng thái các máy chi nhánh
global.nodeStatus = {
    [dataNodes[0]]: 'UP',
    [dataNodes[1]]: 'UP',
    [dataNodes[2]]: 'UP'
};

// Cứ mỗi 5 giây, NameNode tự động kiểm tra xem 3 máy kia còn sống không
setInterval(async () => {
    for (let node of dataNodes) {
        if (!node) continue;
        try {
            // Gọi vào endpoint /health của DataNode
            await axios.get(`${node}/health`, { timeout: 2000 });
            global.nodeStatus[node] = 'UP';
        } catch (error) {
            global.nodeStatus[node] = 'DOWN';
            console.log(`⚠️ Cảnh báo: Chi nhánh ${node} đang mất kết nối!`);
        }
    }
}, 5000);

// 3. KHỞI ĐỘNG SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 NameNode (Máy 4) đang chạy tại Port ${PORT}`);
    console.log(`📡 Đang giám sát các Node:`, Object.keys(global.nodeStatus));
});