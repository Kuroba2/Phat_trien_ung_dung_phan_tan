const axios = require('axios');


const URL = 'http://localhost:4000/api/upload'; 

// Các mảng dữ liệu mẫu để trộn cho phong phú
const names = ["Nguyễn Văn", "Trần Thị", "Lê Văn", "Phạm Minh", "Hoàng Thu"];
const lastNames = ["An", "Bình", "Chinh", "Dương", "Em", "Giang"];
const symptoms = ["Ho nhẹ", "Sốt cao", "Đau đầu", "Mệt mỏi", "Đau họng"];
const facilities = ["BV Đa Khoa", "Phòng Khám 1", "Trung tâm Y tế", "BV Bạch Mai"];

async function sinhBenhNhan() {
    console.log(" Bắt đầu quá trình sinh 50 bệnh nhân tự động...");

    for (let i = 1; i <= 50; i++) {
        // Tạo ID định dạng BN001, BN002...
        const patientId = `BN${String(i).padStart(3, '0')}`;
        
        // Trộn dữ liệu ngẫu nhiên
        const randomName = `${names[Math.floor(Math.random() * names.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
        
        const data = {
            patient_id: patientId,
            name: randomName,
            symptom: symptoms[Math.floor(Math.random() * symptoms.length)],
            facility: facilities[Math.floor(Math.random() * facilities.length)]
        };

        try {
            const res = await axios.post(URL, data, {
                headers: { 
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true' 
                },
                timeout: 10000
            });

            console.log(` [${i}/50] Thành công: ${patientId} - ${randomName}`);
        } catch (err) {
            console.error(` [${i}/50] Thất bại: ${patientId}. Lỗi: ${err.message}`);
        }

        // Nghỉ 100ms giữa mỗi lần gửi để không làm nghẽn mạng
        await new Promise(r => setTimeout(r, 100));
    }

    console.log("\n Hoàn tất! Huy kiểm tra bảng Metadata trong SQL để thấy kết quả.");
}

sinhBenhNhan();