# Báo cáo Kiểm thử Bảo mật Sandbox CppDSA (P8 Security Hardening)

- **Ngày thực hiện**: 2026-11-01
- **Môi trường đo**: Docker Compose throttled (`tests/load/docker-compose.load.yml`), mô phỏng Render free tier:
  - Grader: `cpus: 0.15`, `mem_limit: 512m`
  - API: `mem_limit: 512m`
  - Database: PostgreSQL 16
- **Test suite**: `tests/security/run-attacks.mjs` (15 kịch bản tấn công)
- **Tiêu chí an toàn**:
  1. Không có kịch bản nào đạt AC (Verdict phải là CE, RE, MLE, TLE, hoặc WA). Điểm số phải bằng 0.
  2. Grader không bị sập: endpoint `/health` trả về HTTP 200 OK ngay sau mỗi kịch bản.
  3. Không rò rỉ dữ liệu nhạy cảm: không rò rỉ biến môi trường (`GRADER_SECRET`, `DATABASE_URL`), nội dung test ẩn (`HIDDEN_MARK_SECURITY_CANARY_XYZ999`), hoặc tài khoản hệ thống (`/etc/shadow`, `/etc/passwd`).
  4. Trạng thái sandbox toàn vẹn: nộp bài hợp lệ (canary submission) ngay sau mỗi kịch bản phải chấm đúng và trả về AC (100 điểm).

---

## 1. Bảng Kết quả Kiểm thử Tấn công (15/15 Scenarios)

| ID | Tên kịch bản tấn công | File C++ | Cơ chế kiểm soát / Chặn | Verdict thực tế | Rò rỉ secret / File | Grader Health | Canary AC kế tiếp | Kết quả |
|---|---|---|---|:---:|:---:|:---:|:---:|:---:|
| **TC-ATK-01** | Fork bomb (tiến trình con đệ quy vô hạn) | `fork_bomb.cpp` | `RLIMIT_NPROC` (16) + Seccomp BPF (chặn clone/fork ngoài giới hạn) | **WA** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-02** | Thread bomb (`std::thread` bão hòa tài nguyên) | `thread_bomb.cpp` | `RLIMIT_NPROC` + cgroup pids limit | **RE** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-03** | Memory bomb (`malloc`/`vector` vượt giới hạn) | `memory_bomb.cpp` | `RLIMIT_AS` (256MB) + cgroup memory | **MLE** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-04** | Đọc file nhạy cảm (`/etc/shadow`, `/proc/*/environ`) | `read_sensitive_files.cpp` | Linux UID isolation (unprivileged uid) + file permissions 0700 | **WA** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-05** | Đọc chéo thư mục job khác (`/tmp/run_*`) | `read_other_jobs.cpp` | Permissions thư mục job `0700`, UID riêng cho mỗi sandbox execution | **WA** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-06** | Mở socket mạng ra ngoài (DB, API, Internet) | `network_socket.cpp` | Seccomp filter chặn `socket`, `connect`, `bind`, `listen`, `accept` | **WA** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-07** | Bão lụt `stdout` (in hàng trăm MB) | `stdout_flood.cpp` | Node stream quota (max 2MB) + `RLIMIT_FSIZE` | **RE** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-08** | Bão lụt `stderr` | `stderr_flood.cpp` | Truncate stderr buffer tại 8KB, không nghẽn pipe | **TLE** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-09** | Ngủ dài (`sleep(15)` hòng chiếm giữ worker) | `long_sleep.cpp` | Wall deadline = `TL * GRADER_WALL_FACTOR + 1000ms`, kill SIGKILL sau hạn | **TLE** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-10** | Tấn công kill tiến trình cha (`kill(-1, SIGKILL)`) | `kill_parent.cpp` | Unprivileged UID (chỉ kill được tiến trình cùng UID), Seccomp filter | **WA** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-11** | Thực thi shell `/bin/sh` (`execve`) | `exec_shell.cpp` | Seccomp BPF chặn `execve` đối với các binary ngoài whitelist/binary của job | **WA** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-12** | Ghi đầy ổ đĩa / file tạm khổng lồ | `disk_fill.cpp` | `RLIMIT_FSIZE` (10MB) + cgroup io + tmpfs size limit | **RE** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-13** | Compile bomb (template đệ quy sâu vô tận) | `compile_bomb.cpp` | `COMPILE_TIMEOUT_MS` + `COMPILE_CPU_LIMIT_S` (RLIMIT_CPU) | **CE** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-14** | Đọc file lúc biên dịch (`#include "/etc/passwd"`) | `compile_read_file.cpp` | Compiler output sanitization (redact `/etc/*`, `/proc/*`, accounts) | **CE** | KHÔNG | 200 OK | AC | **PASS** |
| **TC-ATK-15** | Mảng tĩnh khổng lồ (Object / Binary bomb) | `binary_bomb.cpp` | Compiler `RLIMIT_AS` và `RLIMIT_FSIZE` (output binary tối đa 50MB) | **CE** | KHÔNG | 200 OK | AC | **PASS** |

**Tổng kết**: **15/15 kịch bản ĐẠT (100% PASS)**.

---

## 2. Phân tích Chi tiết Cơ chế Phòng thủ

### 2.1. Giới hạn Tài nguyên & Quản lý Tiến trình (Resource Limits & Process Control)
- **CPU Time vs. Wall Time**: Phân biệt rạch ròi giữa thời gian CPU thực tế tiêu thụ (`rusage.user_time + rusage.sys_time`) và thời gian thực (`wallTime`).
  - Chương trình thuật toán nặng nhưng trong ngưỡng CPU time cho phép sẽ được AC, ngay cả khi CPU máy chủ bị chia sẻ hoặc điều tiết (throttled CFS 0.15 CPU).
  - Chương trình cố tình dùng `sleep()` để vượt qua CPU time check sẽ bị bắt bởi **Wall Deadline** (`TL × GRADER_WALL_FACTOR + 1000 ms`), gán nhãn **TLE** và bị chấm dứt cưỡng bức (`SIGKILL`).
- **Memory Limits**: Cấu hình kép gồm `RLIMIT_AS` (Address Space) trong tiến trình C++ và cgroup memory limit của container Grader (512MB), ngăn ngừa hoàn toàn tình trạng OOM sập container.
- **Process & File Sweeper**: Cơ chế `UidPool.cleanUid(uid)` chạy trước mỗi lần cấp phát và khi giải phóng UID, quét toàn bộ `/tmp` và `kill -9` mọi tiến trình còn sót lại của UID đó. Thêm vào đó, cờ `PR_SET_PDEATHSIG` trong `launcher` đảm bảo tiến trình con tự động nhận `SIGKILL` ngay khi tiến trình mẹ kết thúc.

### 2.2. Kiểm soát Compiler & Chống Rò rỉ Dữ liệu Biên dịch
- **Compile Timeout**: Hạn chế thời gian biên dịch tối đa bằng cả wall timeout (`COMPILE_TIMEOUT_MS`) và CPU time limit (`COMPILE_CPU_LIMIT_S`), ngăn chặn các kỹ thuật Template Metaprogramming làm treo compiler.
- **Compiler Sanitization (`sanitizeCompileMessage`)**:
  - Tự động thay thế mọi chuỗi chứa `GRADER_SECRET` hoặc token cấu hình bằng `[REDACTED_SECRET]`.
  - Che dấu toàn bộ đường dẫn hệ thống nhạy cảm (`/etc/passwd`, `/etc/shadow`, `/proc/*`, `/sys/*`) bằng `[REDACTED_SYSTEM_PATH]`.
  - Lọc bỏ các dòng chứa định danh tài khoản hệ điều hành (`root:`, `bin:`, `daemon:`) bằng `[REDACTED_SYSTEM_CONTENT]`.
  - Cắt ngắn thông báo lỗi biên dịch tối đa 2000 ký tự để chống DoS logging và UI overflow.

### 2.3. Seccomp BPF & Network Isolation
- Seccomp BPF được kích hoạt ở chế độ strict cho code sinh viên, chặn các syscall nguy hiểm: `socket`, `bind`, `connect`, `listen`, `accept`, `sendto`, `recvfrom`, `ptrace`, `kill` sang các tiến trình khác, `reboot`, `mount`.
- Kết nối socket bị chặn ngay lập tức, ngăn mã sinh viên probe DB nội bộ hoặc gửi dữ liệu qua mạng ra ngoài.

---

## 3. Đánh giá Rủi ro Còn lại (Residual Risks) & Biến pháp Giảm thiểu

1. **Rủi ro cgroup v2 & Linux Kernel Version trên môi trường Render**:
   - *Rủi ro*: Một số nhà cung cấp PaaS sử dụng kernel chia sẻ không hỗ trợ đầy đủ quyền gán Seccomp lồng nhau hoặc cgroup v2 cho unprivileged users trong container.
   - *Biện pháp giảm thiểu*: Image Grader chạy dưới dạng container độc lập có `entrypoint.sh` thiết lập quyền `sudo` cho launcher đối với việc setuid/gid và áp dụng filter Seccomp, đồng thời graceful fallback về rlimit nếu seccomp bị từ chối cấp quyền bởi host kernel.
2. **Rủi ro DoS Hàng đợi (Queue Starvation)**:
   - *Rủi ro*: Một sinh viên có thể liên tục gửi các bài nộp tốn tối đa thời gian biên dịch (10s) và thời gian chạy (10s) nhằm chiếm dụng worker.
   - *Biện pháp giảm thiểu*: Đã triển khai rate limit nghiêm ngặt theo tài khoản: tối đa 6 lần nộp/phút/sinh viên và 300 request/phút/IP trên toàn hệ thống API.
3. **Phân rã Bộ nhớ Ảo khi xử lý nhiều bài kiểm tra liên tục**:
   - *Biện pháp giảm thiểu*: Grader tự động dọn dẹp thư mục tạm `/tmp/run_*` sau khi hoàn thành từng test, và UidPool thực hiện GC cưỡng bức các tiến trình/tệp tin rác.
