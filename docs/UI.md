# Đặc tả Giao diện FTISU CodeLab và Cấu trúc Web UI (docs/UI.md)

Tài liệu mô tả kiến trúc frontend Next.js App Router (`src/web`), cơ chế định tuyến và proxy API cùng origin, đặc tả thương hiệu FTISU CodeLab, hệ thống bảng màu chuyển đổi sáng/tối với View Transitions API, trang tài khoản, giao diện làm bài dạng tab của sinh viên và bộ công cụ chấm/quản lý test của giảng viên.

---

## 1. Kiến trúc Frontend và Nhận diện Thương hiệu

- **Framework:** Next.js (App Router) với React 18, TypeScript, pure CSS (không phụ thuộc thư viện UI nặng).
- **Thương hiệu FTISU CodeLab (`src/web/lib/brand.ts`):**
  - Tên hiển thị: `FTISU CodeLab`
  - Dòng phụ: `Chấm bài C++ · Cấu trúc dữ liệu & Giải thuật`
  - Nhãn hệ thống mẹ: `một phần của FTISU LMS` (liên kết tới `https://lms.ftisu.vn`)
  - Tất cả chuỗi thương hiệu được tập trung duy nhất trong `src/web/lib/brand.ts` phục vụ đồng bộ `<title>`, Navbar, trang chủ và trang đăng nhập.
- **Cơ chế Proxy Rewrite (Next.js Rewrites):**
  - Trình duyệt chỉ tương tác với duy nhất origin frontend (ví dụ `http://web:3000` hoặc domain Vercel).
  - Request có tiền tố `/api/:path*` được rewrite trong `next.config.mjs` chuyển tiếp tới `${API_INTERNAL_URL}/api/:path*` (`http://api:4000`).
  - Cookie phiên `sid` (`httpOnly`, `SameSite=Lax`) được trình duyệt gửi tự động qua proxy rewrite.

---

## 2. Hệ thống Bảng màu và Chuyển đổi Sáng/Tối (Light/Dark Theme)

- **Biến CSS (`globals.css`):**
  - Bộ biến `:root[data-theme="light"]`: Nền trang `#f8fafc`, thẻ card `#ffffff`, chữ `#0f172a`, primary `#1976d2`.
  - Bộ biến `:root[data-theme="dark"]`: Nền trang slate đậm `#0b1220`, thẻ card `#111a2e`, chữ `#e2e8f0`, primary `#4f9cf0`.
  - Độ tương phản chữ (Contrast ratio) ≥ 4.5:1 ở cả 2 chế độ.
  - Màu Verdict:
    - Đúng (AC): xanh lá (`--verdict-ac`, `--verdict-ac-bg`)
    - Sai kết quả (WA): đỏ (`--verdict-wa`, `--verdict-wa-bg`)
    - Quá thời gian (TLE) & Quá bộ nhớ (MLE): cam (`--verdict-tle`, `--verdict-tle-bg`)
    - Lỗi khi chạy (RE): tím (`--verdict-re`, `--verdict-re-bg`)
    - Lỗi biên dịch (CE): xám/slate (`--verdict-ce`, `--verdict-ce-bg`)
    - Đang chấm (PENDING/RUNNING): xanh dương (`--verdict-pending`, `--verdict-pending-bg`)
- **Hiệu ứng chuyển đổi (Theme Toggle):**
  - Nút mặt trời/mặt trăng (`ThemeToggle.tsx`) tại Navbar, trang chủ và trang đăng nhập.
  - Sử dụng View Transitions API (`document.startViewTransition` + `clip-path: circle()`) tạo hiệu ứng "vòng tròn lan" từ vị trí nút bấm.
  - Tự động fallback đổi tức thì khi trình duyệt không hỗ trợ hoặc kích hoạt `prefers-reduced-motion`.
  - Lưu trạng thái vào `localStorage['theme']`, mặc định theo `prefers-color-scheme`.
  - Chống nháy (Flash of unstyled theme): Script inline nhỏ đặt trong `<head>` của `layout.tsx` thiết lập `data-theme` trước khi trình duyệt vẽ trang đầu tiên.

---

## 3. Các Trang Công cộng & Tài khoản

### 3.1. Trang chủ (`/`)
- Header mảnh: Logo biểu tượng `</>` bo góc màu primary, tên thương hiệu `FTISU CodeLab`, nút sáng/tối và nút "Đăng nhập" (nếu đã đăng nhập sẽ dẫn vào trang theo vai trò).
- Thân trang chia 2 cột:
  - Cột trái: Nhãn môn học, tiêu đề 2 dòng ngắn ("Viết C++. Nộp bài. Có kết quả ngay."), câu giới thiệu, MỘT nút "Đăng nhập" và ghi chú hệ thống mẹ.
  - Cột phải: Cửa sổ code giả lập (`MockCodeWindow.tsx`) với thanh tiêu đề 3 chấm, hiệu ứng gõ từng ký tự một đoạn code C++ (12–18 dòng) có tô màu cú pháp (keywords, types, strings, numbers, comments, #include), con trỏ nhấp nháy; sau đó hiển thị khung "Kết quả chấm" chạy lần lượt từng test và điểm số; lặp qua 3 đoạn thuật toán mẫu (BFS, tìm kiếm nhị phân, stack). Hỗ trợ `prefers-reduced-motion` hiển thị tĩnh.
- Nền chấm lưới mờ CSS (`bg-grid`).
- Thích ứng di động: Cửa sổ code xếp xuống dưới cột văn bản, không cuộn ngang.

### 3.2. Trang Đăng nhập (`/login`)
- Khung thẻ giữa màn hình, thương hiệu đồng nhất, tích hợp nút sáng/tối.
- Chừa sẵn hàm `loginProviders()` trả mảng rỗng để tích hợp SSO FTISU LMS trong tương lai (không hiển thị nút giả).
- Xử lý chuyển hướng: Tài khoản mới bắt buộc đổi mật khẩu -> `/change-password`, Giảng viên -> `/lecturer`, Sinh viên -> `/student`.

### 3.3. Trang Tài khoản (`/account`)
- Dành cho cả Giảng viên và Sinh viên.
- Hiển thị thông tin hồ sơ: Họ và tên, email, vai trò.
- Biểu mẫu đổi mật khẩu: Mật khẩu hiện tại, mật khẩu mới (tối thiểu 6 ký tự), xác nhận mật khẩu; kiểm tra trùng khớp phía client; gửi `POST /api/auth/change-password`; hiển thị thông báo kết quả bằng tiếng Việt.
- Navbar: Email người dùng liên kết trực tiếp tới `/account`.

---

## 4. Giao diện Giảng viên (`/lecturer/**`)

- **Bỏ `SystemWarmupButton`:** API đã tự động đánh thức grader trong nền khi đăng nhập, loại bỏ hoàn toàn nút khởi động thủ công.
- **Biểu mẫu Bài tập (`AssignmentForm.tsx`):**
  - Chế độ FREE không còn ô nhập harness hay điểm vào; hiển thị ghi chú: "Sinh viên nộp chương trình đầy đủ (có `main`); hệ thống chấm bằng so sánh output."
- **Quản lý Bộ kiểm thử (`/lecturer/assignments/[id]/tests`):**
  - Bỏ ô nhập "Thứ tự" (API tự động sắp xếp và đánh số).
  - Khối "Nhập bộ test": Chọn nhiều file hoặc cả thư mục (hỗ trợ `webkitdirectory`), tự động ghép cặp theo tên gốc: đầu vào `.in`/`.inp`/`.input`/`input*.txt` với đầu ra `.out`/`.ans`/`.ok`/`.output`/`output*.txt`.
  - Sắp xếp cặp test theo thứ tự tự nhiên (ví dụ 2 đứng trước 10).
  - Bảng xem trước các cặp test hợp lệ và cảnh báo danh sách file lẻ không ghép được cặp.
  - Tùy chọn "Ẩn với sinh viên" (mặc định bật) và "Thay toàn bộ test cũ". Gửi tới `POST /api/assignments/:id/tests/bulk`.
  - Xử lý thông báo lỗi tiếng Việt khi vượt quá giới hạn 50 test case hoặc kích thước file > 1 MB.
  - Nút "Chấm lại tất cả bài nộp" xác nhận trước khi gửi `POST /api/assignments/:id/regrade` và hiển thị số bài đã xếp hàng.
- **Chi tiết Bài nộp Giảng viên (`/lecturer/submissions/[id]`):**
  - Khung sửa điểm thủ công: Ô nhập điểm từ 0.00 đến 1.00 (bước 0.01, hiển thị quy đổi phần trăm) kèm nút "Lưu điểm" gửi `PATCH /api/submissions/:id/score`.
  - Nút "Chấm lại" gửi `POST /api/submissions/:id/regrade` và tự động kích hoạt poller cập nhật tiến trình chấm trực tiếp.

---

## 5. Giao diện Sinh viên (`/student/**`)

- **Bảo mật và Tối giản:**
  - Tuyệt đối không hiển thị chế độ (`TEMPLATE`/`FREE`), không hiển thị chuỗi `SYSTEM_ERROR` và không hiển thị mã ID bài nộp ở bất kỳ đâu trên giao diện sinh viên.
- **Giao diện làm bài dạng Tab (`/student/assignments/[id]`):**
  - Đầu trang: Tiêu đề bài tập + các chip giới hạn thời gian (TL), bộ nhớ (ML), hạn nộp (+ nhãn "Đã quá hạn" nếu quá hạn).
  - Hai tab chức năng:
    1. **Tab "Làm bài":**
       - Mô tả chi tiết đề bài.
       - Danh sách ví dụ mẫu công khai dạng thẻ Input/Output kèm nút "Sao chép" tiện lợi.
       - Trình soạn thảo: Font monospace, phím Tab chèn 4 dấu cách. Đối với bài Template: Các khối code khung cố định hiển thị ở dạng thẻ `<pre>` nền tối chỉ đọc; sinh viên điền code vào các ô textarea vùng mở. Đối với bài FREE: Ô soạn thảo chương trình hoàn chỉnh điền sẵn khung C++ chuẩn (`#include <bits/stdc++.h>`, `using namespace std;`, `int main() { ... }`).
       - Nút "Nộp bài" gửi payload (`studentSource` đối với FREE, `regions` đối với Template).
    2. **Tab "Lịch sử nộp":**
       - Huy hiệu (badge) hiển thị số lượng bài đang được chấm nếu có.
       - Bấm "Nộp bài" từ tab "Làm bài" sẽ **tự động chuyển sang tab "Lịch sử nộp"**.
       - Bài nộp mới nhất hiển thị ở đầu với trạng thái "Đang chấm..." và tự động thăm dò (polling) tới khi hoàn tất.
       - Bấm vào một dòng bài nộp để xem chi tiết: Kết quả từng test, thời gian chạy, bộ nhớ, thông báo lỗi biên dịch (nếu có), nhãn "Nộp trễ" (nếu nộp sau hạn).
       - Nhãn kết quả tiếng Việt có màu: Đúng (xanh lá), Sai kết quả (đỏ), Quá thời gian (cam), Quá bộ nhớ (cam), Lỗi khi chạy (tím), Lỗi biên dịch (xám đậm), Đang chấm (xanh dương), Lỗi hệ thống (đỏ).

---

## 6. Chiến lược Kiểm thử Tự động (E2E)

1. `tests/e2e/student.spec.ts`:
   - Chụp 5 ảnh giao diện: `home-light.png`, `home-dark.png`, `home-mobile.png`, `login.png`, `account.png`, `student-assignment-work.png`, `student-assignment-history.png`.
   - Kiểm tra đổi theme chuyển thuộc tính `data-theme`.
   - Kiểm tra đổi mật khẩu tại `/change-password` và trang `/account`.
   - Kiểm tra luồng làm bài Template và FREE (tất cả các verdict: AC, WA, CE, TLE, MLE, RE).
   - Kiểm tra tự động chuyển tab sang Lịch sử nộp sau khi nộp.
   - Kiểm tra không lộ dữ liệu test ẩn (`HIDDEN_MARK_P7`), không lộ `TEMPLATE`/`FREE`/`SYSTEM_ERROR`/ID bài nộp.
   - Kiểm tra responsive trên viewport 390×844 không bị cuộn ngang.
   - Kiểm tra 0 lỗi console và 0 page error.
2. `tests/e2e/lecturer.spec.ts`:
   - Tạo bài FREE không cần harness.
   - Nhập bộ test hàng loạt từ file (`.inp` + `.out`) qua `setInputFiles`, chụp ảnh `lecturer-tests-import.png`.
   - Chấm lại toàn bộ bài nộp của bài tập.
   - Chụp ảnh `lecturer-submission.png` tại trang chi tiết bài nộp.
   - Chỉnh sửa điểm số và lưu điểm qua API `PATCH /score`.
   - Chấm lại 1 bài nộp và tự động cập nhật kết quả.
   - Kiểm tra 0 lỗi console và 0 page error.
