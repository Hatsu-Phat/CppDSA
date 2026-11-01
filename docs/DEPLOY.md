# Hướng dẫn deploy CppDSA (P9) — Vercel + Render + Azure PostgreSQL

Cập nhật: 2026-11-01 · Người viết: Claude · Trạng thái: CHƯA CHẠY trên môi trường thật.

Sơ đồ: trình duyệt → **Vercel** (`src/web`, Next.js; `/api/*` được rewrite) → **Render `cppdsa-api`** (`src/api/Dockerfile`) → **Azure PostgreSQL** (B1MS); API gửi job → **Render `cppdsa-grader`** (`src/grader/Dockerfile`) → grader gọi lại `POST /api/internal/grader-callback` của API.

Các mục có `[CẦN XÁC MINH]` là chi tiết giao diện/hạn mức của nhà cung cấp chưa được kiểm trên tài khoản thật — đối chiếu khi thao tác và ghi lại vào mục 11.

---

## 0. Điều kiện trước khi bắt đầu

| # | Việc | Ai làm | Vì sao |
|---|---|---|---|
| 0.1 | Merge T-0011 (sửa rate limit sau proxy, CSV injection, UUID 500, biên TL/ML) vào `main` | agy + Claude nghiệm thu | Không sửa thì sau rewrite của Vercel mọi người dùng chung 10 lần đăng nhập/phút và 300 request/phút → lớp học bị 429 (xem `TEST_REPORT.md` "Kiểm thử API trước deploy"). Nếu buộc deploy trước: xem mục 5.3 "Giảm nhẹ tạm thời". |
| 0.2 | Token GitHub có scope `workflow`, push `main` | Bạn | Repo có `.github/workflows/ci.yml`; Render/Vercel deploy từ GitHub. |
| 0.3 | Khởi động lại Docker Desktop | Bạn | Docker đang không mount được ổ H:; cần Docker cho bước migrate/seed. |
| 0.4 | Có tài khoản Azure (subscription free 12 tháng), Render, Vercel đăng nhập bằng GitHub | Bạn | |
| 0.5 | Xóa service thử nghiệm `cppdsa-spike` trên Render | Bạn | Tiết kiệm giờ free và tránh nhầm. |

### 0.2 Cấp scope `workflow` và push

Cách 1 — GitHub CLI (nếu đang dùng `gh`):
```bash
gh auth refresh -h github.com -s workflow
```
Cách 2 — Personal Access Token: GitHub → Settings → Developer settings → Personal access tokens → tạo token (classic) có `repo` + `workflow` (hoặc fine-grained: repo `Hatsu-Phat/CppDSA`, quyền Contents: Read and write, Workflows: Read and write) → cập nhật trong Windows Credential Manager (mục `git:https://github.com`).

Sau đó:
```bash
git checkout main
```
```bash
git push origin main
```

### Sinh secret (dùng cho nhiều bước dưới)

Chạy 2 lần, lưu vào trình quản lý mật khẩu (KHÔNG ghi vào repo):
```bash
openssl rand -hex 32
```
- `GRADER_SECRET` = chuỗi thứ nhất (API và grader dùng CÙNG giá trị).
- `COOKIE_SECRET` = chuỗi thứ hai.
- Mật khẩu DB: `cppdsa_migrator`, `cppdsa_app` — mỗi cái ≥ 20 ký tự, tránh `@ : / ? #` (để không phải mã hóa URL).

---

## 1. Azure PostgreSQL

### 1.1 Tạo server
Làm theo `docs/AZURE_SETUP.md` §2 (Flexible Server, **Burstable B1ms**, **32 GiB**, tắt auto-grow, tắt HA, backup 7 ngày, tắt geo-redundant, PostgreSQL **16**, region **Malaysia West** — gói Azure for Students chặn Southeast Asia bằng policy region; Malaysia West gần Render Singapore). Dừng lại nếu màn hình **Estimated cost** không phải 0 USD.

### 1.2 Mạng
- Networking → **Public access (allowed IP addresses)**.
- **Không** bật "Allow public access from any Azure service".
- Firewall rules: thêm IP máy bạn (**+ Add current client IP address**) để chạy migrate/seed. IP của Render thêm ở bước 4.4.
- Server parameters: `require_secure_transport` = `ON` (mặc định).

### 1.3 Tạo database và role
Mở **Cloud Shell** trên portal hoặc dùng Docker trên máy (thay `<server>` và mật khẩu admin):
```bash
docker run -it --rm postgres:16 psql "host=<server>.postgres.database.azure.com port=5432 dbname=postgres user=psqladmin sslmode=require"
```
Chạy (thay mật khẩu):
```sql
CREATE DATABASE cppdsa;
\c cppdsa
CREATE ROLE cppdsa_migrator WITH LOGIN PASSWORD '<MIGRATOR_PASSWORD>';
GRANT ALL PRIVILEGES ON DATABASE cppdsa TO cppdsa_migrator;
GRANT ALL ON SCHEMA public TO cppdsa_migrator;
CREATE ROLE cppdsa_app WITH LOGIN PASSWORD '<APP_PASSWORD>';
GRANT CONNECT ON DATABASE cppdsa TO cppdsa_app;
GRANT USAGE ON SCHEMA public TO cppdsa_app;
-- Quan trọng: default privileges phải gắn với role TẠO bảng (migrator), không phải admin
ALTER DEFAULT PRIVILEGES FOR ROLE cppdsa_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cppdsa_app;
ALTER DEFAULT PRIVILEGES FOR ROLE cppdsa_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cppdsa_app;
```
> `docs/AZURE_SETUP.md` §4.1 cũ dùng `ALTER DEFAULT PRIVILEGES` không có `FOR ROLE` → Claude đã thử trên PG16 local: `cppdsa_app` KHÔNG đọc được bảng do migrator tạo. Dùng đoạn trên. Không cần `CREATE EXTENSION pgcrypto` (`gen_random_uuid()` có sẵn từ PG13).

Hai chuỗi kết nối (giữ bí mật):
```
MIGRATOR_URL = postgres://cppdsa_migrator:<MIGRATOR_PASSWORD>@<server>.postgres.database.azure.com:5432/cppdsa?sslmode=verify-full
APP_URL      = postgres://cppdsa_app:<APP_PASSWORD>@<server>.postgres.database.azure.com:5432/cppdsa?sslmode=verify-full
```

### 1.4 Migrate + seed giảng viên (từ máy bạn)

Trước khi migrate: Azure portal → server → **Server parameters** → `azure.extensions` → tích **PGCRYPTO** → **Save** (migration `0001` gọi `CREATE EXTENSION pgcrypto`; không cho phép thì lỗi `extension "pgcrypto" is not allow-listed`, migration tự rollback). Dùng `sslmode=verify-full` (node-pg hiện coi `require` như `verify-full` và cảnh báo sẽ đổi ở bản sau; chứng chỉ Azure xác minh thành công).
Render free không có Shell/one-off job `[CẦN XÁC MINH]`, nên chạy từ máy qua Docker. Trong thư mục repo:
```bash
docker build -t cppdsa-api -f src/api/Dockerfile .
```
```bash
docker run --rm -e DATABASE_URL="<MIGRATOR_URL>" cppdsa-api npm run migrate:up
```
Cấp quyền cho bảng vừa tạo (chạy lại sau MỖI lần có migration mới để chắc chắn):
```bash
docker run -it --rm postgres:16 psql "<MIGRATOR_URL>" -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cppdsa_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cppdsa_app;"
```
Tạo tài khoản giảng viên (email và mật khẩu thật của bạn):
```bash
docker run --rm -e DATABASE_URL="<APP_URL>" -e SEED_LECTURER_EMAIL="<email>" -e SEED_LECTURER_PASSWORD="<mat-khau-manh>" cppdsa-api npm run seed:lecturer
```
Kiểm: lệnh in ra `role: 'LECTURER'`. Khi không cần nữa, xóa firewall rule IP máy bạn.

Nếu lỗi `self-signed certificate`/`unable to verify`: thử `sslmode=verify-full` vẫn lỗi thì ghi lại vào mục 11 và báo Claude `[CẦN XÁC MINH: node-pg với chứng chỉ Azure]`.

---

## 2. Render — grader (`cppdsa-grader`)

Render Dashboard → **New +** → **Web Service** → chọn repo `Hatsu-Phat/CppDSA`.

| Mục | Giá trị |
|---|---|
| Name | `cppdsa-grader` |
| Region | Singapore |
| Branch | `main` |
| Runtime / Language | **Docker** |
| Dockerfile Path | `src/grader/Dockerfile` |
| Docker Build Context Directory | `.` (gốc repo) |
| Instance Type | **Free** |
| Health Check Path (Advanced) | `/health` |
| Auto-Deploy | On Commit (hoặc tắt nếu muốn deploy tay) |

Environment Variables:

| Biến | Giá trị |
|---|---|
| `GRADER_SECRET` | `<GRADER_SECRET>` |
| `GRADER_CONCURRENCY` | `1` |
| `GRADER_WALL_FACTOR` | `10` |
| `COMPILE_TIMEOUT_MS` | `15000` |
| `COMPILE_CPU_LIMIT_S` | `10` |
| `GRADER_MEMORY_BUDGET_MB` | `400` |
| `ENABLE_PCH` | `true` (BẮT BUỘC: không PCH thì biên dịch `bits/stdc++.h` trên Render ~15.7 s > hạn 15 s) |

(Các giá trị trên đã là mặc định trong `src/grader/Dockerfile`; khai báo lại để thấy rõ trên dashboard.) Không đặt `PORT` — Render tự cấp, grader đọc `PORT`.

Create → chờ build (lần đầu lâu do dựng PCH). Kiểm: mở `https://cppdsa-grader.onrender.com/health` → `{"status":"ok",...}`. Ghi lại URL thật (`GRADER_PUBLIC_URL`).

---

## 3. Render — API (`cppdsa-api`)

**New +** → **Web Service** → cùng repo.

| Mục | Giá trị |
|---|---|
| Name | `cppdsa-api` |
| Region | Singapore |
| Branch | `main` |
| Runtime | **Docker** |
| Dockerfile Path | `src/api/Dockerfile` |
| Docker Build Context Directory | `.` |
| Instance Type | **Free** |
| Health Check Path | `/health` |

Environment Variables:

| Biến | Giá trị | Ghi chú |
|---|---|---|
| `NODE_ENV` | `production` | Bật cookie `Secure` và kiểm cấu hình lúc khởi động (thiếu `GRADER_SECRET`/`COOKIE_SECRET` hoặc `DATABASE_URL` trỏ localhost → API thoát kèm thông báo). `src/api/Dockerfile` đã đặt sẵn. |
| `DATABASE_URL` | `<APP_URL>` | Role ứng dụng. Lúc khởi động API chạy `migrate:up`; nếu không có migration mới thì role app chạy được (đã thử local). Migration mới → chạy bước 1.4 bằng MIGRATOR_URL TRƯỚC khi deploy code mới. |
| `GRADER_URL` | `<GRADER_PUBLIC_URL>` | vd `https://cppdsa-grader.onrender.com` |
| `GRADER_SECRET` | `<GRADER_SECRET>` | Giống hệt grader. |
| `API_BASE_URL` | `https://cppdsa-api.onrender.com` | URL công khai của chính API — grader gọi callback vào đây. Sửa lại nếu Render đặt URL khác. |
| `COOKIE_SECRET` | `<COOKIE_SECRET>` | |
| `TRUST_PROXY` | `2` | Số hop proxy tin cậy (Vercel → Render) `[CẦN XÁC MINH ở mục 6 bước 4]`. |
| `LOGIN_RATE_LIMIT_MAX` | `10` | Số lần đăng nhập/phút/email. |
| `LOGIN_IP_RATE_LIMIT_MAX` | `100` | Số lần đăng nhập/phút/IP (cả phòng máy chung NAT vẫn đủ). |
| `GLOBAL_RATE_LIMIT_MAX` | `300` | Request/phút/người dùng (chưa đăng nhập: theo IP). |

Kiểm: `https://cppdsa-api.onrender.com/health` → 200. Logs (tab **Logs**) có `Migrations complete!` và `API server listening`.

---

## 4. Nối các phần

### 4.1 Render → Azure firewall
Mỗi service Render → **Connect** (góc trên phải) → tab **Outbound** → copy dải IP `[CẦN XÁC MINH: vị trí mục này trên dashboard]`. Azure portal → server → **Networking** → thêm từng dải IP (vd `render-sg-1`). Chỉ API cần tới DB; grader không cần.

Nếu không tìm được IP outbound cố định: phương án cuối là rule `0.0.0.0–255.255.255.255` (mở toàn bộ) — chỉ chấp nhận khi mật khẩu `cppdsa_app` mạnh và bắt buộc SSL; ghi rủi ro vào mục 11.

### 4.2 Kiểm API ↔ DB ↔ grader
API logs không còn lỗi kết nối DB (`ECONNREFUSED`/`timeout`/`no pg_hba.conf entry`). Grader logs nhận job khi có bài nộp (bước 6).

---

## 5. Vercel — frontend

### 5.1 Tạo project
Vercel → **Add New… → Project** → Import `Hatsu-Phat/CppDSA`.

| Mục | Giá trị |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `src/web` |
| Include files outside the Root Directory | Bật (mặc định) — cần cho `src/shared` |
| Install Command (Override) | `cd ../.. && npm ci` |
| Build Command (Override) | `cd ../.. && npm run build -w src/shared && npm run build -w src/web` |
| Output Directory | để mặc định (`.next`) |
| Node.js Version (Settings → General) | 22.x |

Environment Variables (Production + Preview):

| Biến | Giá trị |
|---|---|
| `API_INTERNAL_URL` | `https://cppdsa-api.onrender.com` (không có `/` cuối) |

`API_INTERNAL_URL` được đọc lúc **build** trong `src/web/next.config.mjs` (rewrite `/api/:path*`) → đổi giá trị phải **Redeploy**. Không tạo biến `NEXT_PUBLIC_*` chứa secret.

Deploy → ghi lại URL (vd `https://cppdsa.vercel.app`).

`[CẦN XÁC MINH]` Install/Build Command override với npm workspaces: nếu build lỗi không tìm thấy `@cppdsa/shared`, gửi log build cho Claude.

### 5.2 Kiểm nhanh
Mở URL Vercel → trang đăng nhập hiện → đăng nhập bằng tài khoản giảng viên ở bước 1.4. DevTools → Application → Cookies: `sid` có `HttpOnly`, `Secure`, `SameSite=Lax`.

### 5.3 Giảm nhẹ tạm thời nếu deploy trước khi có T-0011
Đặt trên `cppdsa-api`: `LOGIN_RATE_LIMIT_MAX=300`, `GLOBAL_RATE_LIMIT_MAX=6000`. Đổi lại: chống dò mật khẩu yếu đi (300 lần thử/phút cho cả hệ thống). Chỉ dùng cho thử nghiệm, KHÔNG cho lớp thật.

---

## 6. Smoke test trên URL thật (tiêu chí nghiệm thu P9)

Trước khi bắt đầu: gọi `/health` của grader và API (đánh thức; lần đầu có thể mất ~15–60 s do Render free ngủ sau ~15 phút không dùng `[CẦN XÁC MINH: thời gian ngủ]`). Trong ứng dụng, nút warmup của giảng viên (`POST /api/system/warmup`) làm việc này.

1. Giảng viên: tạo lớp → import CSV 2–3 sinh viên (lưu mật khẩu tạm) → tạo bài TEMPLATE theo `docs/examples/template-mode` và FREE theo `docs/examples/free-mode`, mỗi bài ≥ 2 test ẩn có chuỗi đánh dấu (vd `HIDDEN_P9`).
2. Sinh viên (cửa sổ ẩn danh): đăng nhập → đổi mật khẩu → nộp AC, WA, TLE (vòng lặp vô hạn), CE ở cả hai mode → kết quả đúng; ghi thời gian từ bấm nộp tới khi có kết quả.
3. Ẩn test: xem nguồn trang/Network tab ở trang đề, kết quả, lịch sử → không có `HIDDEN_P9`; gọi `https://<vercel>/api/assignments/<id>/tests` bằng tài khoản sinh viên → 403.
4. Rate limit qua proxy (chỉ khi đã có T-0011): từ máy A đăng nhập sai 10 lần với email X → lần 11 bị 429; ngay sau đó máy/điện thoại B (mạng khác) đăng nhập email Y → phải thành công. Nếu B bị 429 → `TRUST_PROXY` sai hoặc T-0011 chưa có; báo Claude.
5. Bảng điểm CSV tải được, mở bằng Excel không chạy công thức.
6. Bộ tấn công P8 trên Render (tiêu chí P9-3), chạy từ máy bạn:
   ```bash
   tar --exclude=node_modules -cf - tests package.json | docker run -i --rm -e API_BASE_URL=https://cppdsa-api.onrender.com -e GRADER_URL=https://cppdsa-grader.onrender.com node:22-bookworm sh -c "mkdir /w && tar -xf - -C /w && cd /w && node tests/security/run-attacks.mjs"
   ```
   Runner dùng tài khoản `lecturer@cppdsa.local` / `ChangeMe123!` → hoặc seed thêm đúng tài khoản đó (bước 1.4) rồi **xóa/đổi mật khẩu sau khi chạy**, hoặc nhờ agy thêm biến môi trường cho runner. Kết quả và khác biệt so với local (`reports/P8_security.md`) ghi vào mục 11 để bạn duyệt.
7. Secret: trên Vercel → Deployment → **Source**/Build output, hoặc `curl` các file `/_next/static/chunks/*.js` và tìm `GRADER_SECRET`, `COOKIE_SECRET`, `postgres://`, `onrender.com` → chỉ được thấy URL công khai, không thấy secret. Trong repo: `git grep -n -I -E "postgres://[^:]+:[^@]{8,}@|BEGIN PRIVATE KEY"` không ra secret thật.

Ghi kết quả từng bước (PASS/FAIL, thời gian, ảnh chụp nếu lỗi) vào mục 11 hoặc gửi Claude để ghi `TEST_REPORT.md`.

---

## 7. Vận hành hằng ngày

- **Trước buổi thực hành 5 phút:** giảng viên đăng nhập và bấm warmup (đánh thức API + grader). Không nên dùng dịch vụ ping 24/7: Render free có hạn mức giờ chạy mỗi tháng cho cả workspace (`[CẦN XÁC MINH: 750 giờ/tháng]`), 2 service chạy liên tục ≈ 1440–1488 giờ → vượt.
- **Giới hạn đã đo (P8, local mô phỏng 0.15 CPU):** 20 bài nộp cùng một lúc → p95 ≈ 48 s (vượt mục tiêu 10 s); nộp rải rác (50 SV/10 phút) p95 ≈ 9 s; Render thật chậm hơn local ~1.5–2×. Khuyến nghị cho lớp: không yêu cầu cả lớp nộp đúng cùng một giây; báo trước có thể chờ 30–90 s khi đông.
- Grader giữ hàng đợi trong RAM: Render khởi động lại thì job đang chờ mất; API tự gửi lại bài PENDING quá 2 phút (tối đa 2 lần) rồi đánh `SYSTEM_ERROR`.
- Theo dõi chi phí/dung lượng/kết nối Azure: `docs/OPERATIONS.md`.

---

## 8. Cập nhật phiên bản

1. Merge vào `main` trên máy → chạy CI local (lệnh 1 của task) → `git push origin main`.
2. Có migration mới (`src/api/migrations/` thay đổi)? → chạy bước 1.4 (migrate bằng MIGRATOR_URL + GRANT) **trước**.
3. Render auto-deploy cả `cppdsa-api` và `cppdsa-grader` (theo dõi tab **Events**); Vercel auto-deploy frontend.
4. Smoke test rút gọn: đăng nhập, nộp 1 bài AC và 1 bài CE.

---

## 9. Rollback

| Thành phần | Cách làm |
|---|---|
| Vercel | Project → **Deployments** → chọn bản trước đang chạy tốt → **⋯** → **Promote to Production** (hoặc **Instant Rollback**). |
| Render (API/grader) | Service → **Events** (hoặc **Deploys**) → bản deploy trước → **Rollback** `[CẦN XÁC MINH: tên nút]`. Tắt Auto-Deploy tạm thời để commit kế tiếp không deploy lại bản lỗi. |
| Database (migration lỗi) | Rollback code trước, rồi: `docker run --rm -e DATABASE_URL="<MIGRATOR_URL>" cppdsa-api npm run migrate:down` (lùi 1 migration; image phải build từ commit CÓ migration đó). |
| Database (mất/hỏng dữ liệu) | Azure portal → server → **Restore** (point-in-time trong 7 ngày backup) → tạo **server mới** → đổi `DATABASE_URL` trên Render sang server mới → thêm firewall. Server cũ xóa sau khi kiểm xong (tránh tốn giờ B1MS: 2 server chạy song song vượt 750 giờ free). |
| Lộ secret | Sinh secret mới → cập nhật đồng thời `GRADER_SECRET` trên cả 2 service Render (Save → redeploy); `COOKIE_SECRET` mới; đổi mật khẩu role DB bằng `ALTER ROLE cppdsa_app PASSWORD '...'` rồi cập nhật `DATABASE_URL`. |

Diễn tập rollback 1 lần trong P9 (tiêu chí P9-5): promote lại bản Vercel trước rồi promote bản mới; rollback API về bản trước rồi deploy lại bản mới; ghi kết quả vào mục 11.

---

## 10. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân hay gặp | Xử lý |
|---|---|---|
| Trang đăng nhập báo lỗi mạng / 502 lâu | API đang ngủ (cold start) | Đợi 30–60 s, thử lại; dùng warmup trước giờ học. |
| Nộp bài mãi "Đang chấm" | Grader ngủ hoặc `GRADER_URL`/`GRADER_SECRET` sai, hoặc `API_BASE_URL` sai nên callback không về | Grader logs: có nhận job? có lỗi 401? API logs: có `grader-callback`? Sửa biến môi trường, redeploy. |
| API không khởi động: `permission denied for table` | Thiếu GRANT cho `cppdsa_app` | Chạy lại lệnh GRANT ở bước 1.4. |
| API không khởi động: `no pg_hba.conf entry` / timeout | Firewall Azure chưa có IP Render | Bước 4.1. |
| Mọi bài CE "Biên dịch quá thời gian" | `ENABLE_PCH=false` hoặc CPU quá yếu | Bật `ENABLE_PCH=true`; nếu vẫn lỗi gửi log cho Claude. |
| 429 "Quá nhiều yêu cầu từ địa chỉ IP" khi đông người | T-0011 chưa deploy hoặc `TRUST_PROXY` sai | Mục 0.1 / 5.3 / 6.4. |
| Đăng nhập được nhưng bị đăng xuất ngay | Cookie `Secure` trên http, hoặc gọi API trực tiếp qua domain Render thay vì qua Vercel | Luôn dùng URL Vercel (https). |

---

## 11. Nhật ký deploy (điền khi làm)

| Ngày | Bước | Kết quả | Ghi chú / khác biệt so với hướng dẫn |
|---|---|---|---|
| 2026-11-02 | 1.1 Tạo server | PASS | `cppdsa`, **Malaysia West** (Southeast Asia bị policy Azure for Students chặn), B1ms, 32 GiB, HA/autogrow/geo tắt, ước tính có "Free upto 750 hours / 32 GB". Admin login do người dùng chọn. |
| 2026-11-02 | 1.3 DB + role | PASS | Script `psql -f` (mật khẩu role đặt bằng `\password`, người dùng tự gõ). `\ddp`: `cppdsa_app=arwd` (table), `rU` (sequence) cho đối tượng do `cppdsa_migrator` tạo. Cần `GRANT cppdsa_migrator TO admin123` để chạy `ALTER DEFAULT PRIVILEGES FOR ROLE`. |
| 2026-11-02 | 1.4 Migrate + seed | PASS | Lần 1 lỗi `pgcrypto is not allow-listed` → cho phép PGCRYPTO trong `azure.extensions` → chạy lại OK. Kiểm bằng `cppdsa_app`: 9 bảng đều đủ quyền đọc/ghi, `pgmigrations` = 2, 1 LECTURER, `ssl: true`. |
| 2026-11-02 | 2–4 Render + firewall | PASS | `cppdsa-grader` Live (`/health` ok, `/jobs` và `/jobs/:id/metrics` không secret → 401). `cppdsa-api`: 2 lần deploy đầu lỗi `password authentication failed for user "cppdsa_app"` (mật khẩu trong `DATABASE_URL` sai/chưa mã hóa URL) → tạo lại URL bằng script mã hóa → Live: `No migrations to run!`, `/health` = `{"status":"ok","db":"ok"}`, UUID sai → 400, callback không secret → 401, header `x-ratelimit-limit: 300`. Render outbound Singapore: `74.220.52.0/24`, `74.220.60.0/24` (dùng chung với service Render khác) → 2 firewall rule Azure. |
| | | | |
