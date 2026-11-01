# Đặc tả Giao diện Giảng viên và Cấu trúc Web UI (docs/UI.md)

Tài liệu mô tả kiến trúc frontend Next.js App Router (`src/web`), cơ chế định tuyến và proxy API cùng origin, đặc tả các màn hình chức năng dành cho Giảng viên theo các User Stories (US-01 đến US-08), cơ chế kiểm tra dữ liệu form và chiến lược kiểm thử tự động.

---

## 1. Kiến trúc Frontend và Cơ chế Proxy Rewrite

- **Framework:** Next.js 14 (App Router) với React 18, TypeScript, pure CSS (không phụ thuộc thư viện UI nặng).
- **Cơ chế Proxy Rewrite (Next.js Rewrites):**
  - Trình duyệt chỉ tương tác với duy nhất origin frontend (ví dụ `http://web:3000` hoặc domain Vercel).
  - Mọi request có tiền tố `/api/:path*` được rewrite trong `next.config.mjs` chuyển tiếp tới `${API_INTERNAL_URL}/api/:path*` (trong Docker compose: `http://api:4000`).
  - Toàn bộ cookie phiên (`sid`) với cờ `httpOnly`, `SameSite=Lax` được trình duyệt gửi tự động qua proxy rewrite mà không bị rào cản cookie bên thứ ba (Third-party cookies).
  - Không chứa bất kỳ database credentials, backend secrets hay URL database trong bundle `src/web`.

---

## 2. Xác thực và Phân quyền Phía Giao diện

- **Trang Đăng nhập chung (`/login`):**
  - Tiếp nhận email và mật khẩu của người dùng.
  - Gửi `POST /api/auth/login`.
  - Nếu tài khoản có cờ `mustChangePassword === true`: Chuyển hướng ngay lập tức tới trang đổi mật khẩu `/change-password`.
  - Nếu người dùng có vai trò `LECTURER`: Chuyển hướng tới bảng điều khiển giảng viên `/lecturer`.
  - Nếu không phải giảng viên: Chuyển hướng về trang chủ `/`.
- **Trang Đổi mật khẩu (`/change-password`):**
  - Nhập mật khẩu cũ, mật khẩu mới (tối thiểu 6 ký tự) và xác nhận mật khẩu.
  - Gửi `POST /api/auth/change-password`.
  - Sau khi đổi thành công, chuyển hướng người dùng vào giao diện tương ứng với vai trò.
- **Bảo vệ Vùng Giảng viên (`/lecturer/**`):**
  - Component Layout `src/web/app/lecturer/layout.tsx` kiểm tra phiên thông qua `GET /api/auth/me`.
  - Nếu chưa đăng nhập: Chuyển về `/login`.
  - Nếu chưa đổi mật khẩu ban đầu: Chuyển về `/change-password`.
  - Nếu đã đăng nhập nhưng không có vai trò `LECTURER`: Hiển thị thông báo HTTP 403 Forbidden và nút chuyển về đăng nhập.

---

## 3. Các Màn hình Chức năng Giảng viên (P6)

### 3.1. Thanh điều hướng và Khởi động Hệ thống (US-07)
- **Thanh điều hướng (`Navbar`):**
  - Hiển thị logo/tiêu đề hệ thống CppDSA, email của giảng viên đang đăng nhập, nút đăng xuất (`POST /api/auth/logout`).
- **Nút "Khởi động hệ thống" (`SystemWarmupButton`):**
  - Cho phép giảng viên chủ động đánh thức các dịch vụ đám mây miễn phí trước buổi thực hành.
  - Gửi `POST /api/system/warmup`.
  - Hiển thị trạng thái chi tiết của Cơ sở dữ liệu (Database: Sẵn sàng / Lỗi) và Máy chủ chấm bài (Grader: Sẵn sàng / Lỗi) cùng trạng thái tổng thể.

### 3.2. Quản lý Lớp học (`/lecturer`)
- Danh sách tất cả các lớp học do giảng viên sở hữu (`GET /api/classrooms`).
- Modal "Tạo lớp học mới": Nhập tên lớp (bắt buộc) và mô tả. Gửi `POST /api/classrooms`.
- Thao tác xóa lớp học với hộp thoại xác nhận.

### 3.3. Chi tiết Lớp học (`/lecturer/classrooms/[id]`)
Bao gồm 3 tab chức năng:

#### Tab 1: Quản lý Sinh viên & Nhập CSV (US-01, US-08)
- **Danh sách sinh viên:** Hiển thị mã sinh viên, họ tên, email, ngày ghi danh (`GET /api/classrooms/:id/students`).
- **Đặt lại mật khẩu sinh viên (US-08):** Giảng viên bấm nút "Đặt lại mật khẩu" trên dòng của sinh viên (`POST /api/classrooms/:id/students/:studentId/reset-password`). Giao diện hiển thị mật khẩu tạm thời một lần duy nhất qua banner cảnh báo để giảng viên bàn giao cho sinh viên.
- **Nhập danh sách sinh viên bằng CSV (US-01):**
  - Hỗ trợ tải tệp tin `.csv` hoặc dán trực tiếp dữ liệu vào textarea.
  - Định dạng header: `student_code,full_name,email` (tối đa 500 dòng).
  - Phản hồi lỗi từng dòng: Hiển thị danh sách các dòng bị lỗi cú pháp/trùng lặp (ví dụ `Dòng 4: Email không hợp lệ`) mà không làm gián đoạn các dòng hợp lệ.
  - Bảng mật khẩu tạm thời: Hiển thị bảng tổng hợp mã sinh viên, email và mật khẩu tạm thời được cấp mới cho các tài khoản vừa được tạo.

#### Tab 2: Quản lý Bài tập Thực hành (US-02, US-03, US-04)
- Danh sách các bài tập trong lớp kèm chế độ (Template / Free mode), TL, ML, hạn nộp.
- Nút "Tạo bài tập mới" dẫn tới form tạo bài.
- Các liên kết thao tác: Sửa bài tập, Quản lý bộ test ẩn, Xóa bài tập.

#### Tab 3: Bài nộp & Kết quả Chấm (US-05, US-06)
- **Bộ lọc đa tiêu chí (US-05-1):**
  - Lọc theo bài tập cụ thể.
  - Lọc theo trạng thái bài nộp (`PENDING`, `RUNNING`, `COMPLETED`, `SYSTEM_ERROR`).
  - Lọc theo khoảng điểm (`minScore`, `maxScore`).
  - Lọc theo khoảng thời gian nộp (`from`, `to`).
- **Bảng bài nộp:** Hiển thị mã SV, họ tên, tên bài tập, trạng thái chấm, điểm số (thang điểm 1.00), số test đạt, nhãn Hạn nộp (Đúng hạn / Nộp trễ) và thời gian nộp.
- **Chi tiết bài nộp (US-05-2):**
  - Mở modal xem toàn bộ mã nguồn sinh viên đã nộp.
  - Xem thông báo lỗi biên dịch (Compile output) nếu có lỗi cú pháp.
  - Bảng kết quả từng test ẩn: Thứ tự test, Verdict (`AC`, `WA`, `TLE`, `MLE`, `RE`, `CE`), thời gian thực thi (ms), dung lượng bộ nhớ (KB) và trích đoạn output của sinh viên.
- **Xuất bảng điểm ra CSV (US-06):**
  - Nút "Xuất bảng điểm (CSV)" gửi yêu cầu tới `/api/classrooms/:id/grades/csv` (hỗ trợ lọc theo bài tập).
  - Tải về tệp tin `.csv` phản ánh chính xác điểm cao nhất hợp lệ trước deadline và đánh dấu trạng thái trễ nếu có bài nộp sau deadline.

---

## 4. Biểu mẫu Bài tập và Kiểm tra Dữ liệu (US-02, US-03)

Biểu mẫu `AssignmentForm.tsx` áp dụng kiểm tra nghiêm ngặt cả ở client-side và hiển thị lỗi từ API:
- **Tiêu đề:** Bắt buộc không được để trống.
- **Thời gian chạy (TL):** Bắt buộc là số nguyên dương (`> 0`), mặc định 1000 ms.
- **Giới hạn bộ nhớ (ML):** Bắt buộc là số nguyên dương (`> 0`), mặc định 256 MB.
- **Hạn nộp (Deadline):** Bắt buộc là ngày giờ hợp lệ.
- **Chế độ Template Mode:**
  - Kiểm tra cặp marker `// STUDENT_BEGIN <tên_vùng>` và `// STUDENT_END`.
  - Báo lỗi rõ ràng nếu thiếu thẻ đóng `// STUDENT_END`, lồng thẻ marker, hoặc không có cặp marker nào.
  - Giới hạn dung lượng mã template ≤ 64 KB.
- **Chế độ Free Mode:**
  - Nhập mô tả giao diện hàm hoặc harness chấm (định dạng JSON hoặc mô tả tự do).
- **Phản hồi lỗi API:** Hiển thị lỗi từ backend (HTTP 400 hoặc 413) trong khung thông báo đỏ nếu vi phạm nghiệp vụ server.

---

## 5. Quản lý Bộ Kiểm thử Ẩn (`/lecturer/assignments/[id]/tests`)

- Danh sách các test case hiện có của bài tập (`GET /api/assignments/:id/tests`).
- Biểu mẫu thêm test case mới:
  - Input data (bắt buộc).
  - Expected output (bắt buộc).
  - Cờ `isHidden` (mặc định bật).
  - Cờ `isSample` (cho các ví dụ mẫu minh họa).
  - Thứ tự sắp xếp `orderIndex` (tự động tính tăng dần nếu không nhập).
- Chỉnh sửa và xóa test case trực tiếp trên giao diện (`PUT /api/tests/:id`, `DELETE /api/tests/:id`).

---

## 6. Chiến lược Kiểm thử Tự động

1. **Component Tests (Vitest + Testing Library):**
   - `src/web/tests/assignment-form.test.tsx`: Kiểm tra chuyển đổi 2 chế độ Template và Free mode; kiểm tra client-side validation từ chối tiêu đề rỗng, TL âm, ML âm, template thiếu `STUDENT_END`; kiểm tra hiển thị lỗi 413 từ server.
   - `src/web/tests/csv-import.test.tsx`: Kiểm tra biểu mẫu import CSV; kiểm tra hiển thị lỗi chi tiết từng dòng (`Dòng 4: ...`) và bảng mật khẩu tạm thời cho tài khoản mới.
   - `src/web/tests/home.test.tsx` & `health.test.ts`: Đảm bảo kiểm tra sức khỏe và trang chủ hoạt động ổn định.
2. **End-to-End Tests (Playwright):**
   - Tệp kiểm thử `tests/e2e/lecturer.spec.ts` chạy trên môi trường Docker compose đầy đủ (`web`, `api`, `grader`, `db`).
   - Giám sát nghiêm ngặt: Theo dõi sự kiện `page.on('console')` và `pageerror`, bảo đảm 0 lỗi console trong toàn bộ kịch bản.
   - Bao phủ toàn diện luồng nghiệp vụ: Đăng nhập giảng viên -> Tạo lớp -> Import CSV (2 sinh viên + 1 dòng lỗi) -> Tạo bài Template & bài Free -> Thêm hidden tests -> Sinh viên nộp bài qua API -> Giảng viên kiểm tra submission, điểm số, verdict chi tiết -> Xuất bảng điểm CSV -> Khởi động hệ thống.
