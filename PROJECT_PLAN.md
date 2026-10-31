# PROJECT_PLAN — CppDSA

Trạng thái: bản nháp v3 (2026-10-31). Claude bổ sung đề xuất theo ủy quyền của người dùng (Azure chi phí thấp nhất, monorepo, Render, hàng đợi, xác thực, template, chống gian lận); chờ người dùng duyệt.
Ký hiệu: `[CHƯA CHỐT]` = cần người dùng quyết định; `[CẦN XÁC MINH]` = phải kiểm tra bằng tài liệu hoặc thử nghiệm thực tế; `[ĐỀ XUẤT]` = phương án tôi đề nghị, chưa coi là quyết định cuối cùng.

## 1. Mục tiêu và phạm vi

Xây dựng ứng dụng web chấm bài thực hành C++ phục vụ môn Cấu trúc dữ liệu và Giải thuật. Giảng viên quản lý lớp và bài thực hành; sinh viên xem đề, viết/nộp lời giải; hệ thống biên dịch và chạy code trên backend để chấm bằng bộ test ẩn, sau đó lưu và hiển thị kết quả.

Quy mô mục tiêu:
- Tối đa khoảng 50 sinh viên trong một lớp/buổi thực hành.
- Tối đa 20 người dùng hoạt động đồng thời.
- Không mặc định cả 50 sinh viên đều submit đúng cùng một thời điểm; hệ thống phải tiếp nhận và xử lý hàng đợi, đo tải ở P8.

## 2. Các quyết định đã được người dùng xác nhận

- Workflow phát triển: Claude Code điều phối, lập task, review và nghiệm thu; Antigravity (`agy`, model `gemini-3.8-flash-high`) viết code, viết test và tự sửa trong phạm vi task.
- Nền tảng triển khai: Vercel và Render.
- Phân bổ chạy ứng dụng: frontend trên Vercel; backend API và worker chấm bài chạy trên Render. Biên dịch/chạy code sinh viên thuộc backend Render, không chạy trên Vercel.
- Stack theo phương án đã đồng ý: TypeScript; Next.js cho frontend; Node.js cho API và worker.
- Ngôn ngữ bài nộp: C++17, biên dịch bằng g++.
- Vai trò: giảng viên và sinh viên.
- Quy mô: khoảng 50 sinh viên/lớp hoặc buổi thực hành; tối đa 20 người dùng đồng thời.
- Có hai chế độ bài tập: có template và không có template.
- Không yêu cầu sinh viên phải đọc stdin/ghi stdout.
- Bài tập có thể hiển thị ví dụ/test công khai ngay trong nội dung đề để sinh viên tự kiểm tra. Khi submit, hệ thống chỉ chấm bằng test ẩn.
- Điểm bài = tỷ lệ test ẩn đạt.
- So sánh output bỏ khoảng trắng ở cuối mỗi dòng và cuối file; không tự ý chuẩn hóa nội dung khác.
- Time limit mặc định: 1 giây; memory limit mặc định: 256 MB; giảng viên có thể điều chỉnh theo từng bài.
- Không giới hạn số lần nộp; lấy điểm cao nhất trước deadline.
- Cơ chế chạy code dự kiến: biên dịch g++ và chạy trong Docker worker trên Render, dùng user không có quyền cao và giới hạn tài nguyên ở mức tiến trình. Phương án này phải qua kiểm chứng P2; không được coi Docker/user không quyền là bảo đảm sandbox an toàn tuyệt đối.

### Quyết định Claude đề xuất theo ủy quyền của người dùng (2026-10-31)

Người dùng giao Claude tự đề xuất các phần chưa chốt và yêu cầu Azure tốn ít credit nhất. Các mục sau là mặc định; người dùng có thể bác bỏ khi duyệt roadmap.
- Một repo GitHub duy nhất (monorepo) cho cả Vercel và Render — mục 3.0.
- Azure SQL Database free tier, AutoPause, thiết kế để database tự pause — mục 3.2.
- Render: 2 free web service (API, grader) — mục 3.3.
- Hàng đợi không polling database — mục 3.4.
- Đăng nhập email + mật khẩu, import CSV — mục 3.5.
- Template đánh dấu vùng bằng chú thích; free mode dùng "khai báo điểm vào" (vẫn cần người dùng duyệt ví dụ E2E) — mục 4.
- Sinh viên thấy verdict từng test ẩn, không thấy dữ liệu; nộp sau deadline không tính điểm — mục 4.3.
- CI: GitHub Actions (lint + test). Xuất điểm: CSV. Ngưỡng p95 từ submit tới kết quả (grader đã thức): ≤ 10 giây — đề xuất, chỉnh lại sau số đo P2.

## 3. Kiến trúc và cấu hình chi phí thấp

### 3.0. Repository

- Một repo GitHub private, npm workspaces:
  - `src/web` — Next.js → Vercel (Root Directory = `src/web`)
  - `src/api` — Node.js API → Render web service (Docker)
  - `src/grader` — Node.js + g++ → Render web service (Docker)
  - `src/shared` — kiểu dữ liệu/hợp đồng dùng chung
- Không cần tách 2 repo: Vercel cho chọn Root Directory của project; Render cho tạo nhiều service từ cùng repo, mỗi service chỉ định thư mục/Dockerfile riêng. `[CẦN XÁC MINH khi cấu hình ở P9; dự phòng: tách repo nếu gặp giới hạn]`
- Git đã khởi tạo local (branch `main`, có `.gitignore`, `.gitattributes`). Repo GitHub do người dùng tạo vì Claude không có quyền vào tài khoản GitHub.

### 3.1. Phân bổ dịch vụ

| Thành phần | Nơi chạy | Trách nhiệm |
|---|---|---|
| Frontend | Vercel (gói Hobby, miễn phí) | Giao diện giảng viên và sinh viên; gọi API qua rewrite `/api/*` |
| Backend API | Render free web service (Docker) | Xác thực, phân quyền, quản lý lớp/bài/test/submission; thành phần duy nhất kết nối database |
| Grader | Render free web service (Docker) | Nhận job từ API (xác thực bằng secret), biên dịch g++, chạy và chấm; không có credential database |
| Database | Azure SQL Database free tier (serverless, AutoPause) | Tài khoản, lớp, bài, template, test ẩn, submission, kết quả |

Frontend không kết nối trực tiếp tới database.

### 3.2. Azure — cấu hình tốn ít credit nhất

Mục tiêu: không phát sinh phí; 100 USD credit chỉ dùng khi người dùng tự đồng ý.
- 1 logical server + 1 database free tier (General Purpose serverless, áp dụng free offer).
- Khi hết hạn mức: **AutoPause** (database ngừng tới đầu tháng sau, không tính phí). Không chọn BillOverUsage vì Microsoft ghi không chuyển lại AutoPause được.
- vCore tối đa: mức thấp nhất portal cho phép với free tier; vCore tối thiểu 0,5 (mặc định). `[CẦN XÁC MINH các mức cho phép khi tạo]`
- Auto-pause sau 15 phút không hoạt động (cố định với free tier).
- Không bật dịch vụ phụ có thể tính phí: geo-replication, long-term backup retention, Microsoft Defender for SQL, private endpoint. Dùng public endpoint + firewall + TLS. `[CẦN XÁC MINH mục nào tính phí khi tạo]`
- Region: chọn gần region Render (đề xuất Southeast Asia nếu Render dùng Singapore). Region của free database đầu tiên không đổi được. `[CẦN XÁC MINH Render có region Singapore cho free]`
- Cảnh báo: metric alert "Free amount remaining" ≤ 10.000 vCore-giây; budget alert cho subscription ở mức 1 USD.
- Firewall: chỉ mở cho outbound IP của Render. `[CẦN XÁC MINH Render cung cấp outbound IP cho free service]`
- Tài khoản database: user riêng cho app chỉ có quyền đọc/ghi dữ liệu; tài khoản admin chỉ dùng cho migration.

Ngân sách vCore-giây (ước tính từ tài liệu, chưa đo):
- Khi online, mức dùng dưới min được tính theo min → ≥ 0,5 vCore mỗi giây. 100.000 vCore-giây ≈ 55 giờ online/tháng nếu chạy ở mức min.
- Mỗi lần database thức dậy tốn tối thiểu 15 phút online (≈ 450 vCore-giây ở 0,5 vCore).
- Ví dụ 4 buổi × 3 giờ/tháng ≈ 13 giờ online (kể cả 15 phút chờ pause) → khoảng 23.400–46.800 vCore-giây nếu dùng trung bình 0,5–1 vCore. Phần còn lại cho sinh viên làm bài ngoài giờ.
- Rủi ro: sinh viên dùng rải rác cả ngày làm database thức liên tục → có thể hết hạn mức giữa tháng. Đo thực tế ở P8; nếu không đủ, người dùng chọn: giới hạn khung giờ mở hệ thống, chấp nhận trả phí phần vượt (trừ credit), hoặc đổi database.

Thiết kế bắt buộc để database pause được (Microsoft: kết nối đang mở ngăn auto-pause):
- API dùng pool kết nối min = 0, đóng kết nối rảnh sau ≤ 60 giây.
- Healthcheck `/healthz` của API không chạm database.
- Không có job định kỳ/polling chạm database.
- Có retry khi database đang resume; giao diện hiển thị "hệ thống đang khởi động" thay vì lỗi.
- Không để công cụ quản trị (SSMS, Azure Data Studio) giữ kết nối khi không dùng.

### 3.3. Render

- 2 free web service: `cppdsa-api`, `cppdsa-grader` (Docker). Theo tài liệu Render, background worker và private service không có gói free → grader là web service, chỉ nhận request có secret từ API.
- Free web service ngủ sau 15 phút không có traffic, thức lại mất khoảng 1 phút; 750 giờ free/workspace/tháng, service đang ngủ không tính giờ.
- Trước buổi thực hành, giảng viên bấm "Khởi động hệ thống" (API gọi grader và database) vài phút trước giờ.
- CPU/RAM của free instance chưa xác minh → P2 đo độ ổn định thời gian chạy. Nếu không đạt, đề xuất nâng riêng grader lên gói trả phí nhỏ nhất (người dùng duyệt chi phí).

### 3.4. Luồng chấm và hàng đợi (không polling database)

1. Sinh viên nộp → API ghi submission `PENDING`.
2. API gửi job (code đã ghép, hidden tests, TL/ML) qua HTTP tới grader; grader có hàng đợi trong bộ nhớ, chạy song song giới hạn (đề xuất 2, chỉnh theo số đo P2/P8).
3. Grader gửi kết quả về API (callback có secret) → API ghi kết quả.
4. Frontend hỏi trạng thái mỗi 2–3 giây, chỉ khi có submission đang chờ.
5. Phục hồi khi grader restart làm mất job: mỗi khi API nhận request, kiểm tra submission `PENDING`/`RUNNING` quá 2 phút và gửi lại (tối đa 2 lần, sau đó `SYSTEM_ERROR`). Không dùng timer nền.

### 3.5. Xác thực và quản lý người dùng

- Hai vai trò: giảng viên và sinh viên. Tài khoản giảng viên đầu tiên tạo bằng script seed; không có đăng ký công khai.
- Đăng nhập email + mật khẩu (hash argon2id hoặc bcrypt); giảng viên import CSV tạo tài khoản sinh viên với mật khẩu tạm, bắt đổi ở lần đăng nhập đầu.
- Không gửi email; quên mật khẩu → giảng viên reset.
- Phiên bằng cookie httpOnly. Frontend gọi API qua rewrite `/api/*` của Next.js trên Vercel để cùng origin, tránh cookie bên thứ ba. `[CẦN XÁC MINH ở P3/P9: rewrite tới domain ngoài và độ trễ thêm]`
- Rate limit đăng nhập và submit.
- Quyền truy cập test ẩn, bài tập, submission và điểm kiểm tra ở backend; không dựa vào việc ẩn giao diện.

## 4. Đặc tả hai chế độ bài tập

### 4.1. Chế độ có template

- Giảng viên cung cấp khung code/template, ví dụ có hàm `void tinhToan(){}` và `main()` gọi hàm đó.
- Sinh viên không được chỉnh sửa bất kỳ dòng code cố định nào trong template; chỉ được nhập/paste lời giải vào vùng hàm hoặc vùng code được giảng viên chỉ định.
- Hệ thống phải giữ nguyên phần template cố định khi biên dịch và chấm.
- `[ĐỀ XUẤT]` Giảng viên đánh dấu vùng sinh viên được sửa bằng cặp chú thích `// STUDENT_BEGIN <tên>` / `// STUDENT_END`; một bài có thể có nhiều vùng (nhiều hàm/lớp). Trình soạn thảo chỉ cho sửa trong vùng.
- Server chỉ nhận nội dung từng vùng và tự ghép với template gốc lưu trong database; không nhận file đầy đủ từ trình duyệt. Thiếu/thừa vùng → từ chối submission.
- Code trong vùng vẫn có thể dùng macro hoặc đóng ngoặc sớm để phá template; việc này chỉ làm hỏng bài của chính sinh viên vì kết quả được so sánh bên ngoài tiến trình chạy code (mục 4.3). P4 có test cho trường hợp này.

### 4.2. Chế độ không template (Free mode)

- Sinh viên tự viết lời giải, tự định nghĩa tên hàm/lớp và cách tổ chức code; hệ thống không áp đặt template hoặc tên hàm/lớp cố định.
- Không bắt buộc mô hình stdin/stdout theo yêu cầu hiện tại.
- `[ĐÃ CHỐT]` Sinh viên được tự đặt tên; không bắt buộc dùng tên hàm/lớp do đề bài hoặc hệ thống quy định.
- `[ĐỀ XUẤT — người dùng phải duyệt ví dụ E2E ở P1 trước P4]` Cơ chế "khai báo điểm vào": đề bài nêu giao diện chấm gồm kiểu tham số và kiểu trả về (ví dụ `int ? (vector<int>&)`), không nêu tên. Khi nộp, sinh viên chọn/nhập tên hàm (hoặc lớp + phương thức) của mình ứng với giao diện đó. Hệ thống sinh adapter gọi đúng tên đã khai báo và biên dịch cùng code sinh viên; sai tên hoặc chữ ký → CE kèm thông báo rõ.
- Hệ quả cần người dùng chấp nhận: tên tự do nhưng kiểu tham số/trả về vẫn do đề quy định — không có cách tự động gọi một hàm chưa biết cả tên lẫn chữ ký mà không dùng stdin/stdout. Nếu không chấp nhận, P1 trình bày phương án khác; không tự đổi yêu cầu.
- Chưa triển khai grading cho Free mode ở P4 cho đến khi hợp đồng tương tác giữa hidden tests và code sinh viên được ghi rõ trong `docs/REQUIREMENTS.md` và `docs/ARCHITECTURE.md`, có ví dụ end-to-end được người dùng duyệt.

### 4.3. Test và kết quả chấm

- Ví dụ/test công khai được đặt trong nội dung đề để sinh viên tự kiểm tra; không cần quản lý thành nhóm test công khai chạy lúc submit.
- Khi nộp bài, worker chỉ chạy bộ test ẩn do giảng viên quản lý.
- Nội dung test ẩn (đầu vào, dữ liệu kỳ vọng và lời giải tham chiếu nếu có) không được trả về frontend/sinh viên.
- `[ĐỀ XUẤT]` Sinh viên thấy: điểm tổng; verdict từng test ẩn theo số thứ tự (Test 1: AC, Test 2: TLE…); thời gian/bộ nhớ; thông báo CE đã cắt gọn. Không thấy input, expected output hoặc output của test ẩn.
- `[ĐỀ XUẤT]` Sau deadline vẫn cho nộp để luyện tập, đánh dấu "trễ", không tính vào điểm.
- Chống gian lận: expected output không bao giờ có trong filesystem hoặc bộ nhớ của tiến trình chạy code sinh viên; việc so sánh thực hiện ở tiến trình grader bên ngoài; tiến trình code sinh viên chạy với môi trường rỗng, không có secret.
- Điểm = số test ẩn đạt / tổng số test ẩn. Số lượng và trọng số test mặc định bằng nhau; nếu muốn trọng số khác nhau phải được chốt riêng ở P1.
- Mỗi bài có TL mặc định 1 giây, ML mặc định 256 MB; giảng viên được thay đổi theo bài.
- Số lần submit không giới hạn; điểm được tính là điểm cao nhất trong các lần nộp trước deadline.

## 5. Ngoài phạm vi MVP

- Ngôn ngữ lập trình khác C++.
- Kiểm tra đạo văn.
- Chấm tay/tự luận.
- Tích hợp LMS (Moodle, Google Classroom...).
- Thi có giám sát (proctoring).
- Thao tác trên thư mục `data/`.
- Các chức năng AI sinh/gợi ý lời giải hoặc đánh giá code bằng LLM. Gemini 3.8 Flash High trong phạm vi này là model Antigravity dùng để phát triển code, không mặc định là tính năng runtime của sản phẩm.

## 6. Ràng buộc và rủi ro kỹ thuật

- Không chạy compiler hoặc code sinh viên trên Vercel; toàn bộ xử lý chấm đặt ở backend/worker Render.
- Render phải hỗ trợ cách chạy Docker worker và các giới hạn tài nguyên cần thiết. Khả năng áp dụng sandbox mạnh trong container không privileged phải kiểm chứng tại P2.
- Code sinh viên là code không tin cậy. Các biện pháp user không quyền, giới hạn CPU/RAM/thời gian, giới hạn output, filesystem tạm và chặn mạng chỉ là các lớp giảm thiểu; phải thử tấn công và ghi rõ rủi ro còn lại.
- Nếu P2 không chứng minh được mức cách ly chấp nhận được hoặc Render không đáp ứng, dừng trước khi xây lõi chấm; báo cáo kết quả và đề xuất lựa chọn thay thế để người dùng quyết định. Không tự chuyển sang dịch vụ Judge0/hosting khác khi chưa được duyệt.
- Azure SQL Database Free Tier có hạn mức tháng và không có SLA; cần theo dõi mức dùng, chính sách khi chạm hạn mức và rủi ro database bị tự pause.
- Render free/staging có thể có giới hạn tài nguyên hoặc cold start; gói triển khai thực tế cần được chọn và xác minh trước khi đo tải/deploy.
- Kết nối từ Render tới Azure SQL cần cấu hình firewall và bảo vệ connection secret; không đặt credential trong frontend hoặc repository.

- Hết hạn mức Azure free → database pause tới đầu tháng sau (đã chọn AutoPause). Giảm thiểu: thiết kế ở 3.2, cảnh báo khi còn 10%, đo ở P8.
- Render free: ngủ sau 15 phút, thức lại khoảng 1 phút, CPU chưa rõ → TL có thể đo không ổn định; P2 đo.
- Vercel Hobby dành cho mục đích phi thương mại. `[CẦN XÁC MINH điều khoản với mục đích giảng dạy]`
- Gian lận qua code nộp (đọc đáp án, in kết quả giả, phá template) — biện pháp ở 4.1 và 4.3, kiểm thử ở P2/P4.

## 7. Quy tắc chung mọi phase

- Cổng sang phase kế: nghiệm thu PASS (Claude tự chạy lại lệnh kiểm thử, không chỉ đọc báo cáo) và người dùng duyệt; cập nhật `PROGRESS.md`.
- Mỗi task tối đa 3 vòng sửa; quá 3 vòng thì dừng và báo người dùng.
- Chỉ bắt đầu code sản phẩm khi `PROGRESS.md` có `PHASE: DEV`.
- Claude không viết/sửa code trong `src/` và `tests/`; Antigravity thực hiện code theo đúng phạm vi task. Claude review `git diff`, chạy test độc lập và ghi báo cáo.

- Git: mỗi task Antigravity làm trên branch `task/T-XXXX`; Claude review `git diff main...task/T-XXXX` và chạy test; merge vào `main` sau khi PASS. Không commit secret (`.env*` đã ignore, chỉ commit `.env.example`).

## 8. Roadmap

| Phase | Mục tiêu | Sản phẩm bàn giao chính | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| P0 | Setup quy trình và repo | git + GitHub repo, AGENTS.md hoàn chỉnh, báo cáo T-0000 | - | ĐANG LÀM |
| P1 | Chốt yêu cầu và kiến trúc (không code) | REQUIREMENTS, ARCHITECTURE, DECISIONS | P0 | CHƯA BẮT ĐẦU |
| P2 | Spike: biên dịch và chạy cách ly trên Render | Dockerfile spike, báo cáo số đo và rủi ro | P0 (song song P1) | CHƯA BẮT ĐẦU |
| P3 | Khung dự án, môi trường local, CI | skeleton, docker-compose, DEV_SETUP | P1, P2 | CHƯA BẮT ĐẦU |
| P4 | Lõi chấm bài + hàng đợi + hai mode | worker chấm template/free-mode, bộ test chuẩn | P2, P3 | CHƯA BẮT ĐẦU |
| P5 | Backend API và Azure SQL Database | API, migration, test phân quyền | P3, P4 | CHƯA BẮT ĐẦU |
| P6 | Giao diện giảng viên | quản lý lớp, bài, template, test ẩn, điểm | P5 | CHƯA BẮT ĐẦU |
| P7 | Giao diện sinh viên | xem đề, nhập/nộp code hai mode, xem kết quả | P5 | CHƯA BẮT ĐẦU |
| P8 | Gia cố: bảo mật, hiệu năng, vận hành | báo cáo bảo mật + tải + database quota | P4–P7 | CHƯA BẮT ĐẦU |
| P9 | Deploy Vercel + Render + Azure | cấu hình deploy, DEPLOY.md | P8 | CHƯA BẮT ĐẦU |
| P10 | Pilot và bàn giao | hướng dẫn sử dụng, FINAL_REPORT | P9 | CHƯA BẮT ĐẦU |

P6 và P7 có thể chạy song song.

## 9. Chi tiết phase

### P0 — Setup quy trình

- Mục tiêu/phạm vi: hoàn tất cấu hình điều phối; không code sản phẩm.
- Bàn giao: git local (đã init, `.gitignore`, `.gitattributes`); repo GitHub private + commit đầu + push (người dùng làm); AGENTS.md điền mục tiêu và thư mục không đụng; `handoff/reports/T-0000.md`; ghi kết quả setup vào `PROGRESS.md`.
- Nghiệm thu: (1) `run-task.ps1 -Task T-0000` in `exit=0` và `report_exists=true`; (2) báo cáo xác nhận model `gemini-3.8-flash-high` và việc nạp AGENTS.md/GEMINI.md; (3) AGENTS.md không còn `<điền>`; (4) `git remote -v` trỏ tới GitHub, `git status` sạch sau commit đầu; (5) `git check-ignore .env data/` liệt kê cả hai; (6) máy người dùng có Docker Desktop chạy được (`docker version`).
- Kiểm thử: chạy T-0000, đối chiếu báo cáo với `docs/ORCHESTRATION.md`.
- Phụ thuộc: không.

### P1 — Chốt yêu cầu và kiến trúc (không code)

- Mục tiêu/phạm vi: chuyển mọi mục `[CHƯA CHỐT]` của MVP thành quyết định có văn bản; chưa viết code.
- Bàn giao:
  - `docs/REQUIREMENTS.md`: vai trò, user story MVP, hai mode bài tập, quy tắc test/chấm, deadline/submission.
  - `docs/ARCHITECTURE.md`: Vercel, Render API/worker, Azure SQL, luồng nộp → queue → compile/run → kết quả.
  - `docs/DECISIONS.md`: lựa chọn, lý do, phương án loại và các rủi ro chưa xử lý.
  - Mô hình dữ liệu nháp và hợp đồng chấm cho từng mode.
- Nghiệm thu: 0 mục `[CHƯA CHỐT]` thuộc MVP; mọi user story có tiêu chí chấp nhận kiểm thử được; lựa chọn DB/chi phí/networking được ghi nhận; hợp đồng test cho template và free mode được duyệt; các ngưỡng kiểm thử tải được chốt; người dùng duyệt.
- Kiểm thử: rà chéo — mỗi yêu cầu MVP ánh xạ tới ít nhất một tiêu chí nghiệm thu tại P2–P10.
- Các điểm còn phải xác minh trong P1 (phần lớn đã có đề xuất ở mục 2–4): người dùng duyệt ví dụ E2E free mode; người dùng kiểm tra subscription có free offer cho Azure SQL (không phải Students Starter); mức vCore cho phép; Render region và outbound IP; điều khoản Vercel Hobby; hạn mức GitHub Actions cho repo private.
- Phụ thuộc: P0; câu trả lời và phê duyệt của người dùng.

### P2 — Spike: biên dịch và chạy cách ly

- Mục tiêu/phạm vi: chứng minh g++ worker trong Docker chạy được trên Render theo cách không privileged và các giới hạn đã chọn; đánh giá khả năng cách ly code không tin cậy trước khi xây hệ thống. Spike chỉ dùng để đánh giá, không đưa thẳng vào sản phẩm.
- Bàn giao: thư mục spike, Dockerfile, bộ chương trình mẫu, `reports/P2_spike.md` có kết quả đo và rủi ro.
- Nghiệm thu:
  1. Bộ mẫu ≥ 12 chương trình: AC/WA/CE/RE phân loại đúng 100%.
  2. Vòng lặp vô hạn bị dừng trong ≤ TL + 0,5 giây và phân loại TLE.
  3. Cấp phát vượt ML bị dừng và phân loại MLE; không làm chết worker/container.
  4. Fork bomb, ghi file ngoài thư mục tạm, truy cập mạng và output khổng lồ bị chặn; nếu còn rủi ro phải mô tả chính xác và đánh giá mức độ.
  5. Chạy trong container không privileged; thử trên Render thật nếu người dùng cho phép.
  6. Xác nhận Docker/Render có thể áp dụng các giới hạn tài nguyên cần thiết ở mức chấp nhận được.
  7. Trên Render free web service: đo thời gian chạy cùng một chương trình 10 lần (đề xuất độ lệch ≤ 20%) và thời gian cold start; kết quả quyết định grader có cần gói trả phí.
  8. Chương trình sinh viên không đọc được expected output và không giả được kết quả chấm, thử ở cả hai mode.
- Kiểm thử: script chạy bộ mẫu, xuất verdict mong đợi/thực tế, thời gian, bộ nhớ và kết quả từng kịch bản tấn công.
- Phụ thuộc: P0 và roadmap được duyệt (cơ chế đã đề xuất ở 3.3–3.4); chạy song song P1. Spike không đạt yêu cầu bảo mật/chạy trên Render → dừng, quay lại P1 để người dùng chọn phương án khác.

### P3 — Khung dự án, môi trường local, CI

- Mục tiêu/phạm vi: dựng skeleton theo stack TypeScript/Next.js/Node.js và Azure SQL đã chốt; chưa có nghiệp vụ.
- Bàn giao: monorepo `src/web`, `src/api`, `src/grader`, `src/shared` (npm workspaces); docker-compose local gồm API, grader và container SQL Server thay cho Azure SQL (cùng T-SQL; khác biệt ghi trong DEV_SETUP); migration khởi tạo; lint/format; test runner; CI GitHub Actions (lint + test); `docs/DEV_SETUP.md`.
- Nghiệm thu: một lệnh khởi động toàn bộ local; endpoint health trả 200; build + lint + test (ít nhất một test mẫu mỗi phần) pass từ bản clone sạch.
- Kiểm thử: làm lại từ đầu theo DEV_SETUP.md; Claude chạy lại build/lint/test.
- Phụ thuộc: P1, P2.

### P4 — Lõi chấm bài + hàng đợi

- Mục tiêu/phạm vi: nhận submission, đưa vào hàng đợi, biên dịch C++17 bằng g++, chạy test ẩn, so sánh kết quả, tính điểm và lưu kết quả; hỗ trợ cả template mode và free mode theo hợp đồng đã duyệt ở P1.
- Bàn giao: module worker; cấu hình chấm theo bài (mode, compiler standard, TL, ML, so sánh); bộ test chuẩn `tests/grading/`.
- Nghiệm thu:
  1. Bộ chuẩn ≥ 30 ca phủ AC/WA/TLE/MLE/RE/CE, hai mode và các trường hợp ranh giới; verdict/điểm đúng 100% theo expected result.
  2. Test công khai trong đề không bị đưa vào bộ chấm khi submit; chỉ hidden tests được dùng để tính điểm.
  3. Sinh viên không thể truy xuất nội dung test ẩn từ response, API hoặc log frontend.
  4. Worker chết giữa chừng: submission không kẹt vĩnh viễn (timeout → retry có kiểm soát hoặc trạng thái lỗi).
  5. 20 submission đồng thời được xử lý đúng; không lẫn code, test, điểm hoặc kết quả giữa các submission.
  6. Thông báo lỗi biên dịch trả cho sinh viên bị giới hạn độ dài và không lộ đường dẫn hệ thống/secret.
  7. Bộ test gian lận (đọc file đáp án, in kết quả giả, `exit(0)` sớm, macro phá template, gửi file đầy đủ thay vì vùng code) → không được AC.
  8. Grader không giữ credential database; tiến trình code sinh viên chạy với môi trường rỗng.
- Kiểm thử: unit test bộ so sánh; integration test bộ chuẩn trong Docker; test hai mode; test đồng thời.
- Phụ thuộc: P2, P3.

### P5 — Backend API và dữ liệu

- Mục tiêu/phạm vi: xác thực, phân quyền, quản lý lớp/bài/template/test/submission theo REQUIREMENTS; kết nối Azure SQL Database; tích hợp P4.
- Bàn giao: API có đặc tả (OpenAPI hoặc tương đương), migration, test tích hợp và `docs/AZURE_SETUP.md` (tạo database free tier, AutoPause, firewall, cảnh báo hạn mức, budget alert, user quyền tối thiểu).
- Nghiệm thu:
  1. Mọi endpoint MVP có integration test và pass.
  2. Phân quyền: sinh viên không xem được test ẩn, bài/điểm/submission của người khác, không gọi được API giảng viên; mỗi luật có ít nhất một test âm tính.
  3. Backend kiểm tra giới hạn kích thước code, template và test case.
  4. Deadline và cơ chế lấy điểm cao nhất được áp dụng đúng, có test biên.
  5. Connection string/credential chỉ nằm ở môi trường backend/worker; không xuất hiện trong frontend bundle hoặc repository.
- Kiểm thử: integration test với container SQL Server ở local; test pool kết nối đóng hết sau thời gian rảnh (không còn kết nối mở để database pause được); kiểm tra kết nối staging Azure SQL và firewall trước khi deploy.
- Phụ thuộc: P3, P4.

### P6 — Giao diện giảng viên

- Mục tiêu/phạm vi: đăng nhập; quản lý lớp/sinh viên; tạo/sửa bài; chọn template mode hoặc free mode; nhập nội dung đề, ví dụ/test tự kiểm tra, template/vùng được phép sửa, hidden tests, TL/ML và deadline; xem submission/bảng điểm.
- Bàn giao: màn hình quản lý và E2E test.
- Nghiệm thu: E2E — giảng viên tạo được ít nhất một bài cho mỗi mode, thêm hidden tests, đặt TL/ML và deadline; sinh viên thử nộp; giảng viên xem được kết quả và điểm. Form từ chối dữ liệu sai; không có lỗi console trong kịch bản.
- Xuất điểm: `[ĐỀ XUẤT]` CSV; định dạng cuối cùng chốt tại P1.
- Kiểm thử: E2E (ví dụ Playwright) và component test.
- Phụ thuộc: P5.

### P7 — Giao diện sinh viên

- Mục tiêu/phạm vi: xem lớp và danh sách bài; xem đề và ví dụ/test công khai; nhập/paste/upload code theo mode; ở template mode chỉ sửa vùng được phép; nộp bài, xem trạng thái chấm, điểm và lịch sử submission.
- Bàn giao: màn hình sinh viên và E2E test.
- Nghiệm thu: E2E pass cho template mode và free mode: lời giải đúng được chấm đạt; lời giải sai không đạt; lỗi cú pháp trả CE và thông báo phù hợp; hidden test data không bị lộ; trạng thái được cập nhật mà không cần tải lại trang; giao diện dùng được ở laptop và điện thoại.
- Kiểm thử: E2E theo từng mode và verdict.
- Phụ thuộc: P5; có thể chạy song song P6.

### P8 — Gia cố: bảo mật, hiệu năng, vận hành

- Mục tiêu/phạm vi: chống lạm dụng, đo tải, log, healthcheck, theo dõi hạn mức database và sao lưu theo khả năng gói đã chọn.
- Bàn giao: `reports/P8_security.md`, `reports/P8_load.md`; rate limit submit; log có cấu trúc; hướng dẫn theo dõi Azure SQL Free Tier usage.
- Nghiệm thu:
  1. Bộ ≥ 10 chương trình/kịch bản tấn công (fork bomb, đọc file hệ thống, gọi mạng, output khổng lồ, sleep dài, biên dịch cực lâu...) không làm sập worker hoặc làm lộ dữ liệu; mọi giới hạn và rủi ro còn lại được ghi rõ.
  2. Kiểm thử tải với tối đa 20 người dùng đồng thời và kịch bản lớp khoảng 50 sinh viên trong một buổi; đo p50/p95 thời gian từ submit tới kết quả, throughput, queue time, CPU/RAM và tỷ lệ lỗi.
  3. Ngưỡng p95 được chốt ở P1; không mất submission trong bài test tải.
  4. Không còn lỗ hổng phụ thuộc mức high/critical theo công cụ audit của stack.
  5. Database quota/auto-pause được theo dõi; hành vi khi gần/hết hạn mức được kiểm thử và mô tả.
  6. Đo vCore-giây tiêu thụ trong một buổi mô phỏng (metric Azure); database tự pause trong ≤ 20 phút sau khi hết người dùng; ngoại suy mức dùng tháng.
  7. Chọn gói Render cho grader (free hay trả phí) dựa trên số đo; người dùng duyệt.
- Kiểm thử: chạy bộ tấn công; load test trên local với giới hạn CPU/RAM giống gói Render dự kiến; kiểm thử quota/auto-pause trên môi trường phù hợp nếu có thể.
- Phụ thuộc: P4–P7.

### P9 — Deploy Vercel + Render + Azure

- Mục tiêu/phạm vi: frontend lên Vercel; API và worker Docker lên Render; database Azure SQL Database; cấu hình kết nối an toàn.
- Bàn giao: cấu hình Render/Vercel từ cùng một repo GitHub (Vercel Root Directory = `src/web`; 2 service Render dùng Dockerfile của `src/api` và `src/grader`), biến môi trường/secret, CORS, firewall Azure SQL, migration khi deploy, `docs/DEPLOY.md` có quy trình rollback.
- Nghiệm thu:
  1. Smoke test trên URL thật: đăng nhập, tạo bài ở hai mode, nộp và nhận kết quả đúng cho AC/WA/TLE/CE.
  2. Hidden test không thể truy cập từ frontend hoặc tài khoản sinh viên.
  3. Bộ tấn công P8 chạy lại trên Render; mọi khác biệt so với local được ghi nhận và người dùng duyệt.
  4. Không có secret trong repo và bundle frontend.
  5. Rollback về bản trước thực hiện được theo DEPLOY.md.
- Kiểm thử: E2E smoke trên staging; đo cold start nếu gói Render có chế độ ngủ; kiểm tra kết nối Vercel → Render và Render → Azure SQL.
- Phụ thuộc: P8; tài khoản Vercel/Render/Azure do người dùng cung cấp.

### P10 — Pilot và bàn giao

- Mục tiêu/phạm vi: dùng thử với ít nhất một bài Cấu trúc dữ liệu và Giải thuật thật ở mỗi mode; sửa lỗi nghiêm trọng; viết hướng dẫn.
- Bàn giao: `docs/HUONG_DAN_GIANG_VIEN.md`, `docs/HUONG_DAN_SINH_VIEN.md`, `FINAL_REPORT.md`, danh sách lỗi còn lại.
- Nghiệm thu: hoàn thành ít nhất một buổi thực hành thật hoặc mô phỏng cho lớp tối đa khoảng 50 sinh viên, tối đa 20 người dùng đồng thời, không gián đoạn nghiêm trọng; không còn lỗi nghiêm trọng đang mở; người dùng duyệt.
- Kiểm thử: UAT theo kịch bản trong REQUIREMENTS; ghi nhận phản hồi.
- Phụ thuộc: P9.

## 10. Các điểm cần người dùng xác nhận/thực hiện

1. **Free mode (duyệt ở P1, chặn P4):** chấp nhận cơ chế "khai báo điểm vào" ở 4.2 — tên tự do, kiểu tham số/trả về do đề quy định?
2. **Azure (kiểm tra trong portal):** khi tạo Azure SQL Database có hiện free offer không; subscription có phải Azure for Students Starter không. Không có free tier → báo lại trước P5 để chọn phương án khác.
3. **Rủi ro AutoPause:** hết 100.000 vCore-giây trong tháng thì database ngừng tới đầu tháng sau (không mất tiền). Đồng ý?
4. **GitHub:** tạo repo private trống (không README/.gitignore/license), rồi chạy commit đầu và push (lệnh trong phản hồi của Claude).
5. **Chi phí Render:** nếu P2/P8 cho thấy grader free không đủ, có chấp nhận trả gói nhỏ nhất cho riêng grader? (quyết định khi có số đo)

## 11. Tài liệu tham khảo Azure đã kiểm tra

- Azure for Students: 100 USD credit có thời hạn một năm và có một số dịch vụ được chọn miễn phí: https://learn.microsoft.com/en-us/azure/education-hub/about-azure-for-students
- Azure SQL Database Free Tier: hạn mức 100.000 vCore-seconds, 32 GB dữ liệu và 32 GB backup mỗi tháng; giới hạn/điều kiện và cách xử lý khi đạt hạn mức: https://learn.microsoft.com/en-us/azure/azure-sql/database/free-tier?view=azuresql
- Azure SQL Database Free Tier FAQ: không có SLA; Student Starter không tương thích; quy định auto-pause và overage: https://learn.microsoft.com/en-us/azure/azure-sql/database/free-tier-faq?view=azuresql
- Microsoft SQL drivers/frameworks: Node.js dùng driver Tedious; Node.js/TypeScript có thể dùng các ORM tương thích như Prisma, Sequelize hoặc TypeORM: https://learn.microsoft.com/en-us/sql/connect/sql-connection-libraries?view=sql-server-ver17
- Azure SQL Free Tier (bổ sung): pause sau 15 phút không hoạt động, cố định; kết nối mở ngăn auto-pause và vẫn tiêu vCore-giây; region của free database đầu tiên không đổi được; alert "Free amount remaining": https://learn.microsoft.com/en-us/azure/azure-sql/database/free-tier?view=azuresql
- Azure SQL serverless: mức dùng dưới min vCore được tính theo min (mặc định 0,5 vCore); nên có retry khi auto-resume: https://learn.microsoft.com/en-us/azure/azure-sql/database/serverless-tier-overview?view=azuresql
- Render free: free cho web service, Render Postgres, Render Key Value; background worker/private service không có free; ngủ sau 15 phút, thức lại khoảng 1 phút; 750 giờ/tháng/workspace: https://render.com/docs/free

---

**Trạng thái phê duyệt:** Chưa duyệt. Chỉ bắt đầu phase theo quy trình sau khi người dùng kiểm tra và gửi `Duyệt roadmap.`
