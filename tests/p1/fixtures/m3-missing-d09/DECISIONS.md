# Các quyết định thiết kế hệ thống CppDSA (DECISIONS)

Tài liệu ghi nhận toàn bộ các quyết định kiến trúc, công nghệ và phương pháp luận thiết kế hệ thống CppDSA.

---

### D-01: Nền tảng hosting ứng dụng (Vercel và Render)
Lựa chọn: Sử dụng kết hợp Vercel cho Frontend (Next.js) và Render cho Backend API cùng Worker chấm bài (Docker Web Services).
Lý do: Tận dụng tối đa gói miễn phí (Vercel Hobby [CẦN XÁC MINH điều khoản Vercel Hobby cho mục đích giảng dạy] và Render Free tier [CẦN XÁC MINH Render có region Singapore cho free]); phân tách rõ ràng giữa giao diện và môi trường chạy mã nguồn sinh viên; Render hỗ trợ container Docker tùy biến cần thiết cho compiler g++.
Phương án loại: Thuê 1 máy ảo Azure Linux VM duy nhất tự host toàn bộ hệ thống; triển khai cả frontend lẫn backend trên Render.
Nguồn: PROJECT_PLAN mục 2 (người dùng 2026-10-31) và mục 3.1.

---

### D-02: Cơ sở dữ liệu chính (Azure Database for PostgreSQL Flexible Server B1MS)
Lựa chọn: Sử dụng Azure Database for PostgreSQL Flexible Server, gói Burstable B1MS với 32 GB dữ liệu và 32 GB sao lưu trong chương trình 12 tháng miễn phí [CẦN XÁC MINH ngày bắt đầu 12 tháng free của Azure].
Lý do: Cung cấp 750 giờ/tháng đủ để chạy liên tục 24/7 mà không bị tự động dừng (auto-pause); không bị giới hạn vCore-giây; PostgreSQL tương thích hoàn hảo với hệ sinh thái Node.js/TypeScript và dễ dàng phát triển local qua Docker; firewall mở cho IP Render [CẦN XÁC MINH Render cung cấp outbound IP cho free service].
Phương án loại: Azure SQL Database Free Tier (bị auto-pause sau 15 phút, giới hạn 100.000 vCore-giây); Render PostgreSQL Free.
Nguồn: PROJECT_PLAN mục 2, 3.2 (người dùng 2026-10-31).

---

### D-03: Cấu trúc kho mã nguồn (Monorepo)
Lựa chọn: Áp dụng mô hình Monorepo duy nhất trên GitHub sử dụng npm workspaces bao gồm `src/web`, `src/api`, `src/grader` và `src/shared`.
Lý do: Đồng bộ hóa các hợp đồng kiểu dữ liệu (data contracts) giữa frontend và backend; Vercel hỗ trợ chỉ định Root Directory (`src/web`); Render cho phép cấu hình nhiều Web Service từ cùng một repo với Dockerfile riêng.
Phương án loại: Tách thành 3-4 repo độc lập (gây khó khăn cho việc quản lý phiên bản và chia sẻ mã dùng chung).
Nguồn: PROJECT_PLAN mục 2, 3.0.

---

### D-04: Cơ chế hàng đợi và phân phối công việc chấm bài
Lựa chọn: API đẩy job qua HTTP tới Grader; Grader quản lý hàng đợi trong bộ nhớ (in-memory queue), chạy song song giới hạn (đề xuất 2, chỉnh theo số đo P2/P8) và gửi kết quả về API qua HTTP callback kèm secret token; phục hồi bằng cách API quét các submission PENDING/RUNNING quá 2 phút khi nhận request.
Lý do: Tránh việc polling liên tục làm quá tải database PostgreSQL B1MS có tài nguyên thấp [CẦN XÁC MINH giới hạn kết nối của B1MS]; Render không hỗ trợ background worker ở gói miễn phí nên grader được cấu hình như một web service.
Phương án loại: Sử dụng Redis/RabbitMQ chuyên dụng (tốn chi phí/hạ tầng phụ); worker polling trực tiếp vào database PostgreSQL.
Nguồn: PROJECT_PLAN mục 2, 3.3, 3.4.

---

### D-05: Cơ chế xác thực và quản lý phiên người dùng
Lựa chọn: Đăng nhập bằng email và mật khẩu (băm bằng Argon2id hoặc bcrypt); quản lý phiên qua cookie httpOnly; Next.js trên Vercel thực hiện rewrite `/api/*` về Render API để duy trì cùng origin; giảng viên import CSV tạo tài khoản sinh viên kèm mật khẩu tạm thời bắt buộc đổi ở lần đăng nhập đầu.
Lý do: Bảo mật cookie trước tấn công XSS; giải quyết vấn đề cookie bên thứ ba [CẦN XÁC MINH rewrite /api/* cùng origin giải quyết được cookie theo PROJECT_PLAN 3.5]; không cần hạ tầng gửi email SMTP phức tạp.
Phương án loại: Đăng ký công khai qua email với mã OTP; xác thực JWT lưu trong LocalStorage; tích hợp OAuth/SSO bên ngoài.
Nguồn: PROJECT_PLAN mục 2, 3.5.

---

### D-06: Quy cách đánh dấu vùng code cho chế độ có template
Lựa chọn: Sử dụng cặp chú thích đánh dấu `// STUDENT_BEGIN <tên_vùng>` và `// STUDENT_END` trong khung code template của giảng viên; trình soạn thảo chỉ cho phép sửa trong vùng; server chỉ nhận nội dung vùng và tự ghép với template gốc lưu trong database.
Lý do: Đảm bảo sinh viên không thể can thiệp vào các thành phần cố định của đề bài (hàm main, cấu trúc kiểm tra); bảo vệ tính toàn vẹn của mã nguồn kiểm thử; giảm thiểu kích thước payload truyền qua mạng.
Phương án loại: Cho phép sinh viên nộp toàn bộ file và dùng regex để kiểm tra sự thay đổi; cho phép sinh viên tự do cấu trúc lại file template.
Nguồn: PROJECT_PLAN mục 2, 4.1.

---

### D-07: Cơ chế chấm bài ở chế độ tự do (Free mode)
Lựa chọn: Áp dụng cơ chế "Khai báo điểm vào" (Entry Point Declaration); đề bài quy định giao diện chấm gồm kiểu dữ liệu tham số và kiểu trả về; sinh viên tự do đặt tên hàm/lớp; khi nộp sinh viên khai báo tên hàm/lớp của mình và hệ thống tự động sinh mã adapter C++ để kết nối và gọi hàm sinh viên.
Lý do: Đáp ứng yêu cầu sư phạm: sinh viên được rèn luyện tư duy thiết kế đặt tên hàm/lớp tự do nhưng vẫn đảm bảo tính tự động hóa và chặt chẽ của hệ thống chấm bài mà không ép buộc mô hình stdin/stdout.
Phương án loại: Bắt buộc sinh viên viết toàn bộ chương trình đọc stdin và in stdout; bắt buộc sinh viên tuân theo tên hàm cố định định sẵn.
Nguồn: PROJECT_PLAN mục 2 (người dùng 2026-10-31), mục 4.2.

---

### D-08: Mức độ hiển thị kết quả và verdict cho sinh viên
Lựa chọn: Sinh viên chỉ được xem điểm tổng, danh sách verdict của từng test ẩn (AC, WA, TLE, MLE, RE, CE), thời gian thực thi, dung lượng bộ nhớ và thông báo lỗi biên dịch rút gọn; tuyệt đối ẩn toàn bộ input, expected output và output thực tế của test ẩn.
Lý do: Chống gian lận (hardcode kết quả theo test); bảo vệ tính bí mật của ngân hàng đề thi môn học; cung cấp đủ thông tin chẩn đoán kỹ thuật để sinh viên sửa bài.
Phương án loại: Hiển thị chi tiết input và expected output của các test bị lỗi; chỉ hiển thị điểm tổng mà không có chi tiết từng test.
Nguồn: PROJECT_PLAN mục 2, 4.3.

---


---

### D-10: Quy tắc so sánh output giữa kết quả sinh viên và đáp án
Lựa chọn: So sánh từng dòng sau khi đã loại bỏ khoảng trắng thừa ở cuối mỗi dòng và các ký tự xuống dòng trống ở cuối file; không tự ý chuẩn hóa hoặc chuyển đổi ký tự khác; mọi hidden test phải có đáp án duy nhất, hoặc bài phải có checker riêng (ngoài MVP).
Lý do: Tránh việc chấm sai do sự khác biệt giữa ký tự kết thúc dòng `\r\n` (Windows) và `\n` (Linux) hoặc dấu cách vô tình ở cuối dòng; duy trì độ chính xác đối với nội dung logic của kết quả; quy tắc đơn nghiệm đảm bảo các thuật toán đúng khác nhau không bị chấm sai khi dùng bộ so sánh mặc định.
Phương án loại: So sánh byte-by-byte chính xác tuyệt đối không bỏ khoảng trắng; tự ý chuyển chữ hoa thành chữ thường hoặc bỏ qua toàn bộ khoảng trắng giữa các từ.
Nguồn: PROJECT_PLAN mục 2, 4.3 và phản hồi người dùng 2026-10-31.

---

### D-11: Giới hạn thời gian (Time Limit) và bộ nhớ (Memory Limit) mặc định
Lựa chọn: Thiết lập Time Limit mặc định là 1.0 giây và Memory Limit mặc định là 256 MB cho mỗi test case; giảng viên có thể điều chỉnh linh hoạt theo từng bài tập cụ thể.
Lý do: Phù hợp với đặc thù các bài toán cấu trúc dữ liệu và giải thuật cơ bản trong môi trường C++; bảo vệ tài nguyên tính toán của worker miễn phí trên Render.
Phương án loại: Cố định cứng giới hạn 2.0s và 512MB không cho phép thay đổi; không giới hạn thời gian/bộ nhớ (gây nguy cơ treo hệ thống).
Nguồn: PROJECT_PLAN mục 2, 4.3.

---

### D-12: Cách tính điểm bài nộp và số lần nộp bài
Lựa chọn: Điểm số của bài nộp bằng tỷ lệ số test ẩn đạt trên tổng số test ẩn (trọng số các test mặc định bằng nhau); không giới hạn số lần nộp bài của sinh viên; điểm bài tập được tính là điểm cao nhất trong các lần nộp hợp lệ trước deadline.
Lý do: Giảm áp lực tâm lý thi cử, khuyến khích sinh viên thử sai và tối ưu thuật toán; mô hình tính điểm minh bạch, khách quan và trực quan.
Phương án loại: Giới hạn số lần nộp (ví dụ tối đa 5 lần); tính điểm theo lần nộp cuối cùng; trừ điểm sau mỗi lần nộp sai.
Nguồn: PROJECT_PLAN mục 2, 4.3.

---

### D-13: Hệ thống tích hợp liên tục (CI)
Lựa chọn: Sử dụng GitHub Actions để tự động chạy kiểm tra lint (ESLint [ĐỀ XUẤT], Prettier [ĐỀ XUẤT]) và automated unit/integration tests trên cả monorepo mỗi khi có commit hoặc pull request.
Lý do: Tích hợp trực tiếp với kho mã nguồn GitHub; kiểm soát chất lượng mã nguồn tự động, ngăn ngừa hồi quy lỗi trước khi bàn giao các phase [CẦN XÁC MINH hạn mức GitHub Actions cho repo private].
Phương án loại: Sử dụng GitLab CI, Travis CI hoặc CircleCI; không thiết lập CI mà chỉ kiểm thử thủ công trên máy cục bộ.
Nguồn: PROJECT_PLAN mục 2, 8 (P3).

---

### D-14: Định dạng xuất bảng điểm của lớp học
Lựa chọn: Hỗ trợ xuất bảng điểm tổng hợp của lớp học ra định dạng tệp CSV (Comma-Separated Values).
Lý do: CSV là định dạng tiêu chuẩn nhẹ, dễ dàng nhập vào Excel, Google Sheets hoặc các hệ thống quản trị đào tạo của nhà trường mà không đòi hỏi thư viện xử lý bảng tính phức tạp.
Phương án loại: Xuất định dạng PDF hoặc binary Excel (.xlsx) trực tiếp trên server; chỉ xem trực tuyến trên trình duyệt web.
Nguồn: PROJECT_PLAN mục 2, 9 (P6).

---

### D-15: Ngưỡng thời gian xử lý bài nộp p95
Lựa chọn: Đặt ngưỡng đề xuất thời gian từ lúc sinh viên submit tới khi nhận kết quả p95 ≤ 10 giây trong điều kiện Grader service đã thức, phục vụ đồng thời tối đa 20 người dùng trong lớp học 50 sinh viên.
Lý do: Đảm bảo trải nghiệm phản hồi nhanh cho sinh viên trong buổi thực hành mà vẫn nằm trong giới hạn khả năng xử lý của tài nguyên Render miễn phí; sẽ được hiệu chỉnh chính xác dựa trên số đo thực tế tại P2 và P8.
Phương án loại: Đặt ngưỡng khắt khe p95 ≤ 2 giây (không thực tế với hạ tầng miễn phí có độ trễ mạng và biên dịch C++); không đặt bất kỳ ngưỡng đo lường nào.
Nguồn: PROJECT_PLAN mục 2, 9 (P1, P8).

---

### D-16: Ngôn ngữ lập trình và phiên bản biên dịch của bài nộp
Lựa chọn: Sử dụng C++17 biên dịch bằng trình biên dịch GCC (`g++ -std=c++17 -O2`).
Lý do: C++17 là tiêu chuẩn hiện đại, ổn định, hỗ trợ đầy đủ các tính năng cấu trúc dữ liệu và thư viện STL cần thiết cho môn học Cấu trúc dữ liệu và Giải thuật; GCC là trình biên dịch mã nguồn mở chuẩn mực trên Linux container.
Phương án loại: Dùng C++98/C++03 cũ kỹ hoặc C++20/C++23 chưa đồng bộ trên các môi trường; dùng Clang hoặc MSVC.
Nguồn: PROJECT_PLAN mục 2 (người dùng 2026-10-31).
