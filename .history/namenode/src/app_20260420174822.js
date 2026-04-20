const express = require('express');
const axios = require('axios');
require('dotenv').config({ path: './env/namenode.env' }); // Đọc file cấu hình [cite: 323]

const app = express();
app.use(express.json()); // Cho phép server đọc dữ liệu JSON từ Postman gửi lên 

// --- PHẦN 1: QUẢN LÝ TRẠNG THÁI CÁC MÁY (HEALTH CHECK) --- [cite: 81, 121]

// Danh sách địa chỉ 3 máy chi nhánh lấy từ file .env [cite: 225]
const dataNodes = [
    process.env.DATANODE_1,
    process.env.DATANODE_2,
    process.env.DATANODE_3
];

// Biến global để lưu xem máy nào đang sống (UP) hay chết (DOWN) [cite: 128, 129]
global.nodeStatus = {
    [dataNodes[0]]: 'UP',
    [dataNodes[1]]: 'UP',
    [dataNodes[2]]: 'UP'
};

// Cứ mỗi 5 giây, Máy 4 sẽ tự động đi hỏi thăm 3 máy kia [cite: 82, 122]
setInterval(async () => {
    for (let node of dataNodes) {
        try {
            // Gửi một lệnh GET nhẹ tới máy bạn, quá 2 giây không rep coi như lỗi [cite: 82, 124]
            await axios.get(`${node}/health`, { timeout: 2000 });
            global.nodeStatus[node] = 'UP'; // Nếu rep thì đánh dấu là sống [cite: 128]
        } catch (error) {
            global.nodeStatus[node] = 'DOWN'; // Nếu lỗi thì đánh dấu là sập [cite: 83, 127]
            console.log(`⚠️  Cảnh báo: Node ${node} đã sập!`);
        }
    }
}, 5000);

// --- PHẦN 2: ĐỊNH NGHĨA CÁC ĐƯỜNG DẪN API --- [cite: 321]

// Postman sẽ gọi vào đây để hỏi: "Tôi nên lưu bệnh nhân ở đâu?" [cite: 30, 106]
app.get('/api/get-upload-location', (req, res) => {
    // Chúng ta sẽ viết logic chọn máy (Round Robin) ở bước sau
    res.json({ message: "Sẽ trả về IP máy rảnh nhất ở đây" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🚀 NameNode đang chạy tại port ${PORT}`);
    console.log(`📊 Trạng thái ban đầu:`, global.nodeStatus);
});