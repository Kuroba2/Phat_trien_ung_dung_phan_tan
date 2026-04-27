const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json()); 

const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes); 

const dataNodes = [
    process.env.DATANODE_1,
    process.env.DATANODE_2,
    process.env.DATANODE_3
];

global.nodeStatus = {
    [dataNodes[0]]: 'UP',
    [dataNodes[1]]: 'UP',
    [dataNodes[2]]: 'UP'
};

setInterval(async () => {
    for (let node of dataNodes) {
        if (!node) continue;
        
        // 1. Xử lý xóa dấu "/" ở cuối link nếu có để tránh lỗi //health
        const baseUrl = node.endsWith('/') ? node.slice(0, -1) : node;
        const healthUrl = `${baseUrl}/health`;

        try {
            // 2. Thêm header ngrok-skip-browser-warning để axios đi thẳng vào code
            await axios.get(healthUrl, { 
                timeout: 5000, // Tăng lên 5s cho chắc vì mạng ngrok đôi khi chậm
                headers: { 'ngrok-skip-browser-warning': 'true' } 
            });
            
            global.nodeStatus[node] = 'UP';
            // Bỏ comment dòng dưới nếu Huy muốn thấy nó báo thành công trên màn hình
            // console.log(`✅ Node ${node} is ONLINE`); 
            
        } catch (error) {
            global.nodeStatus[node] = 'DOWN';
            console.log(`⚠️ Warning: Node ${healthUrl} is unreachable. Error: ${error.message}`);
        }
    }
}, 5000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(` NameNode running on port ${PORT}`);
    console.log(` Monitoring nodes:`, Object.keys(global.nodeStatus));
});