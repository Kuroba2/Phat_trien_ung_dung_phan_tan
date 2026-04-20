-- Kiểm tra nếu bảng 'patients' đã tồn tại trong database thì xóa đi để tạo mới
IF OBJECT_ID('dbo.patients', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.patients;
END;
GO

-- Khởi tạo bảng lưu trữ thông tin bệnh nhân (Dùng cho các DataNode)
CREATE TABLE dbo.patients (
    -- Mã định danh bệnh nhân: Khóa chính, không được để trống
    patient_id VARCHAR(20) NOT NULL, 
    
    -- Họ tên: Dùng NVARCHAR để lưu được tiếng Việt có dấu, không được để trống
    name NVARCHAR(255) NOT NULL, 
    
    -- Triệu chứng: Lưu tối đa 1000 ký tự tiếng Việt, có thể để trống
    symptom NVARCHAR(1000) NULL, 
    
    -- Cơ sở y tế: Lưu nơi bệnh nhân đăng ký khám (Bắc/Trung/Nam)
    facility VARCHAR(50) NOT NULL, 
    
    -- Trạng thái bản ghi: 1 là bản gốc (Primary), 0 là bản sao (Replica)
    -- Mặc định khi thêm mới tại máy sở tại sẽ là bản gốc (1)
    is_primary BIT NOT NULL CONSTRAINT DF_patients_is_primary DEFAULT (1), 
    
    -- Thời gian tạo: Lưu thời điểm bản ghi được chèn vào DB theo giờ chuẩn UTC
    created_at DATETIME2 NOT NULL CONSTRAINT DF_patients_created_at DEFAULT (SYSUTCDATETIME()), 
    
    -- Phiên bản dữ liệu: Dùng để đồng bộ và tránh xung đột khi có cập nhật, mặc định là 1
    version INT NOT NULL CONSTRAINT DF_patients_version DEFAULT (1), 

    -- Thiết lập khóa chính (Primary Key) cho cột patient_id
    -- CLUSTERED: Dữ liệu thực tế trên ổ cứng được sắp xếp theo cây B-Tree dựa trên ID này
    CONSTRAINT PK_patients PRIMARY KEY CLUSTERED (patient_id)
);
GO

-- TẠO CẤU TRÚC B-TREE TÌM KIẾM THEO TÊN (Non-Clustered Index)
-- Mục tiêu: Đáp ứng yêu cầu tìm kiếm 1 triệu bản ghi trong 0.01 giây
CREATE NONCLUSTERED INDEX IX_patients_name
    ON dbo.patients (name ASC, patient_id ASC)
    -- INCLUDE: Đưa sẵn các cột này vào các "lá" của cây Index 
    -- Giúp SQL không cần quay lại bảng chính để tìm thêm dữ liệu (Covering Index)
    INCLUDE (facility, is_primary, created_at, version);
GO

-- TẠO CẤU TRÚC B-TREE TÌM KIẾM THEO CƠ SỞ (Facility)
-- Mục tiêu: Giúp NameNode lọc nhanh bệnh nhân theo vùng miền và trạng thái gốc/sao
CREATE NONCLUSTERED INDEX IX_patients_facility
    ON dbo.patients (facility ASC, is_primary ASC);
GO

-- GHI CHÚ VỀ PARTITION INDEX
-- Hiện tại hệ thống đã chia tải theo 3 database vật lý khác nhau nên chưa cần partition ngay.
-- Nếu sau này từng database tăng lên rất lớn, có thể cân nhắc partition theo created_at
-- hoặc facility để tối ưu quản lý dữ liệu và bảo trì index.
-- Không nên partition theo name vì truy vấn tìm theo tên cần giữ thứ tự B-Tree trên cột name.