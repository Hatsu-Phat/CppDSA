# Hướng dẫn Vận hành Hệ thống CppDSA (OPERATIONS)

Tài liệu hướng dẫn quản trị, theo dõi chi phí, hiệu năng, tài nguyên cơ sở dữ liệu và vận hành hệ thống CppDSA trên môi trường đám mây (Azure Database for PostgreSQL Flexible Server, Render Grader/API, Vercel Web) và môi trường kiểm thử nội bộ.

---

## 1. Tổng quan Kiến trúc Vận hành

Hệ thống CppDSA được triển khai phân tán nhằm tối ưu hóa chi phí và đảm bảo cách ly an toàn cho việc chấm code:
- **Frontend Web:** Triển khai trên Vercel (Next.js App Router).
- **Backend API & Grader Worker:** Triển khai trên Render (Node.js 22 LTS, môi trường cách ly g++ sandbox).
  - Cấu hình Render Free tier: `0.15 CPU`, `512 MB RAM`.
- **Cơ sở dữ liệu:** Azure Database for PostgreSQL Flexible Server.
  - SKU mục tiêu dự kiến: `Standard_B1ms` (1 vCore Burstable, 2 GiB RAM, 32 GiB Storage).

---

## 2. Quản lý Chi phí và Ngân sách Azure (Azure Cost Management)

### 2.1. Thiết lập Cảnh báo Ngân sách (Budget Alerts)
1. Truy cập **Azure Portal** > Chọn **Cost Management + Billing** > Chọn Subscription của dự án CppDSA.
2. Chọn **Budgets** > Nhấn **+ Add** để tạo ngân sách mới:
   - **Tên ngân sách:** `CppDSA-Monthly-Budget`
   - **Chu kỳ đặt lại (Reset period):** Monthly (hàng tháng).
   - **Số tiền ngân sách (Amount):** Ví dụ $15 – $25 USD/tháng (tùy định mức tài trợ/chi phí môn học).
3. Thiết lập các ngưỡng cảnh báo (Alert Conditions):
   - **Ngưỡng 50%:** Gửi email thông báo khi chi phí thực tế đạt 50% ngân sách (khoảng giữa chu kỳ).
   - **Ngưỡng 80%:** Gửi email cảnh báo khẩn cấp khi đạt 80% ngân sách.
   - **Ngưỡng 100% (Forecasted):** Cảnh báo nếu dự báo chi phí tháng sẽ vượt 100%.
4. Điền danh sách email nhận cảnh báo (quản trị viên hệ thống / giảng viên phụ trách).

### 2.2. Theo dõi Chi phí Hàng tháng
- Sử dụng tính năng **Cost Analysis** lọc theo Resource Group `rg-cppdsa` và Resource Type `Microsoft.DBforPostgreSQL/flexibleServers`.
- Kiểm tra chi phí tính năng tính toán (Compute), lưu trữ (Storage) và lưu trữ sao lưu (Backup storage).
- *Ghi chú trạng thái:* `CHƯA CHẠY (P9)` do chưa khởi tạo tài nguyên Azure thực tế trước giai đoạn P9.

---

## 3. Quản lý Cơ sở dữ liệu Azure PostgreSQL (SKU B1MS)

### 3.1. Giới hạn Kết nối (Max Connections)
- Trên SKU `Standard_B1ms` (2 GiB RAM), giá trị mặc định của `max_connections` trong PostgreSQL thường dao động từ **50 đến 100** kết nối.
- Cơ chế quản lý kết nối của CppDSA:
  - Backend API sử dụng connection pool `pg.Pool` với kích thước pool mặc định `max: 5` kết nối mỗi instance.
  - Khi triển khai tải cao, số kết nối tối đa từ API luôn được kiểm soát trong khoảng 5–15 kết nối, tránh gây cạn kiệt kết nối trên server DB.
- Lệnh giám sát số kết nối đang hoạt động trong PostgreSQL:
  ```sql
  SELECT count(*), state FROM pg_stat_activity GROUP BY state;
  ```
- *Đo thực tế trên local trong load test P8:* Số kết nối cao nhất quan sát được là `3-5` kết nối đồng thời trên pool API, hoàn toàn an toàn trong ngưỡng 50 kết nối của B1ms.

### 3.2. Giám sát CPU, RAM và IOPS
- Truy cập **Monitoring** > **Metrics** trên trang quản trị Azure Flexible Server:
  - **CPU percent:** Cảnh báo khi mức sử dụng trung bình trong 15 phút > 80%. Do B1ms là dòng Burstable (tích lũy CPU credits), việc duy trì tải CPU > 80% liên tục sẽ làm cạn credit và bị bóp băng thông CPU xuống mức baseline (10-20%).
  - **Memory percent:** Cảnh báo khi sử dụng RAM > 85%.
  - **Storage percent:** Cảnh báo khi dung lượng đĩa sử dụng > 80%.
  - **Network In / Out:** Theo dõi lưu lượng truyền tải.

### 3.3. Tự động mở rộng và Lưu trữ (Storage Auto-grow)
- Cấu hình dung lượng ban đầu: 32 GiB Storage.
- Bật tính năng **Storage Auto-grow** (tự động mở rộng dung lượng khi lưu trữ đạt ngưỡng 85%) để tránh tình trạng database rơi vào trạng thái read-only khi sinh viên nộp bài đồng loạt.

---

## 4. Kế hoạch Sao lưu và Phục hồi (Backup & Disaster Recovery)

### 4.1. Sao lưu Tự động (Automated Backups)
- Azure Database for PostgreSQL Flexible Server tự động sao lưu toàn bộ dữ liệu (Full snapshot hàng tuần, Differential snapshot hàng ngày, Log backup mỗi 5 phút).
- **Thời gian lưu trữ bản sao lưu (Retention Period):** Đặt từ **7 đến 14 ngày** (mặc định 7 ngày không phát sinh thêm chi phí lớn).
- **Khôi phục về thời điểm cụ thể (Point-in-Time Restore - PITR):** Khi có sự cố thao tác nhầm hoặc hỏng dữ liệu, quản trị viên có thể khôi phục một server mới về bất kỳ phút nào trong thời gian lưu trữ sao lưu.

### 4.2. Sao lưu Logic Thủ công (Manual Export / pg_dump)
Trước các kỳ thi hoặc mốc chấm quan trọng, thực hiện xuất dữ liệu logic:
```bash
pg_dump -h <azure-host> -U <user> -d cppdsa -F c -b -v -f cppdsa_backup_$(date +%Y%m%d).dump
```

---

## 5. Giám sát và Vận hành Grader Worker (Render Free Tier)

### 5.1. Giới hạn Tài nguyên
- CPU: `0.15 vCPU`.
- RAM: `512 MB`.
- Grader áp dụng precompiled header (PCH) cho `<bits/stdc++.h>` để giảm thời gian biên dịch từ ~15s xuống ~0.5s – 1.5s ở 0.15 CPU.
- Giới hạn kích thước bộ nhớ grader `GRADER_MEMORY_BUDGET_MB=400` đảm bảo Node.js process + sandbox process không vượt quá 512 MB của container.
- Giới hạn song song `GRADER_CONCURRENCY=1` (khuyến nghị cho 0.15 CPU) giúp tránh tranh chấp CPU và context switching.

### 5.2. Healthcheck & Metrics Endpoint
- Endpoint `/health` trên Grader trả về JSON:
  ```json
  {
    "status": "ok",
    "queueLength": 0,
    "activeJobs": 0,
    "activeMemoryMb": 0,
    "memoryBudgetMb": 400
  }
  ```
- Nếu `queueLength` tăng cao liên tục trong giờ cao điểm nộp bài, hệ thống sẽ xếp hàng tuần tự theo bộ nhớ và CPU, không làm rơi rớt bài nộp của sinh viên.
- Nếu Grader gặp sự cố sập hoặc khởi động lại, dịch vụ Background Recovery trong API sẽ quét các submission ở trạng thái `PENDING` quá 30 giây để tự động gửi lại.

---

## 6. Danh mục Kiểm tra Định kỳ (Checklist)

| Chu kỳ | Nhiệm vụ | Người thực hiện |
|---|---|---|
| Hàng ngày | Kiểm tra cảnh báo email (Budget Alert, Service Health) | Quản trị viên |
| Hàng tuần | Kiểm tra mức tăng trưởng bảng `submissions`, `submission_test_results` | Quản trị viên |
| Trước kỳ thi | Kiểm tra số lượng kết nối DB, chạy test tải mô phỏng | Kỹ sư vận hành |
| Sau kỳ thi | Xuất bản sao lưu kết quả chấm thi (`pg_dump`), lưu trữ an toàn | Giảng viên / QTV |
