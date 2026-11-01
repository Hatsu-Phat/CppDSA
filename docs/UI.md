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
  - Nếu người dùng có vai trò `STUDENT`: Chuyển hướng tới bảng điều khiển sinh viên `/student`.
  - Nếu vai trò khác hoặc chưa xác định: Chuyển hướng về trang chủ `/`.
- **Trang Đổi mật khẩu (`/change-password`):**
  - Nhập mật khẩu cũ, mật khẩu mới (tối thiểu 6 ký tự) và xác nhận mật khẩu.
  - Gửi `POST /api/auth/change-password`.
  - Sau khi đổi thành công, chuyển hướng người dùng vào giao diện tương ứng với vai trò (`LECTURER` -> `/lecturer`, `STUDENT` -> `/student`).
- **Bảo vệ Vùng Giảng viên (`/lecturer/**`):**
  - Component Layout `src/web/app/lecturer/layout.tsx` kiểm tra phiên thông qua `GET /api/auth/me`.
  - Nếu chưa đăng nhập: Chuyển về `/login`.
  - Nếu chưa đổi mật khẩu ban đầu: Chuyển về `/change-password`.
  - Nếu đã đăng nhập nhưng không có vai trò `LECTURER`: Hiển thị thông báo HTTP 403 Forbidden và nút chuyển về đăng nhập.
- **Bảo vệ Vùng Sinh viên (`/student/**`):**
  - Component Layout `src/web/app/student/layout.tsx` kiểm tra phiên thông qua `GET /api/auth/me`.
  - Nếu chưa đăng nhập: Chuyển về `/login`.
  - Nếu chưa đổi mật khẩu ban đầu: Chuyển về `/change-password`.
  - Nếu đã đăng nhập nhưng không có vai trò `STUDENT`: Hiển thị thông báo HTTP 403 Forbidden và nút chuyển về đăng nhập.

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
   - `src/web/tests/template-editor.test.tsx`: Kiểm tra tách đúng các vùng từ template, phần cố định không sửa được (khối `<pre>` khóa), payload chỉ chứa `regions`.
   - `src/web/tests/free-mode-editor.test.tsx`: Kiểm tra thiếu tên điểm vào báo lỗi, method thiếu tên lớp báo lỗi, payload đúng schema `{ studentSource, entry }`.
   - `src/web/tests/submission-result.test.tsx`: Bảng kết quả không render input/expected của test ẩn; hiển thị verdict, thời gian, bộ nhớ; hiển thị lỗi CE; hiển thị thông báo thân thiện khi SYSTEM_ERROR; nhãn "Nộp trễ".
   - `src/web/tests/submission-polling.test.tsx`: Kiểm tra component polling mỗi 2 s, dừng polling khi trạng thái cuối (`COMPLETED` hoặc `SYSTEM_ERROR`), hủy polling khi unmount (sử dụng fake timers).
   - `src/web/tests/home.test.tsx` & `health.test.ts`: Đảm bảo kiểm tra sức khỏe và trang chủ hoạt động ổn định.
2. **End-to-End Tests (Playwright):**
   - Tệp kiểm thử `tests/e2e/lecturer.spec.ts` chạy trên môi trường Docker compose đầy đủ (`web`, `api`, `grader`, `db`) cho toàn bộ luồng giảng viên.
   - Tệp kiểm thử `tests/e2e/student.spec.ts` chạy trên môi trường Docker compose đầy đủ: bao phủ luồng sinh viên đăng nhập -> đổi mật khẩu -> vào lớp -> làm bài Template (AC, WA, CE, TLE, MLE, RE) -> làm bài Free (AC, WA, CE) -> xem lịch sử nộp bài -> kiểm tra không lộ test ẩn (`HIDDEN_MARK_P7`) -> nộp bài quá hạn có nhãn "Nộp trễ" -> kiểm tra responsive 390x844 (không cuộn ngang) -> kiểm tra 0 lỗi console/pageerror.

---

## 7. Các Màn hình Chức năng Sinh viên (P7)

### 7.1. Danh sách Lớp học Đã Ghi danh (`/student`)
- Hiển thị danh sách tất cả các lớp học mà sinh viên đã được giảng viên ghi danh (`GET /api/classrooms`).
- Mỗi thẻ lớp học hiển thị: Tên lớp, mô tả, ngày ghi danh, nút "Vào lớp học →" dẫn tới `/student/classrooms/:id`.
- Trường hợp chưa có lớp: Hiển thị thông báo trạng thái rỗng thân thiện.

### 7.2. Danh sách Bài tập trong Lớp (`/student/classrooms/[id]`)
- Hiển thị thông tin lớp học và danh sách các bài tập được giao (`GET /api/classrooms/:id/assignments`).
- Mỗi thẻ bài tập hiển thị: Tiêu đề, nhãn chế độ (`TEMPLATE` hoặc `FREE`), giới hạn TL/ML, hạn nộp (kèm cảnh báo nếu đã quá hạn), điểm chính thức cao nhất đã đạt được (`bestScore`).
- Nút "Làm bài →" dẫn tới không gian nộp bài `/student/assignments/:id`.

### 7.3. Không gian Làm bài & Nộp bài (`/student/assignments/[id]`)
- **Thông tin đề bài & ví dụ mẫu:**
  - Tiêu đề, nhãn chế độ rõ ràng (AC-US-11-2).
  - Giới hạn TL (ms), ML (MB), hạn nộp. Cảnh báo nộp trễ nếu hạn nộp đã qua.
  - Mô tả bài toán và danh sách ví dụ mẫu công khai (`sampleTests`) nếu có.
- **Trình soạn thảo TEMPLATE Mode (`TemplateEditor.tsx`):**
  - Tự động tách template thành các khối cố định và khối sinh viên.
  - Toàn bộ mã nguồn khung bên ngoài marker `// STUDENT_BEGIN` ... `// STUDENT_END` được hiển thị trong khối `<pre>` khóa chỉ đọc (không có bất kỳ ô input/textarea nào).
  - Mỗi vùng sinh viên là một `<textarea>` riêng biệt có nhãn định danh vùng.
  - Client chỉ gửi payload `{ regions: { <tên_vùng>: <mã_nguồn> } }` (AC-US-12-2).
- **Trình soạn thảo FREE Mode (`FreeModeEditor.tsx`):**
  - Hiển thị giao diện chấm yêu cầu (`entryPointSpec`).
  - Ô `<textarea>` mã nguồn C++ cùng nút tải tệp `.cpp` (đọc qua FileReader, kiểm tra dung lượng ≤ 64 KB).
  - Khung "Khai báo điểm vào" cho phép chọn loại `function`/`method`, nhập tên hàm/phương thức và tên lớp.
  - Client kiểm tra tính hợp lệ của định danh C++ trước khi gửi payload `{ studentSource, entry }`.
- **Theo dõi tiến trình chấm thời gian thực (Polling):**
  - Polling tự động `GET /api/submissions/:id` mỗi 2 giây sau khi nộp bài.
  - Hiển thị chuyển trạng thái `PENDING` -> `RUNNING` -> `COMPLETED`/`SYSTEM_ERROR` mà không cần tải lại trang (AC-US-14-1).
  - Tự động dừng polling khi đạt trạng thái cuối hoặc khi sinh viên rời khỏi trang.
  - Bắt lỗi HTTP 429 khi nộp quá nhanh (tối đa 6 lần/phút) và hiển thị thông báo chờ.
  - Xử lý lỗi `SYSTEM_ERROR` với thông báo thân thiện và hướng dẫn thử lại (AC-US-14-2).
- **Xem kết quả chấm chi tiết:**
  - Điểm số tổng kết và tỷ lệ test đạt.
  - Badge verdict tổng quan (`AC`, `WA`, `TLE`, `MLE`, `RE`, `CE`).
  - Khung hiển thị thông báo lỗi biên dịch (Compile Output) đã cắt gọn khi bị `CE`.
  - Bảng kết quả từng test ẩn: Thứ tự test (Test 1, Test 2...), verdict, thời gian chạy (ms), dung lượng bộ nhớ (KB).
  - Tuyệt đối không render dữ liệu input/expected/actual của các test ẩn trên giao diện (AC-US-15-3).
- **Lịch sử nộp bài (`SubmissionHistoryTable.tsx`):**
  - Danh sách tất cả các lần nộp của sinh viên cho bài tập.
  - Hiển thị thời gian nộp, trạng thái, điểm số, nhãn "Nộp trễ" nếu nộp sau deadline.
  - Nút "Xem kết quả" cho phép xem lại chi tiết bất kỳ lần nộp nào trước đó.
- **Tính tương thích thiết bị di động (Responsive):**
  - Thiết kế thích ứng hoạt động trơn tru ở độ phân giải 390×844 và 1280×800.
  - Đảm bảo `document.documentElement.scrollWidth <= window.innerWidth` (không bị cuộn ngang trang, các bảng tự cuộn ngang nội bộ qua container `.table-responsive`).
