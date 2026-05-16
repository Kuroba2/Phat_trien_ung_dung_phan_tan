 # Tài liệu API

 Các route trong repository được nhóm theo dịch vụ. Dưới đây là mô tả , gồm đường dẫn đầy đủ như đang mount trong ứng dụng.

 - Tiền tố NameNode: `/api` (gateway)
 - Tiền tố DataNode: `/api`
 - Tiền tố replication trên DataNode: `/api/replication`

 ---

 ## API của NameNode (mount tại `/api`)

 1) GET `/api/status`
 - Báo cáo trạng thái (health) của các DataNode đã cấu hình.
 - Response 200: `[{ id: 'DataNode_1', status: 'Online ' }, ...]`

 2) POST `/api/patients`
 - Tạo bệnh nhân mới. NameNode sẽ chọn một DataNode Primary và cố gắng sao chép sang Replica.
 - Ví dụ body yêu cầu:

 ```json
 {
   "patient_id": "BN001",
   "name": "Nguyễn Văn A",
   "symptom": "Sốt cao, ho",
   "facility": "Bệnh viện X"
 }
 ```
 - Response thành công 201: chứa các trường `status`, `message`, `assigned_nodes`, `logs`.

 3) GET `/api/patients/search?name=<keyword>`
 -  : Tìm bệnh nhân theo tên trên tất cả DataNode; trả về kết quả hợp nhất và loại trùng.

 4) GET `/api/patients/stats/today`
 -  : Tổng hợp số bệnh nhân mới trong hôm nay từ tất cả DataNode Primary có thể truy cập.
 - Ví dụ response 200:

 ```json
 {
   "total_today": 5,
   "query_date_utc": "2026-05-16",
   "per_node": [
     { "node": "http://localhost:3001", "total": 2 },
     { "node": "http://localhost:3002", "total": 2 }
   ],
   "unavailable_nodes": []
 }
 ```

 5) GET `/api/patients/:patient_id`
 -  : Lấy chi tiết bệnh nhân. NameNode sẽ chuyển yêu cầu tới Primary và dự phòng sang Replica khi cần.

 6) PUT `/api/patients/:patient_id`
 -  : Cập nhật bệnh nhân theo luồng NameNode -> Primary -> Replica. Body chứa các trường cần cập nhật.

 7) DELETE `/api/patients/:patient_id`
 -  : Xóa bệnh nhân theo luồng NameNode -> Primary -> Replica; NameNode sẽ xóa metadata khi hoàn tất.

 ---

 ## API của DataNode (mount tại `/api` trên mỗi DataNode)

 Các route CRUD bệnh nhân và trợ giúp (dịch vụ cục bộ trên DataNode):

 1) POST `/api/upload-patient`
 -  : Endpoint nội bộ do NameNode và các DataNode khác sử dụng để chèn bản ghi bệnh nhân.
 - Body yêu cầu: payload bệnh nhân bao gồm `patient_id`, `name`, `symptom`, `facility`, `is_primary`, `version`.
 - Response thành công 201: `{ message: 'DataNode đã lưu dữ liệu thành công!', patient_id: 'BN001' }` (khi gọi trực tiếp).

 2) GET `/api/view-patient?id=<patient_id>`
 -  : Trả về bản ghi bệnh nhân theo `id` từ DataNode này.

 3) GET `/api/search?name=<keyword>`
 -  : Endpoint tìm kiếm cục bộ, được NameNode sử dụng để tổng hợp kết quả từ nhiều DataNode.

 4) GET `/api/stats/today`
 -  : Trả về số bản ghi được tạo trong hôm nay trên DataNode này (chỉ tính bản primary).
 - Ví dụ response 200:

 ```json
 {
   "total": 2,
   "scope": "primary_records",
   "date_utc": "2026-05-16"
 }
 ```

 5) PUT `/api/update-patient?id=<patient_id>`
 -  : Cập nhật bệnh nhân trên DataNode này. NameNode gọi Primary, Primary có thể forward sang Replica.

 6) DELETE `/api/delete-patient?id=<patient_id>`
 -  : Xóa bản ghi bệnh nhân trên DataNode này.

 7) GET `/ping` và GET `/health`
 -  : Các endpoint nhẹ dùng kiểm tra sức khỏe; `/health` trả về trạng thái và độ dài hàng đợi replication degraded.

 ---

 ## Replication APIs trên DataNode (mount tại `/api/replication`)

 1) POST `/api/replication/replicate`
 -  : DataNode chính dùng endpoint này để đẩy payload sao chép sang bản sao (Replica).
 - Body yêu cầu: cùng payload bệnh nhân; `is_primary` nên là `0` cho bản sao.
 - Ví dụ response:

 ```json
 { "message": "Replication handled", "action": "inserted", "patient_id": "P001" }
 ```

 2) POST `/api/replication/internal/sync`
 -  : Kích hoạt đồng bộ các bản ghi bị `degraded` (trước đó sao chép thất bại).
 - Ví dụ response 200:

 ```json
 { "message": "Sync completed", "total": 1, "recovered": 1, "failed": 0 }
 ```

 3) GET `/api/replication/degraded-list`
 -  : Trả về danh sách các replication bị degraded đang chờ retry trên node này.

 ---



 ---



