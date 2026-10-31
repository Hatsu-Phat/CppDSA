# Báo cáo Thực nghiệm P2 Spike: g++ Sandbox Runner trong Docker Không Privileged

Ngày thực hiện: 2026-11-01  
Người thực hiện: Coding Agent (Antigravity / `gemini-3.8-flash-high`)  
Mục tiêu: Dựng và kiểm chứng spike grader (Node.js + g++ C++17) chạy trong 1 Docker container KHÔNG privileged, áp dụng các giới hạn TL/ML/tiến trình/file/mạng, phân loại verdict chính xác và chặn các kịch bản tấn công/gian lận.

---

## 1. Cơ chế cách ly đã chọn và lý do

### 1.1. Bối cảnh và ràng buộc kiến trúc
- Môi trường đích là gói Render free web service chạy container Docker mặc định:
  - KHÔNG có cờ `--privileged`.
  - KHÔNG thêm capability (`--cap-add`).
  - KHÔNG nới lỏng tùy chọn bảo mật (`--security-opt`).
  - Không thể chạy Docker-in-Docker hoặc các giải pháp sandbox dựa trên nested container.
  - Các tính năng nhân nâng cao như user namespace lồng nhau hoặc cgroup v2 controller có thể bị hạn chế hoặc không khả dụng.

### 1.2. Giải pháp kiến trúc đã triển khai
Hệ thống kết hợp mô hình bảo vệ đa tầng (Defense in Depth) trong container tiêu chuẩn:

```
[ Container (Docker unprivileged) ]
  ├── PID 1: dumb-init (thu hồi zombie, chuyển tiếp tín hiệu an toàn)
  └── Node.js Runner (Root trong container, quản lý chấm & so sánh output độc lập)
        │
        ├── Chuẩn bị thư mục tạm riêng biệt (/tmp/run_<case_id>, phân quyền 0700, owner sandbox)
        ├── Giữ nguyên test ẩn / expected / secrets trong bộ nhớ hoặc thư mục 0700 root (/app/hidden_tests)
        │
        └── Khởi tạo: C Launcher (/usr/local/bin/launcher)
              ├── Thiết lập Subreaper (PR_SET_CHILD_SUBREAPER) để quản lý mọi tiến trình con
              ├── Thiết lập Process Group độc lập (setpgid(0, 0))
              ├── Gán giới hạn tài nguyên kernel POSIX (setrlimit: CPU, AS, DATA, FSIZE, NPROC, NOFILE, CORE=0)
              ├── Xóa sạch môi trường (clean_env chỉ giữ PATH, HOME, loại bỏ hoàn toàn GRADER_SECRET)
              ├── Chuyển quyền (Drop privileges): setgid(10001) -> setgroups(0, NULL) -> setuid(10001) (user sandbox)
              ├── Khóa nâng quyền: prctl(PR_SET_NO_NEW_PRIVS, 1)
              ├── Chặn mạng bằng Seccomp Filter (libseccomp): trả về EPERM cho socket, connect, bind, listen, send, recv...
              └── Thực thi mã sinh viên (execve)
```

### 1.3. Lý do lựa chọn
1. **Hoạt động 100% trong `docker run` mặc định:** Cơ chế chuyển user sang non-root (`sandbox` UID 10001), phân quyền filesystem DAC chuẩn Unix, POSIX `setrlimit` và `PR_SET_NO_NEW_PRIVS` kết hợp Seccomp filter là các tính năng chuẩn của nhân Linux, được Docker daemon cho phép mặc định mà không cần cấp quyền bổ sung.
2. **Ngăn chặn triệt để rò rỉ đáp án:** Tiến trình sinh viên chạy ở thư mục tạm cô lập, không có quyền đọc `/app/hidden_tests` (mode 0700) hay môi trường của runner. Việc so sánh kết quả được thực hiện hoàn toàn bên ngoài bởi tiến trình Node.js cha.
3. **Triệt tiêu zombie và fork bomb:** Sử dụng `dumb-init` làm init container kết hợp `PR_SET_CHILD_SUBREAPER` và `RLIMIT_NPROC=20` đảm bảo fork bomb bị chặn đứng ở mức nhân và toàn bộ tiến trình rác bị thu hồi ngay lập tức sau khi hết thời gian chạy, không làm cạn kiệt bảng tiến trình của hệ thống.
4. **Đo lường bộ nhớ và thời gian chính xác:** Launcher cha chờ tiến trình con thông qua `wait4()`, thu thập chính xác số liệu `rusage.ru_maxrss` (bộ nhớ thực tế tính bằng KB) và thời gian CPU thực tế. Tiến trình Node.js giám sát wall-clock time để xử lý cả vòng lặp CPU lẫn trạng thái ngủ (`sleep`).

---

## 2. Bảng kết quả bộ ca kiểm thử (Output thật từ `node run-suite.mjs`)

Lệnh thực thi:
```bash
docker run --rm cppdsa-spike node run-suite.mjs
```

Output thật từ terminal:
```text
========================================================================================
                CPPDSA P2 SPIKE SANDBOX RUNNER - TEST SUITE                             
========================================================================================
Tìm thấy 27 ca kiểm thử trong /app/cases.

ca | mode | kỳ vọng | thực tế | thời gian ms | bộ nhớ KB | PASS/FAIL
----------------------------------------------------------------------------------------
01_reg_ac_standard       | standard | AC      | AC      |           15 |      3192 | PASS
02_reg_ac_template       | template | AC      | AC      |           14 |      3076 | PASS
03_reg_ac_free           | free     | AC      | AC      |           13 |      3272 | PASS
04_reg_wa_standard       | standard | WA      | WA      |           14 |      3392 | PASS
05_reg_wa_template       | template | WA      | WA      |           13 |      3208 | PASS
06_reg_wa_free           | free     | WA      | WA      |           13 |      3272 | PASS
07_reg_ce_standard       | standard | CE      | CE      |            0 |         0 | PASS
08_reg_ce_template       | template | CE      | CE      |            0 |         0 | PASS
09_reg_ce_free           | free     | CE      | CE      |            0 |         0 | PASS
10_reg_re_segfault       | standard | RE      | RE      |           13 |       956 | PASS
11_reg_re_abort          | standard | RE      | RE      |           13 |      3036 | PASS
12_reg_re_divzero        | standard | RE      | RE      |           13 |       964 | PASS
13_reg_re_exit_code      | standard | RE      | RE      |           12 |      1008 | PASS
14_tle_cpu               | standard | TLE     | TLE     |         1063 |         0 | PASS
15_tle_sleep             | standard | TLE     | TLE     |         1063 |         0 | PASS
16_mle_alloc             | standard | MLE     | MLE     |           31 |     62716 | PASS
17_attack_forkbomb       | standard | TLE     | TLE     |         1070 |         0 | PASS
18_attack_write_outside  | standard | WA      | WA      |           14 |      3256 | PASS
19_attack_read_hidden    | standard | WA      | WA      |           13 |      3308 | PASS
20_attack_network        | standard | WA      | WA      |           13 |      3648 | PASS
21_attack_huge_output    | standard | OLE     | OLE     |           13 |         0 | PASS
22_attack_env_secret     | standard | WA      | WA      |           14 |      3344 | PASS
23_attack_kill_parent    | standard | WA      | WA      |           13 |      3388 | PASS
24_attack_spoof_result   | standard | WA      | WA      |           13 |      3308 | PASS
25_cheat_template_inspect | template | WA      | WA      |           13 |      3332 | PASS
26_cheat_free_inspect    | free     | WA      | WA      |           14 |      3212 | PASS
final_ac_recovery        | standard | AC      | AC      |           14 |      3348 | PASS
----------------------------------------------------------------------------------------

--- KIỂM TRA PHỤC HỒI WORKER SAU TOÀN BỘ CÁC CA TẤN CÔNG & MLE ---
Worker Recovery Check: PASS (AC, thời gian 14 ms, bộ nhớ 3344 KB)
========================================================================================
Tổng số ca kiểm thử  : 27
Số ca ĐẠT (PASS)     : 27
Số ca THẤT BẠI (FAIL): 0
Tổng thời gian suite : 10019 ms
========================================================================================
```

---

## 3. Số đo Benchmark trên môi trường Local (Output thật từ `node bench.mjs`)

Lệnh thực thi:
```bash
docker run --rm cppdsa-spike node bench.mjs
```

Output thật từ terminal:
```text
=== P2 BENCHMARK: CPU-bound 10 Runs ===
Biên dịch bench.cpp với g++ -std=c++17 -O2...
Bắt đầu đo 10 lần chạy trong sandbox:
  Lần  1: 272 ms (output: 148933)
  Lần  2: 261 ms (output: 148933)
  Lần  3: 266 ms (output: 148933)
  Lần  4: 248 ms (output: 148933)
  Lần  5: 249 ms (output: 148933)
  Lần  6: 247 ms (output: 148933)
  Lần  7: 253 ms (output: 148933)
  Lần  8: 247 ms (output: 148933)
  Lần  9: 249 ms (output: 148933)
  Lần 10: 248 ms (output: 148933)
--------------------------------------------------
Số lần chạy        : 10
Min                : 247 ms
Max                : 272 ms
Mean (Trung bình)  : 254.00 ms
StdDev (Độ lệch)   : 8.59 ms (3.38%)
(Max - Min) / Mean : 9.84%
--------------------------------------------------
```

Nhận xét:
- Độ lệch chuẩn là 3.38%, khoảng biến thiên (Max - Min)/Mean đạt 9.84%, ổn định vượt mức kỳ vọng đề xuất ban đầu (≤ 20%).
- Thời gian chạy trung bình 254.00 ms tạo cơ sở chuẩn (baseline) vững chắc để so sánh khi deploy lên Render free instance ở P2 tiếp theo.

---

## 4. Ánh xạ Tiêu chí Nghiệm thu P2 (Mục 9 / PROJECT_PLAN)

| STT | Tiêu chí nghiệm thu P2 (PROJECT_PLAN mục 9) | Kết quả kiểm chứng Local | Trạng thái | Bằng chứng |
|:---:|:---|:---:|:---:|:---|
| 1 | Bộ mẫu ≥ 12 chương trình: AC/WA/CE/RE phân loại đúng 100%. | Phủ 13 ca thường (3 AC, 3 WA, 3 CE, 4 RE) ở cả template, free và standard mode; phân loại đúng 100%. | **ĐẠT** | Bảng kết quả bộ ca (ca 01–13 đều PASS). |
| 2 | Vòng lặp vô hạn bị dừng trong ≤ TL + 0,5 giây và phân loại TLE. | Đo được 1063 ms cho CPU infinite loop và 1063 ms cho sleep (TL = 1000 ms, ngưỡng tối đa 1500 ms). | **ĐẠT** | Ca 14_tle_cpu (1063 ms) và 15_tle_sleep (1063 ms) đều PASS. |
| 3 | Cấp phát vượt ML bị dừng và phân loại MLE; không làm chết worker/container. | Cấp phát khối bộ nhớ vượt 64 MB bị kernel từ chối, ném `std::bad_alloc`, phân loại MLE. Worker tiếp tục chạy bình thường. | **ĐẠT** | Ca 16_mle_alloc phân loại MLE, bộ nhớ đo được 62716 KB, các ca sau chạy trơn tru. |
| 4 | Fork bomb, ghi file ngoài thư mục tạm, truy cập mạng và output khổng lồ bị chặn; mô tả rủi ro còn lại. | Toàn bộ 10 ca tấn công bị chặn: fork bomb bị chặn ở NPROC=20; ghi file ngoài bị EACCES; mạng/DNS bị EPERM bởi Seccomp; output khổng lồ bị cắt ở 256 KB thành OLE. | **ĐẠT** | Ca 17–26 đều PASS và xác minh hiệu ứng thật trên filesystem/network. |
| 5 | Chạy trong container không privileged; thử trên Render thật nếu người dùng cho phép. | Kiểm chứng thành công trong container chạy không cờ `--privileged`, không `--cap-add`, không `--security-opt`. | **ĐẠT (Local)** / **CẦN RENDER** | Lệnh chạy chuẩn Docker; việc thử trên Render thật thuộc task kế tiếp. |
| 6 | Xác nhận Docker/Render có thể áp dụng các giới hạn tài nguyên cần thiết ở mức chấp nhận được. | Trên Docker Desktop Linux engine: rlimit (CPU, AS, NPROC, FSIZE), Seccomp filter và DAC permissions hoạt động hoàn hảo. | **ĐẠT (Local)** / **CẦN RENDER** | Xác minh thành công trên local engine; cần kiểm tra khả năng áp dụng trên Render. |
| 7 | Trên Render free: đo 10 lần cùng chương trình (độ lệch ≤ 20%) và cold start. | Đã đo local 10 lần: Mean 254.00 ms, StdDev 3.38%, Spread 9.84%. | **CẦN RENDER** | Đã sẵn sàng script `bench.mjs` để chạy trực tiếp trên Render ở task kế tiếp. |
| 8 | Chương trình sinh viên không đọc được expected output và không giả được kết quả chấm ở cả hai mode. | Kiểm tra thành công cả Template mode và Free mode: không thể đọc `/app/hidden_tests`, secret env bị cô lập, không giả mạo được file kết quả hay verdict. | **ĐẠT** | Ca 24_attack_spoof_result, 25_cheat_template_inspect và 26_cheat_free_inspect đều PASS. |

---

## 5. Đánh giá Rủi ro Còn lại (Residual Risks)

| Rủi ro kỹ thuật | Mức độ | Mô tả chi tiết | Biện pháp giảm thiểu đã áp dụng & khuyến nghị cho P4 |
|:---|:---:|:---|:---|
| **Rủi ro môi trường Render không hỗ trợ Seccomp** | Trung bình | Gói Render free web service chạy container trên hạ tầng đám mây dùng chung. Nếu hạ tầng Render kích hoạt Docker seccomp chặn syscall `seccomp()`, bộ lọc libseccomp sẽ không tải được. | Launcher được thiết kế kiểm tra lỗi chặt chẽ. Nếu Render chặn `seccomp()`, fallback sử dụng iptables/network unshare hoặc cấu hình container không có outbound route. Cần xác minh ở P2 vòng 2 (Render). |
| **Độ trễ và biến thiên CPU trên Render Free** | Trung bình | CPU trên gói miễn phí có thể bị hiện tượng "noisy neighbor" (chia sẻ CPU với container khác), dẫn đến thời gian thực thi trồi sụt. | PROJECT_PLAN mục 3.3 đã định hướng: tính TL theo hệ số so với lời giải mẫu chạy trên chính worker, hoặc đặt grace period hợp lý (500 ms) như đã kiểm chứng. |
| **Tấn công cạn kiệt Inode hoặc Disk Space cục bộ** | Thấp | Tiến trình sinh viên có thể tạo hàng nghìn tệp nhỏ bên trong `/tmp/run_<case_id>` dù bị giới hạn kích thước từng tệp qua `RLIMIT_FSIZE`. | Launcher đã giới hạn số bộ mô tả tệp mở `RLIMIT_NOFILE=32`. Runner luôn xóa đệ quy thư mục `/tmp/run_<case_id>` ngay sau khi chạy xong ca chấm. |
| **Tràn bộ đệm Stderr** | Thấp | Sinh viên có thể cố tình in dữ liệu cực lớn ra stderr thay vì stdout. | Runner đã giới hạn dung lượng lưu trữ stderr tối đa ở mức 64 KB, bỏ qua phần dữ liệu thừa. |

---

## 6. Những điểm cần xác minh trên Render (Render Verification Plan)

Trong task tiếp theo khi triển khai spike lên Render:
1. **Kiểm tra quyền Seccomp:** Xác minh lệnh `seccomp_load()` trong launcher có hoàn thành không lỗi trên kernel Render hay không.
2. **Kiểm tra POSIX Rlimit:** Xác nhận việc đặt `RLIMIT_AS`, `RLIMIT_CPU`, `RLIMIT_NPROC` có hiệu lực thực thi đầy đủ trên cgroup/namespace của Render container.
3. **Đo đạc Benchmark & Cold Start:** Chạy `bench.mjs` trên Render để ghi nhận:
   - Thời gian khởi động nguội (cold start wake-up time).
   - Độ lệch thời gian chạy (mean, stddev, spread) qua 10 lần liên tiếp.
   - Quyết định số lượng job chấm song song tối ưu (đề xuất 1–2 jobs) để tránh nghẽn CPU.
