# Yêu cầu hệ thống CppDSA (REQUIREMENTS)

Tài liệu đặc tả yêu cầu cho hệ thống chấm bài thực hành C++ môn Cấu trúc dữ liệu và Giải thuật (CppDSA).

---

## 1. Giới thiệu và mục tiêu

Hệ thống CppDSA được xây dựng nhằm phục vụ công tác giảng dạy, thực hành và đánh giá kỹ năng lập trình C++ trong môn Cấu trúc dữ liệu và Giải thuật. Hệ thống cung cấp môi trường để:
- Giảng viên quản lý lớp học, tạo đề bài thực hành, cấu hình bộ kiểm thử ẩn và theo dõi tiến độ, kết quả học tập của sinh viên.
- Sinh viên xem đề bài, thực hiện viết code trực tiếp hoặc nộp bài giải theo hai chế độ (Template mode và Free mode), nhận kết quả chấm tự động bảo mật và tức thời.

### Quy mô và ngưỡng tải mục tiêu
- Quy mô lớp học: Khoảng 50 sinh viên trong một lớp hoặc một buổi thực hành.
- Số lượng người dùng hoạt động đồng thời (concurrent users): Tối đa 20 người dùng đồng thời.
- Ngưỡng thời gian xử lý bài nộp (p95): Thời gian từ lúc sinh viên submit tới khi nhận kết quả p95 ≤ 10 giây trong điều kiện Grader service đã thức (ngưỡng đề xuất từ PROJECT_PLAN mục 2, 4.3 và 9; sẽ được đo lường và hiệu chỉnh tại P2 và P8).

---

## 2. Các vai trò người dùng (User Roles)

1. **Giảng viên (Lecturer):**
   - Quản trị viên của lớp học.
   - Nhập danh sách sinh viên qua file CSV và cấp tài khoản/mật khẩu ban đầu.
   - Tạo, chỉnh sửa đề bài thực hành, thiết lập cấu hình chấm (TL, ML, deadline) và bộ test ẩn.
   - Kích hoạt khởi động hệ thống trước buổi học để làm nóng các service.
   - Xem toàn bộ bài nộp, chi tiết từng test ẩn của sinh viên và xuất bảng điểm lớp ra CSV.

2. **Sinh viên (Student):**
   - Người học tham gia lớp thực hành.
   - Đăng nhập bằng tài khoản được cấp và bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.
   - Xem danh sách bài tập, thời hạn nộp, giới hạn tài nguyên và các ví dụ công khai trong đề.
   - Nộp bài ở chế độ Template (chỉ sửa vùng cho phép) hoặc chế độ Free mode (khai báo điểm vào tương ứng với giao diện chấm).
   - Theo dõi trạng thái chấm bài thời gian thực và xem verdict từng test ẩn (không thấy dữ liệu input/expected).
   - Xem lịch sử nộp bài; nộp bài luyện tập sau deadline (đánh dấu nộp trễ).

---

## 3. Danh sách User Stories và Tiêu chí chấp nhận (Acceptance Criteria)

### 3.1. Dành cho Giảng viên (Lecturer)

#### US-01: Quản lý lớp học và tài khoản sinh viên qua CSV
Giảng viên có thể tải lên file danh sách sinh viên định dạng CSV để khởi tạo tài khoản hàng loạt cho lớp học.
- `AC-US-01-1`: Giảng viên tải lên file CSV chứa danh sách sinh viên (mã sinh viên, họ tên, email); hệ thống tự động tạo tài khoản với mật khẩu tạm thời và gán vào lớp học tương ứng.
- `AC-US-01-2`: Hệ thống kiểm tra và từ chối các dòng sai định dạng (thiếu trường, email không hợp lệ, trùng mã sinh viên) kèm thông báo lỗi cụ thể từng dòng mà không làm gián đoạn các dòng hợp lệ khác.

#### US-02: Tạo và cấu hình bài tập chế độ Template
Giảng viên tạo bài tập thực hành yêu cầu sinh viên hoàn thiện code theo khung mẫu cho sẵn.
- `AC-US-02-1`: Giảng viên nhập nội dung đề bài và khung code template có chứa ít nhất một cặp marker `// STUDENT_BEGIN <tên_vùng>` và `// STUDENT_END`.
- `AC-US-02-2`: Hệ thống kiểm tra tính hợp lệ của template: từ chối lưu nếu marker bị thiếu cặp đóng/mở hoặc lồng nhau không hợp lệ.
- `AC-US-02-3`: Giảng viên thiết lập thời hạn nộp (deadline), Time Limit (TL) mặc định 1.0 giây, Memory Limit (ML) mặc định 256 MB (cho phép tùy chỉnh theo bài).

#### US-03: Tạo và cấu hình bài tập chế độ Free mode
Giảng viên tạo bài tập cho phép sinh viên tự do đặt tên hàm hoặc lớp, chỉ ràng buộc về giao diện tham số và giá trị trả về.
- `AC-US-03-1`: Giảng viên mô tả giao diện chấm gồm kiểu dữ liệu tham số và kiểu dữ liệu trả về (ví dụ `int ? (const std::vector<int>&, int)`).
- `AC-US-03-2`: Hệ thống cung cấp khung kiểm tra giao diện và cho phép giảng viên nhập mã nguồn adapter mẫu để kiểm tra tính hợp lệ trước khi công bố bài tập.

#### US-04: Quản lý bộ test ẩn và ví dụ công khai
Giảng viên thiết lập các test case để đánh giá mức độ chính xác của bài giải sinh viên.
- `AC-US-04-1`: Giảng viên có thể nhập các test ví dụ công khai trực tiếp vào phần mô tả đề bài để sinh viên tự kiểm tra trước khi nộp.
- `AC-US-04-2`: Giảng viên tải lên bộ test ẩn gồm cặp input và expected output; hệ thống lưu trữ bộ test ẩn bảo mật tại database và không gửi dữ liệu này về frontend sinh viên.

#### US-05: Giám sát bài nộp và kết quả của sinh viên
Giảng viên theo dõi tình hình nộp bài và kết quả chấm của từng sinh viên trong lớp.
- `AC-US-05-1`: Giảng viên xem được danh sách toàn bộ bài nộp của lớp, hỗ trợ lọc theo bài tập, thời gian nộp, trạng thái chấm và khoảng điểm.
- `AC-US-05-2`: Giảng viên có thể mở chi tiết từng bài nộp để xem mã nguồn sinh viên đã nộp, bảng kết quả từng test ẩn (verdict, thời gian chạy, bộ nhớ sử dụng) và toàn bộ log biên dịch/thực thi.

#### US-06: Xuất bảng điểm lớp học ra định dạng CSV
Giảng viên kết xuất kết quả học tập của lớp học để phục vụ công tác quản lý đào tạo.
- `AC-US-06-1`: Giảng viên có thể xuất bảng điểm tổng hợp của cả lớp theo từng bài tập hoặc toàn bộ lớp học ra tệp tin CSV.
- `AC-US-06-2`: Tệp CSV phản ánh chính xác điểm cao nhất hợp lệ trước deadline của từng sinh viên, ghi rõ trạng thái nộp trễ nếu có bài nộp sau deadline.

#### US-07: Khởi động hệ thống trước buổi thực hành
Giảng viên có công cụ chủ động đánh thức các dịch vụ đám mây miễn phí trước khi buổi học bắt đầu.
- `AC-US-07-1`: Giảng viên có nút "Khởi động hệ thống" trên giao diện quản trị để gửi yêu cầu đánh thức API, Grader và cơ sở dữ liệu trước buổi thực hành vài phút.
- `AC-US-07-2`: Giao diện hiển thị trạng thái sẵn sàng (ready status) của các thành phần sau khi hệ thống hoàn tất khởi động.

#### US-08: Đặt lại mật khẩu cho sinh viên
Giảng viên hỗ trợ sinh viên khôi phục quyền truy cập tài khoản khi bị quên mật khẩu.
- `AC-US-08-1`: Giảng viên có thể kích hoạt thao tác đặt lại mật khẩu cho sinh viên trong danh sách lớp; hệ thống sinh mật khẩu tạm thời mới và kích hoạt cờ yêu cầu đổi mật khẩu ở lần đăng nhập tiếp theo.

---

### 3.2. Dành cho Sinh viên (Student)

#### US-09: Đăng nhập và bắt buộc đổi mật khẩu lần đầu
Sinh viên truy cập hệ thống bằng tài khoản do giảng viên cấp và cập nhật mật khẩu cá nhân.
- `AC-US-09-1`: Sinh viên đăng nhập thành công bằng email và mật khẩu tạm thời được cấp.
- `AC-US-09-2`: Hệ thống phát hiện cờ mật khẩu tạm thời và bắt buộc sinh viên phải đổi sang mật khẩu mới trước khi được phép truy cập bất kỳ chức năng nào khác.

#### US-10: Xem danh sách bài tập và thời hạn
Sinh viên nắm bắt các bài tập được giao trong lớp học và kế hoạch thời gian nộp bài.
- `AC-US-10-1`: Sinh viên xem được danh sách tất cả các bài tập của lớp kèm trạng thái (chưa nộp, đã nộp, điểm cao nhất đạt được) và đồng hồ đếm ngược tới deadline.

#### US-11: Xem nội dung đề bài và test ví dụ
Sinh viên đọc yêu cầu bài toán để tiến hành cài đặt thuật toán.
- `AC-US-11-1`: Sinh viên xem đầy đủ mô tả đề bài, giới hạn thời gian (TL), giới hạn bộ nhớ (ML) và các ví dụ minh họa (input/output mẫu kèm giải thích).
- `AC-US-11-2`: Giao diện thể hiện rõ bài tập đang ở chế độ Template (chỉ rõ vùng cần cài đặt) hay chế độ Free mode (chỉ rõ giao diện hàm/lớp yêu cầu).

#### US-12: Viết code và nộp bài chế độ Template
Sinh viên hoàn thành bài tập theo khung code có sẵn.
- `AC-US-12-1`: Trình soạn thảo chỉ cho phép sinh viên chỉnh sửa nội dung bên trong các cặp marker `// STUDENT_BEGIN` ... `// STUDENT_END`; toàn bộ code template cố định xung quanh bị khóa (read-only).
- `AC-US-12-2`: Khi nộp bài, client chỉ gửi nội dung vùng sinh viên; backend từ chối tiếp nhận nếu nội dung gửi lên thiếu vùng hoặc cố tình gửi kèm mã ngoài vùng cho phép.

#### US-13: Viết code và nộp bài chế độ Free mode
Sinh viên tự do cấu trúc mã nguồn giải thuật với tên hàm/lớp tự đặt.
- `AC-US-13-1`: Sinh viên nộp mã nguồn C++ tự viết và nhập tên hàm/lớp vào ô "Khai báo điểm vào" tương ứng với giao diện chấm do đề bài quy định.
- `AC-US-13-2`: Nếu tên hàm hoặc chữ ký kiểu dữ liệu không khớp với giao diện chấm, hệ thống trả về kết quả lỗi biên dịch (Compilation Error - CE) kèm trích đoạn thông báo lỗi rõ ràng.

#### US-14: Theo dõi tiến trình chấm bài thời gian thực
Sinh viên biết được trạng thái xử lý của bài nộp ngay sau khi gửi.
- `AC-US-14-1`: Sau khi bấm nộp bài, giao diện hiển thị trạng thái chuyển đổi từ `PENDING` sang `RUNNING` và kết thúc ở `COMPLETED` qua cơ chế tự động polling mà không yêu cầu sinh viên tải lại trang.
- `AC-US-14-2`: Nếu xảy ra sự cố worker hoặc lỗi hệ thống, giao diện hiển thị thông báo lỗi thân thiện và hướng dẫn sinh viên thử lại.

#### US-15: Xem kết quả chấm bài chi tiết
Sinh viên nhận phản hồi đánh giá chất lượng thuật toán để điều chỉnh bài làm.
- `AC-US-15-1`: Sinh viên xem được điểm tổng kết (tỷ lệ test ẩn đạt), danh sách verdict từng test ẩn theo số thứ tự (Test 1: AC, Test 2: WA...).
- `AC-US-15-2`: Sinh viên xem được thời gian chạy (ms) và bộ nhớ (KB) của từng test; trường hợp bị CE được xem thông báo lỗi biên dịch đã cắt gọn.
- `AC-US-15-3`: Sinh viên không thể xem dữ liệu input, expected output hay actual output của các test ẩn.

#### US-16: Xem lịch sử nộp bài và ghi nhận điểm cao nhất
Sinh viên theo dõi tiến trình cải thiện thuật toán qua các lần thử.
- `AC-US-16-1`: Sinh viên xem được danh sách lịch sử tất cả các lần nộp của mình cho bài tập kèm thời gian nộp, kết quả chi tiết và điểm số.
- `AC-US-16-2`: Điểm chính thức của bài tập được hệ thống tự động cập nhật là điểm cao nhất trong các lần nộp hợp lệ trước deadline; không giới hạn số lần nộp bài.

#### US-17: Nộp bài luyện tập sau thời hạn (Late Submission)
Sinh viên tiếp tục làm bài sau khi hết hạn để tự trau dồi kiến thức.
- `AC-US-17-1`: Sinh viên vẫn được phép nộp bài sau khi bài tập đã quá hạn deadline và nhận kết quả chấm đầy đủ từ bộ test ẩn.
- `AC-US-17-2`: Bài nộp sau deadline được gắn nhãn "Nộp trễ" (Late) và không làm thay đổi điểm số chính thức đã ghi nhận trước deadline.

---

## 4. Quy tắc chấm bài và phân loại kết quả

### 4.1. Quy tắc chấm bằng test ẩn (PROJECT_PLAN mục 4.3)
1. Bài làm của sinh viên chỉ được chấm điểm bằng bộ test ẩn do giảng viên quản lý trong cơ sở dữ liệu.
2. Các ví dụ công khai trong nội dung đề bài chỉ mang tính chất hướng dẫn sinh viên tự kiểm tra, không tham gia vào quá trình tính điểm khi submit.
3. Nội dung test ẩn (đầu vào, dữ liệu kỳ vọng) không được trả về phía trình duyệt của sinh viên.
4. Cơ chế chống gian lận: Dữ liệu kỳ vọng (expected output) không bao giờ xuất hiện trong filesystem hoặc không gian bộ nhớ của tiến trình thực thi mã sinh viên. Việc so sánh kết quả được thực hiện hoàn toàn bởi tiến trình quản lý chấm (Grader process) bên ngoài. Tiến trình chạy code sinh viên được khởi tạo với môi trường biến rỗng (`env -i`), không mang bất kỳ secret hoặc token nào.

### 4.2. Cách tính điểm và xếp hạng
- Điểm bài nộp = (Số test ẩn đạt / Tổng số test ẩn) * 10 (hoặc quy đổi theo thang điểm 10/100).
- Trọng số các test mặc định là bằng nhau.
- Số lần nộp bài không giới hạn.
- Điểm chính thức của sinh viên cho một bài tập là điểm cao nhất trong các lần nộp trước deadline.
- Nộp bài sau deadline: Vẫn được chấm và trả verdict từng test để luyện tập, nhưng đánh dấu là "Trễ" và không tính vào điểm chính thức.

### 4.3. Các trạng thái kết quả (Verdicts)
- **AC (Accepted):** Kết quả chạy chương trình khớp hoàn toàn với output kỳ vọng sau khi đã chuẩn hóa khoảng trắng.
- **WA (Wrong Answer):** Chương trình kết thúc bình thường nhưng kết quả in ra khác với output kỳ vọng.
- **TLE (Time Limit Exceeded):** Chương trình chạy vượt quá giới hạn thời gian quy định (mặc định 1.0 giây hoặc do giảng viên cấu hình).
- **MLE (Memory Limit Exceeded):** Chương trình sử dụng vượt quá dung lượng bộ nhớ quy định (mặc định 256 MB hoặc do giảng viên cấu hình).
- **RE (Runtime Error):** Chương trình gặp lỗi trong quá trình thực thi (segmentation fault, chia cho 0, ném exception không bắt, exit code khác 0).
- **CE (Compilation Error):** Trình biên dịch `g++` thất bại khi biên dịch mã nguồn (lỗi cú pháp, sai tên hàm/lớp, không khớp chữ ký kiểu dữ liệu).

### 4.4. Quy tắc so sánh Output
- Hệ thống so sánh output giữa kết quả sinh viên và đáp án bằng cách:
  - Chuẩn hóa ký tự xuống dòng (`\r\n` thành `\n`).
  - Loại bỏ các khoảng trắng thừa ở cuối mỗi dòng (`line.trimEnd()`).
  - Loại bỏ các dòng trống thừa ở cuối file.
- Không tự ý chuẩn hóa hoặc thay đổi bất kỳ nội dung nào khác (chữ hoa/chữ thường, khoảng trắng giữa các từ phải được giữ nguyên).
- **Quy tắc đơn nghiệm của hidden test:** Mọi test case ẩn trong hệ thống (cả hai chế độ Template mode và Free mode) bắt buộc phải có đáp án duy nhất (đơn nghiệm). Trường hợp bài toán có nhiều nghiệm hợp lệ tương đương nhau, hệ thống yêu cầu phải có bộ chấm tùy biến (custom checker / special judge), tính năng này nằm ngoài phạm vi MVP.

---

## 5. Bảng truy vết yêu cầu (Traceability Matrix)

Bảng truy vết ánh xạ từ User Story (US) sang các Phase thực hiện (P2–P10) và Tiêu chí nghiệm thu tương ứng trong PROJECT_PLAN mục 9.

| Mã User Story | Nội dung tóm tắt | Phase thực hiện | Tiêu chí nghiệm thu tương ứng (PROJECT_PLAN mục 9) |
|---|---|---|---|
| **US-01** | Quản lý lớp học và import CSV | P3, P5 | P3: Dựng skeleton, schema DB ban đầu.<br>P5.1: Mọi endpoint MVP có integration test.<br>P5.2: Phân quyền admin/giảng viên tạo tài khoản sinh viên. |
| **US-02** | Tạo bài tập chế độ Template | P4, P5, P6 | P4.1: Bộ chuẩn phủ cả hai mode bài tập.<br>P5.3: Backend kiểm tra giới hạn template và code.<br>P6.1: Giảng viên tạo được bài template mode, đặt TL/ML và deadline. |
| **US-03** | Tạo bài tập chế độ Free mode | P4, P5, P6 | P4.1: Lõi chấm hỗ trợ free mode theo hợp đồng adapter.<br>P5.3: Backend lưu trữ interface spec của free mode.<br>P6.1: Giảng viên tạo được bài free mode, cấu hình giao diện. |
| **US-04** | Quản lý test ẩn và ví dụ công khai | P4, P5, P6 | P4.2: Test công khai không bị đưa vào bộ chấm khi submit.<br>P4.3: Sinh viên không thể truy xuất nội dung test ẩn.<br>P5.2: Phân quyền bảo vệ test ẩn ở backend.<br>P6.1: Giảng viên thêm/sửa hidden tests. |
| **US-05** | Giám sát bài nộp và kết quả | P5, P6 | P5.1: Integration test cho endpoint lấy danh sách submission.<br>P5.2: Giảng viên xem được toàn bộ submission của lớp.<br>P6.1: Giao diện giảng viên hiển thị danh sách và chi tiết bài nộp. |
| **US-06** | Xuất bảng điểm lớp ra CSV | P5, P6 | P5.1: API xuất dữ liệu điểm tổng hợp của lớp.<br>P6: Xuất điểm ra định dạng CSV (PROJECT_PLAN mục 2, 48, 285). |
| **US-07** | Khởi động hệ thống trước buổi học | P3, P8, P9 | P3: Endpoint healthz trả về 200 OK.<br>P8.2: Đo thời gian khởi động/cold start của hệ thống.<br>P9.1: Smoke test trên URL thật, đánh thức các service. |
| **US-08** | Đặt lại mật khẩu sinh viên | P5, P6 | P5.1: API reset mật khẩu cho giảng viên.<br>P5.2: Quyền reset mật khẩu thuộc giảng viên.<br>P6.1: Giao diện giảng viên hỗ trợ thao tác đặt lại mật khẩu. |
| **US-09** | Đăng nhập và đổi mật khẩu lần đầu | P3, P5, P7 | P3: Khung xác thực cookie httpOnly.<br>P5.1: Endpoint đăng nhập, đổi mật khẩu bắt buộc.<br>P7.1: Màn hình đăng nhập sinh viên, form đổi mật khẩu. |
| **US-10** | Xem danh sách bài tập và deadline | P5, P7 | P5.1: API trả danh sách bài tập của lớp.<br>P7.1: Giao diện sinh viên hiển thị bài tập và hạn nộp. |
| **US-11** | Xem đề bài và ví dụ mẫu | P5, P7 | P5.1: API trả nội dung bài tập và test công khai.<br>P7.1: Giao diện hiển thị đề bài, TL/ML, ví dụ. |
| **US-12** | Nộp bài chế độ Template | P4, P7 | P4.1: Ghép và chấm bài template mode.<br>P4.7: Bộ test chống gian lận phá template.<br>P7.1: Trình soạn thảo khóa vùng cố định, nộp vùng code. |
| **US-13** | Nộp bài chế độ Free mode | P4, P7 | P4.1: Adapter kết nối và chấm free mode.<br>P4.7: Kiểm tra CE khi sai chữ ký/tên hàm.<br>P7.1: Giao diện sinh viên nhập code và khai báo điểm vào. |
| **US-14** | Polling trạng thái chấm thời gian thực | P4, P5, P7 | P4.4: Worker kẹt hoặc chết -> timeout và retry.<br>P5.1: Endpoint kiểm tra trạng thái submission.<br>P7.1: Giao diện tự động cập nhật trạng thái không cần reload. |
| **US-15** | Xem verdict và kết quả chi tiết | P4, P5, P7 | P4.3: Không lộ nội dung test ẩn trong kết quả.<br>P4.6: Thông báo lỗi biên dịch rút gọn, không lộ secret.<br>P7.1: Giao diện hiển thị điểm, verdict từng test. |
| **US-16** | Xem lịch sử và tính điểm cao nhất | P4, P5, P7 | P4.1: Xác định verdict và tỷ lệ test đạt.<br>P5.4: Cơ chế lấy điểm cao nhất trước deadline có test biên.<br>P7.1: Giao diện hiển thị lịch sử nộp bài. |
| **US-17** | Nộp bài luyện tập sau deadline | P5, P7 | P5.4: Áp dụng quy tắc deadline, đánh dấu trễ có test biên.<br>P7.1: Cho phép nộp sau hạn và hiển thị nhãn trễ. |

---

## 6. Yêu cầu phi chức năng và Ngưỡng kiểm thử tải

1. **Hiệu năng và tải đồng thời:**
   - Hỗ trợ tối đa 20 người dùng hoạt động đồng thời (concurrent users) nộp bài trong buổi thực hành lớp 50 sinh viên.
   - Ngưỡng thời gian xử lý p95 ≤ 10 giây từ khi submit đến khi có kết quả khi Grader đã thức (ngưỡng đề xuất từ PROJECT_PLAN mục 2, 4.3 và 9).
2. **Độ tin cậy và khôi phục sự cố:**
   - Nếu worker bị restart làm mất job, hệ thống API tự động quét các submission ở trạng thái `PENDING`/`RUNNING` quá 2 phút và gửi lại tối đa 2 lần trước khi gán `SYSTEM_ERROR` (PROJECT_PLAN mục 3.4).
   - Hàng đợi in-memory của Grader chạy song song giới hạn (đề xuất 2, chỉnh theo số đo P2/P8) để tránh nghẽn CPU trên gói Render miễn phí.
3. **Bảo mật và an toàn dữ liệu:**
   - Mật khẩu người dùng được băm an toàn bằng Argon2id hoặc Bcrypt.
   - Phiên đăng nhập được quản lý bằng cookie `httpOnly`, `SameSite=Lax`, `Secure`; frontend gọi API qua rewrite `/api/*` [CẦN XÁC MINH rewrite /api/* cùng origin giải quyết được cookie theo PROJECT_PLAN 3.5].
   - Kết nối cơ sở dữ liệu bắt buộc qua giao thức mã hóa TLS.
   - Mã nguồn sinh viên chạy trong môi trường bị giới hạn tài nguyên và bị cách ly, không có quyền truy cập mạng hay đọc dữ liệu hệ thống ngoài thư mục làm việc tạm thời.

---

## 7. Ánh xạ yêu cầu MVP (PROJECT_PLAN) → User story

Bảng ánh xạ các yêu cầu MVP từ PROJECT_PLAN sang các User Story tương ứng:

| Mã yêu cầu | User Story tương ứng |
|---|---|
| R-01 | US-02, US-03, US-12, US-13 |
| R-02 | US-01, US-05, US-09 |
| R-03 | US-01, US-07, US-14 |
| R-04 | US-02, US-03, US-10, US-11 |
| R-05 | US-03, US-13 |
| R-06 | US-04, US-11 |
| R-07 | US-15, US-16 |
| R-08 | US-15 |
| R-09 | US-02, US-11 |
| R-10 | US-16 |
| R-11 | US-14, US-15 |
| R-12 | US-03, US-13 |
| R-13 | US-14 |
| R-14 | US-01, US-08, US-09 |
| R-15 | US-06 |
| R-16 | US-07, US-14 |
| R-17 | US-02, US-12 |
| R-18 | US-12 |
| R-19 | US-03, US-13 |
| R-20 | US-04, US-15 |
| R-21 | US-04, US-15 |
| R-22 | US-15 |
| R-23 | US-17 |
| R-24 | US-14, US-15 |
