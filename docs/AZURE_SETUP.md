# Hướng dẫn Thiết lập Azure Database for PostgreSQL Flexible Server (AZURE_SETUP)

Tài liệu hướng dẫn chi tiết các bước thiết lập cơ sở dữ liệu Azure Database for PostgreSQL Flexible Server gói Burstable B1MS tối ưu chi phí, đảm bảo 100% trong hạn mức miễn phí 12 tháng theo `PROJECT_PLAN.md` mục 3.2, cấu hình tường lửa, phân quyền tối thiểu và chạy migration.

> [!IMPORTANT]
> **Quy tắc bảo mật và chi phí:**
> - Tài liệu này phục vụ thiết lập môi trường thật khi triển khai. Tuyệt đối **KHÔNG** tự ý tạo tài nguyên Azure thật trong quá trình kiểm thử tự động của task P5.
> - Bất kỳ thông số nào chưa được Microsoft kiểm chứng bằng văn bản chính thức được đánh dấu rõ bằng tiền tố `[CẦN XÁC MINH]`.

---

## 1. Căn cứ hạn mức miễn phí (Free Tier 12 tháng)

Căn cứ theo chính sách Microsoft Azure (được ghi nhận trong `PROJECT_PLAN.md` §3.2):
- **Thời hạn:** 12 tháng kể từ ngày kích hoạt Azure Subscription `[CẦN XÁC MINH: ngày bắt đầu trong Azure Cost Management]`.
- **Compute:** 750 giờ/tháng cho **Flexible Server Burstable B1MS** (1 vCore, 2 GiB RAM). Tháng dài nhất có 744 giờ, do đó 1 server duy nhất có thể chạy liên tục 24/7 mà không vượt hạn mức.
- **Dung lượng lưu trữ (Storage):** 32 GiB Premium SSD (vượt mức 32 GiB sẽ bắt đầu tính phí Pay-as-you-go).
- **Lưu trữ sao lưu (Backup Storage):** 32 GiB miễn phí đi kèm.

---

## 2. Các bước tạo Flexible Server trên Azure Portal

### Bước 2.1: Khởi tạo tài nguyên
1. Đăng nhập vào [Azure Portal](https://portal.azure.com/).
2. Tìm kiếm dịch vụ **Azure Database for PostgreSQL flexible servers** và chọn **Create**.
3. Chọn Subscription có gói free 12 tháng.
4. Resource Group: Tạo mới (ví dụ `rg-cppdsa-prod`) hoặc chọn Resource Group sẵn có.

### Bước 2.2: Thiết lập thông số Server (Compute & Storage)
- **Server name:** Đặt tên định danh duy nhất (ví dụ `cppdsa-psql-prod`).
- **Region:** Chọn khu vực địa lý gần dịch vụ Render nhất để giảm thiểu độ trễ mạng (Đề xuất: `Southeast Asia` - Singapore `[CẦN XÁC MINH: Render free web service triển khai tại Singapore hay Oregon/Frankfurt]`).
- **PostgreSQL version:** `16` (khớp chính xác với version local trong `docker-compose.yml`).
- **Workload type:** Chọn `Development` hoặc `Small/Medium Database`.
- **Compute tier:** Chọn **Burstable**, kích thước **Standard_B1ms** (1 vCore, 2 GiB memory).
  > [!CAUTION]
  > Tuyệt đối không chọn `General Purpose` hoặc `Memory Optimized` vì sẽ phát sinh chi phí ngay lập tức.
- **Storage:** Chọn đúng **32 GiB** (kéo thanh trượt về 32 GiB).
  - Tắt tùy chọn Auto-grow storage (ngăn hệ thống tự động tăng dung lượng làm phát sinh phí ngoài ý muốn).
- **High Availability:** Chọn **Disabled** (Không bật Zone-redundant HA vì tính năng này sẽ nhân đôi số giờ compute và vượt 750 giờ free).
- **Backup:**
  - Backup retention period: Đặt **7 ngày** (mức tối thiểu).
  - Geo-redundant backup: Chọn **Disabled** (chỉ dùng sao lưu cục bộ locally-redundant).

### Bước 2.3: Thiết lập tài khoản Quản trị ban đầu (Admin)
- **Authentication method:** PostgreSQL authentication only.
- **Admin username:** Đặt tên admin an toàn (ví dụ `psqladmin`, tránh dùng `postgres` hoặc `admin`).
- **Password:** Mật khẩu mạnh gồm chữ hoa, chữ thường, số và ký tự đặc biệt (tối thiểu 16 ký tự).

### Bước 2.4: Kiểm tra chi phí ước tính trước khi tạo
- Trước khi nhấn nút **Review + create**, kiểm tra mục **Estimated Cost**: Phải hiển thị phần miễn phí trong hạn mức 12 tháng (0.00 USD/tháng cho các tài nguyên trong định mức 750 giờ compute và 32 GiB storage). Nếu xuất hiện chi phí ngoài dự kiến → dừng và rà soát lại compute/storage.

---

## 3. Cấu hình Mạng, Tường lửa (Firewall) và TLS/SSL

### 3.1. Cấu hình Truy cập Mạng (Networking)
- **Connectivity method:** Public access (allowed IP addresses).
- **Allow public access from any Azure service:** **Disabled** (Tắt tùy chọn này để tránh mở cổng rộng rãi).

### 3.2. Quy tắc Tường lửa (Firewall Rules)
Chỉ mở cổng 5432 cho các dải IP được ủy quyền:
1. **Outbound IP của Render API Service:**
   - Tra cứu danh sách Outbound IP của service `cppdsa-api` trên Render Dashboard `[CẦN XÁC MINH: Render cung cấp danh sách cố định cho gói free hay dải IP động]`.
   - Thêm Firewall rule tương ứng trên Azure Portal (ví dụ: `render-api-outbound`).
2. **IP máy quản trị cục bộ (Local Developer IP):**
   - Thêm IP hiện tại của quản trị viên khi cần chạy migration thủ công (`Add current client IP address`).
   - Xóa bỏ rule này khi hoàn tất bảo trì.

### 3.3. Bắt buộc mã hóa đường truyền TLS/SSL
- **Enforce SSL connection:** Bắt buộc bật (`require_secure_transport = ON`).
- Chuỗi kết nối từ Backend API trên Render bắt buộc cấu hình tham số `sslmode=require`:
  ```
  DATABASE_URL=postgres://<app_user>:<app_pass>@<server_name>.postgres.database.azure.com:5432/cppdsa?sslmode=require
  ```
- Tải chứng chỉ gốc DigiCert Global Root CA của Microsoft nếu môi trường yêu cầu xác thực chứng chỉ đầy đủ `[CẦN XÁC MINH]`.

---

## 4. Thiết lập Role Người dùng Quyền Tối thiểu (Least Privilege)

Để bảo vệ cơ sở dữ liệu sản xuất, không sử dụng tài khoản admin (`psqladmin`) cho ứng dụng backend khi chạy thường nhật.

### 4.1. Tạo Database và Role Ứng dụng
Đăng nhập qua `psql` bằng tài khoản admin và thực thi kịch bản SQL sau:

```sql
-- Tạo database cho sản phẩm
CREATE DATABASE cppdsa;

-- Kết nối vào database cppdsa
\c cppdsa;

-- Kích hoạt extension pgcrypto phục vụ UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tạo role cho migration (admin quyền cao hơn nhưng không phải superuser toàn server)
CREATE ROLE cppdsa_migrator WITH LOGIN PASSWORD '<STRONG_MIGRATOR_PASSWORD>';
GRANT ALL PRIVILEGES ON DATABASE cppdsa TO cppdsa_migrator;
GRANT ALL ON SCHEMA public TO cppdsa_migrator;

-- Tạo role cho ứng dụng backend chạy thường nhật (quyền tối thiểu)
CREATE ROLE cppdsa_app WITH LOGIN PASSWORD '<STRONG_APP_PASSWORD>';
GRANT CONNECT ON DATABASE cppdsa TO cppdsa_app;
GRANT USAGE ON SCHEMA public TO cppdsa_app;

-- Cấp quyền DML (SELECT, INSERT, UPDATE, DELETE) trên tất cả bảng hiện tại và tương lai
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cppdsa_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cppdsa_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cppdsa_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cppdsa_app;
```

---

## 5. Thực thi Cơ chế Migration lên Azure

Container `api` được cấu hình tự động chạy migration khi khởi động hoặc thực hiện qua lệnh thủ công:

1. **Chuẩn bị chuỗi kết nối migration:**
   ```bash
   DATABASE_URL="postgres://cppdsa_migrator:<STRONG_MIGRATOR_PASSWORD>@<server_name>.postgres.database.azure.com:5432/cppdsa?sslmode=require"
   ```
2. **Chạy migration up:**
   ```bash
   npm run migrate:up -w @cppdsa/api
   ```
3. **Kiểm tra trạng thái bảng:**
   Đảm bảo toàn bộ các bảng `users`, `classrooms`, `classroom_enrollments`, `assignments`, `test_cases`, `submissions`, `submission_test_results`, `sessions` và các index tối ưu đều đã được tạo thành công.

---

## 6. Thiết lập Cảnh báo Ngân sách và Dung lượng (Budget & Storage Alerts)

Để tránh bất kỳ khoản phát sinh chi phí ngoài ý muốn:
1. **Azure Cost Management - Budget Alert:**
   - Vào **Cost Management + Billing** -> **Budgets**.
   - Tạo ngân sách mới với hạn mức **1.00 USD/tháng**.
   - Thiết lập ngưỡng cảnh báo khi chi phí đạt 80% (0.80 USD) và 100% (1.00 USD), gửi email thông báo khẩn cấp tới quản trị viên.
2. **Azure Monitor - Storage Alert:**
   - Vào server PostgreSQL -> **Alerts** -> **New alert rule**.
   - Signal: `Storage percent`.
   - Ngưỡng cảnh báo: Khi `Storage percent > 80%` (tương đương ~25.6 GiB / 32 GiB).
   - Thiết lập Action Group gửi thông báo để kịp thời dọn dẹp hoặc có phương án mở rộng.
3. **Quy mô kết nối (Connection Pooling):**
   - Do B1MS có cấu hình 1 vCore và 2 GiB RAM, giới hạn `max_connections` bị hạn chế `[CẦN XÁC MINH: giới hạn mặc định của B1MS thường khoảng 50-100 kết nối]`.
   - Backend API trên Render cấu hình `pg.Pool` với `max: 5` kết nối để tránh làm quá tải cơ sở dữ liệu.
