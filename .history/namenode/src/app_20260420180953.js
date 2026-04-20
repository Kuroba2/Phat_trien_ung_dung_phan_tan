const express = require('express');
const axios = require('axios');
const path = require('path');

// Nạp cấu hình từ file .env 
require('dotenv').config({ path: path.join(__dirname, '../../env/namenode.env') });

const app = express();
app.use(express.json()); // Cho phép đọc dữ liệu JSON 

// Nạp các đường dẫn API từ file routes/api.js
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes); // Các API có dạng /api/... 

// --- HỆ THỐNG GIÁM SÁT (HEALTH CHECK) --- 

const dataNodes = [
    process.env.DATANODE_1,
    process.env.DATANODE_2,
    process.env.DATANODE_3
];

// Khởi tạo trạng thái ban đầu 
global.nodeStatus = {
    [dataNodes[0]]: 'UP',
    [dataNodes[1]]: 'UP',
    [dataNodes[2]]: 'UP'
};

// Cứ mỗi 5 giây kiểm tra sự sống của các chi nhánh 
setInterval(async () => {
    for (let node of dataNodes) {
        if (!node) continue;
        try {
            // Timeout 2 giây theo yêu cầu 
            await axios.get(`${node}/health`, { timeout: 2000 });
            global.nodeStatus[node] = 'UP';
        } catch (error) {
            global.nodeStatus[node] = 'DOWN'; // Đánh dấu DOWN nếu sập 
            console.log(`⚠️ Cảnh báo: Chi nhánh ${node} đang mất kết nối!`);
        }
    }
}, 5000);

const PORT = process.env.PORT || 3000; // Port 3000 cho NameNode
app.listen(PORT, () => {
    console.log(` NameNode (Máy 4) đang chạy tại Port ${PORT}`);
    console.log(` Danh sách theo dõi:`, Object.keys(global.nodeStatus));
});