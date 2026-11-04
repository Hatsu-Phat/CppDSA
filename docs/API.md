# Đặc tả Giao diện Lập trình Ứng dụng Backend API (API.md)

Tài liệu tóm tắt cấu trúc API, cơ chế xác thực phiên, phân quyền bảo mật, giới hạn kích thước và các quy tắc nghiệp vụ trong hệ thống CppDSA.

Chi tiết lược đồ request/response và mã lỗi xem tại [docs/openapi.yaml](openapi.yaml).

---

## 1. Cơ chế Xác thực và Quản lý Phiên (Authentication & Session)

- **Cơ chế:** Đăng nhập sử dụng email và mật khẩu; phiên duy trì qua cookie `sid` (Session ID).
- **Session Token:** Chuỗi ngẫu nhiên 32 byte sinh qua `crypto.randomBytes(32).toString('hex')`.
- **Lưu trữ CSDL:** Server chỉ lưu mã băm SHA-256 của token (`sessions.token_hash`), không lưu token dạng thô.
- **Thời hạn phiên:** 12 giờ kể từ thời điểm đăng nhập.
- **Cấu hình Cookie `sid`:**
  - `httpOnly: true` (chống truy cập từ JavaScript client).
  - `sameSite: 'lax'` (bảo vệ chống CSRF).
  - `secure: true` khi `NODE_ENV=production`.
  - `path: '/'`.
- **Băm mật khẩu:** Sử dụng `bcryptjs` với work factor / cost ≥ 10.
- **Cờ `must_change_password`:**
  - Khi tài khoản sinh viên được tạo qua CSV hoặc reset mật khẩu, cờ `must_change_password = true`.
  - Khi cờ này mang giá trị `true`, người dùng bị chặn toàn bộ hệ thống với mã lỗi HTTP 403 `PASSWORD_CHANGE_REQUIRED`, **ngoại trừ** 3 endpoint:
    1. `POST /api/auth/change-password`
    2. `POST /api/auth/logout`
    3. `GET /api/auth/me`

---

## 2. Luật Phân quyền và Kiểm soát Truy cập (Authorization Rules)

Tất cả các kiểm tra quyền được thực hiện nghiêm ngặt tại Backend API:

| Đối tượng dữ liệu | Quyền của Giảng viên (Lecturer) | Quyền của Sinh viên (Student) |
|---|---|---|
| **Lớp học (Classrooms)** | CRUD đầy đủ lớp do mình sở hữu (`lecturer_id = user.id`). Bị cấm 403 khi thao tác trên lớp của giảng viên khác. | Chỉ được xem (`GET`) thông tin các lớp mà mình đã được ghi danh (`classroom_enrollments`). Không được tạo/sửa/xóa. |
| **Sinh viên trong lớp** | Import CSV, xem danh sách sinh viên, reset mật khẩu sinh viên trong lớp mình sở hữu. Phản hồi import CSV trả danh sách `createdStudents` kèm `temporaryPassword` cho tài khoản mới (không lưu plain text, không ghi log); tài khoản đã có ghi rõ `status: "existing"` không kèm mật khẩu. | Hoàn toàn không có quyền truy cập các endpoint quản lý sinh viên (403). |
| **Bài tập (Assignments)** | CRUD bài tập trong lớp mình sở hữu; thiết lập mode (TEMPLATE/FREE), TL, ML, deadline. Tải lên (`PUT /api/assignments/:id/statement`), xóa (`DELETE /api/assignments/:id/statement`) file đề bài PDF. Chấm lại toàn bộ bài nộp (`POST /api/assignments/:id/regrade`). | Xem danh sách và nội dung bài tập của lớp mình ghi danh; xem template/mô tả giao diện, ví dụ công khai, xem đề bài PDF qua stream API (`GET /api/assignments/:id/statement`), trạng thái nộp và hạn nộp. |
| **Bộ kiểm thử (Test Cases)** | Thêm đơn, thêm hàng loạt (`POST /api/assignments/:id/tests/bulk`), sửa, xóa, xem danh sách toàn bộ test case (kể cả hidden test) của bài tập thuộc lớp mình. | **Tuyệt đối không được xem** test ẩn dưới bất kỳ hình thức nào (không có endpoint, không trả về trong đề hay submission). |
| **Nộp bài (Submissions)** | Xem danh sách bài nộp của cả lớp, lọc theo bài/thời gian/trạng thái/điểm; xem mã nguồn sinh viên, log biên dịch, excerpt test. Sửa điểm trực tiếp (`PATCH /api/submissions/:id/score`) và chấm lại từng bài (`POST /api/submissions/:id/regrade`). | Nộp bài cho bài tập lớp mình ghi danh (mode FREE nộp mã hoàn chỉnh có `main()`, mode TEMPLATE nộp regions); xem lịch sử bài nộp của chính mình; xem verdict, thời gian, bộ nhớ, điểm tổng. Không xem bài/điểm của bạn khác. |
| **Bảng điểm (Grades)** | Xuất bảng điểm CSV tổng hợp của lớp mình (tính điểm cao nhất trước deadline). | Không có quyền xuất hoặc xem bảng điểm lớp (403). |
| **Khởi động hệ thống (Warmup & Wakeup)** | Gọi `POST /api/system/warmup` để kiểm tra sức khỏe DB và Grader. Sau khi đăng nhập thành công (`POST /api/auth/login`), hệ thống tự động gọi ngầm `GET ${GRADER_URL}/health` (fire-and-forget, timeout 30s) để đánh thức Grader. | Không có quyền gọi warmup (403). |
| **Grader Callback** | Không thể gọi từ giao diện người dùng; chỉ Grader service mang header `X-Grader-Secret` hợp lệ mới được gọi. | Không có quyền (401/403). |

---

## 3. Giới hạn Kích thước Dữ liệu (Size & Count Limits)

Các giới hạn được thiết lập mặc định và cấu hình linh hoạt qua biến môi trường:

| Loại dữ liệu | Giới hạn tối đa | Mã lỗi khi vượt quá |
|---|---|---|
| Mã nguồn sinh viên nộp | ≤ 64 KB (65,536 bytes) | 413 `PAYLOAD_TOO_LARGE` |
| Mã khung Template / Harness | ≤ 64 KB (65,536 bytes) | 413 `PAYLOAD_TOO_LARGE` |
| Dữ liệu Input / Expected test | ≤ 1 MB (1,048,576 bytes) | 413 `PAYLOAD_TOO_LARGE` |
| File đề bài PDF | ≤ 10 MB (10,485,760 bytes) | 413 `PAYLOAD_TOO_LARGE` |
| Số lượng hidden test / bài | ≤ 50 test cases | 400 `TOO_MANY_TEST_CASES` |
| Số dòng file CSV import sinh viên | ≤ 500 dòng dữ liệu | 400 `CSV_TOO_MANY_ROWS` |

---

## 4. Tần suất Gọi API (Rate Limiting)

- **Đăng nhập (`POST /api/auth/login`):** Tối đa 10 lần / phút / địa chỉ IP. Vượt quá trả về HTTP 429 `RATE_LIMIT_EXCEEDED`.
- **Nộp bài (`POST /api/assignments/:id/submissions`):** Tối đa 6 lần / phút / người dùng (Student ID). Vượt quá trả về HTTP 429 `RATE_LIMIT_EXCEEDED`.

---

## 5. Quy tắc Điểm số và Hạn nộp (Deadline & Scoring)

- **Điểm bài nộp:** Tỷ lệ test ẩn đạt chuẩn (`passed_tests / total_tests`).
- **Xác định Nộp trễ (Late Submission):**
  - Nếu `submitted_at <= assignment.deadline`: Bài nộp đúng hạn (`is_late = false`).
  - Nếu `submitted_at > assignment.deadline`: Bài nộp quá hạn (`is_late = true`).
- **Điểm chính thức:** Điểm cao nhất (`MAX(score)`) trong tất cả các lần nộp `COMPLETED` đúng hạn (`is_late = false`).
- **Bài nộp trễ:** Vẫn được tiếp nhận và chấm bình thường để sinh viên luyện tập, nhưng không bao giờ thay thế điểm chính thức đã đạt trước đó.

---

## 6. Hàng đợi, Phục hồi và Idempotent Callback

- **Gửi Job tới Grader:** Sau khi lưu bài nộp ở trạng thái `PENDING`, API gửi HTTP POST tới `GRADER_URL/jobs` kèm `X-Grader-Secret`. Nếu mạng lỗi hoặc Grader đang khởi động, bài nộp vẫn giữ nguyên `PENDING`.
- **Cơ chế Phục hồi (`decideRecovery`):**
  - Mỗi request đến API kích hoạt kiểm tra không chặn (non-blocking) các bài nộp `PENDING` hoặc `RUNNING`.
  - Quá 2 phút: Gửi lại job (tối đa 2 lần).
  - Quá 2 lần retry: Đánh dấu `SYSTEM_ERROR`.
- **Tính Idempotent của Callback và Chỉ số 0-based:**
  - Grader gửi kết quả về `POST /api/internal/grader-callback`.
  - Secret được kiểm tra bằng so sánh thời gian hằng `crypto.timingSafeEqual`. Nếu biến môi trường `GRADER_SECRET` trống → HTTP 503.
  - **Chỉ số 0-based:** Mảng `tests[].index` từ Grader là chỉ số 0-based (`0, 1, ..., N - 1`), tương ứng trực tiếp với thứ tự mảng `hiddenTests` trong `JudgeJob`. API ánh xạ chính xác `tests[index]` vào test case tương ứng trong CSDL.
  - **Kiểm tra tính hợp lệ của index:** Nếu Grader gửi `index` ngoài phạm vi (`index < 0` hoặc `index >= N`) hoặc trùng lặp chỉ số `index`, API từ chối callback với HTTP 400 và cập nhật trạng thái bài nộp trong DB thành `SYSTEM_ERROR`.
  - Nếu bài nộp đã ở trạng thái `COMPLETED` hoặc `SYSTEM_ERROR` (do retry hoặc callback gửi lại), API ghi nhận thành công 200 mà không nhân đôi dữ liệu trong `submission_test_results`.

---

## 7. Chế độ Chấm FREE (Không Harness)

- **Nguyên lý:** Chế độ FREE biên dịch nguyên bản file mã nguồn của sinh viên (chương trình hoàn chỉnh có hàm `main()`), thực thi với `stdin` của từng test case và so sánh `stdout` với `expected_output` (chuẩn hóa cắt bỏ khoảng trắng cuối dòng và dòng trống cuối).
- **Tạo/Sửa bài tập FREE:** Không bắt buộc `entryPointSpec` (nếu truyền lên sẽ được bỏ qua và lưu `NULL`).
- **Nộp bài FREE:** Sinh viên chỉ cần truyền `studentSource`. Trường `entry` là tùy chọn và được bỏ qua nếu có.
- **Tính tương thích:** Các bài FREE cũ có sẵn harness vẫn được Grader chấm theo cơ chế mới (bỏ qua harness).

---

## 8. Sửa Điểm, Chấm Lại và Nhập Nhiều Test Case

- **Sửa điểm thủ công (`PATCH /api/submissions/:id/score`):**
  - Dành riêng cho Giảng viên sở hữu lớp của bài tập.
  - Body `{ score: number }` trong khoảng [0, 1] (thang điểm 2 chữ số thập phân).
  - Chỉ cập nhật `score` và `updated_at`.
- **Chấm lại 1 bài nộp (`POST /api/submissions/:id/regrade`):**
  - Xóa toàn bộ kết quả kiểm thử cũ trong `submission_test_results`.
  - Đặt lại `status='PENDING'`, `score=0`, `passed_tests=0`, `retry_count=0`, `compile_output=NULL`, `finished_at=NULL`.
  - Tự động tái kích hoạt gửi job sang Grader theo đúng luồng nộp bài.
- **Chấm lại toàn bộ bài tập (`POST /api/assignments/:id/regrade`):**
  - Reset và xóa kết quả cũ cho tất cả các bài nộp của bài tập.
  - Gửi tuần tự tới Grader để đảm bảo không dồn tải (Grader concurrency = 1). Trả về `{ queued: n }`.
  - Không tính vào giới hạn tần suất 6 bài/phút của sinh viên.
- **Nhập nhiều test case (`POST /api/assignments/:id/tests/bulk`):**
  - Body `{ tests: [{ inputData, expectedOutput, isHidden?, isSample? }], replace?: boolean }`.
  - `replace=true`: Xóa toàn bộ test cũ của bài tập trong cùng transaction rồi thêm mới (đánh số `order_index` từ 1).
  - `replace=false` (mặc định): Tự động đánh số `order_index` tiếp nối (`max_order + 1, +2, ...`).
  - Kiểm tra dung lượng từng test (`≤ 1 MB`) và tổng số test sau khi thêm `≤ 50`. Vượt quá sẽ trả lỗi 400 all-or-nothing mà không ghi đè dữ liệu.

---

## 9. Đề bài PDF và Cơ chế Lưu trữ (PDF Statement Storage)

- **Nguyên lý:** Giảng viên tải file PDF đề bài lên hệ thống khi tạo hoặc chỉnh sửa bài tập. File được lưu trữ trên Google Drive của tài khoản quản trị hệ thống (hoặc thư mục local ở môi trường phát triển/kiểm thử). Sinh viên xem đề bài PDF trực tiếp trên trang làm bài thông qua API stream bảo mật mà không lộ liên kết hay file ID công khai.
- **Tải lên đề bài (`PUT /api/assignments/:id/statement`):**
  - Giảng viên sở hữu lớp của bài tập.
  - Body thô với `Content-Type: application/pdf`, dung lượng tối đa 10 MB (`MAX_STATEMENT_PDF_BYTES`).
  - Tiêu đề file truyền qua header `X-File-Name` (URL-encoded, tối đa 255 ký tự).
  - Kiểm tra 5 byte đầu tiên bắt buộc phải là `%PDF-` (sai trả về 400 `BAD_REQUEST`).
  - Khi thay thế file mới: File cũ trên storage sẽ được tự động xóa sau khi file mới lưu thành công.
- **Xem / Tải đề bài (`GET /api/assignments/:id/statement`):**
  - Giảng viên sở hữu lớp hoặc sinh viên đã ghi danh vào lớp. Người ngoài trả về 403 / 404.
  - Trả về stream nhị phân `Content-Type: application/pdf`, `Content-Disposition: inline; filename*=UTF-8''...`, `Cache-Control: private, max-age=300`.
- **Xóa đề bài (`DELETE /api/assignments/:id/statement`):**
  - Giảng viên sở hữu lớp. Xóa file khỏi storage driver và đặt lại các trường metadata về `NULL`.
- **Thông tin đề bài trong chi tiết bài tập (`GET /api/assignments/:id`):**
  - Trả thêm trường `statement: { name: string, size: number } | null` (không lộ file ID hay storage type).


