# Đặc tả Dịch vụ Chấm bài (Grader Service Specification)

Tài liệu đặc tả hợp đồng dữ liệu, cơ chế sandbox, hàng đợi, phân bổ tài nguyên và bảo mật của dịch vụ chấm bài `src/grader` trong hệ thống CppDSA.

---

## 1. Hợp đồng dữ liệu (Job & Result Contracts)

Tất cả các định nghĩa kiểu dữ liệu được chia sẻ tập trung trong `@cppdsa/shared` (`src/shared/src/index.ts`).

### 1.1. Yêu cầu nộp chấm (`JudgeJob`)

Gửi tới grader qua HTTP `POST /jobs` với header `X-Grader-Secret`:

```typescript
export interface JudgeJob {
  submissionId: string;
  mode: 'template' | 'free';
  language: 'cpp17';
  timeLimitMs: number;
  memoryLimitMb: number;
  compare: 'trim-trailing';
  template?: {
    source: string;
    regions: Record<string, string>;
  };
  free?: {
    harness: string;
    entry: {
      type: 'function' | 'method';
      name: string;
      className?: string;
    };
    studentSource: string;
  };
  hiddenTests: Array<{
    id: string | number;
    input: string;
    expected: string;
  }>;
  callbackUrl: string;
}
```

> [!IMPORTANT]
> **Nguyên tắc bảo mật:** Test công khai **KHÔNG** bao giờ có trong job chấm. Job chỉ chứa `hiddenTests` được cung cấp từ backend API.

### 1.2. Kết quả trả về (`JudgeResult`)

Gửi về API qua `POST callbackUrl` với header `X-Grader-Secret`:

```typescript
export interface JudgeResult {
  submissionId: string;
  status: 'DONE' | 'SYSTEM_ERROR';
  verdict: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'SE';
  score: number; // Tỷ lệ đạt = số test AC / tổng số test
  tests: Array<{
    index: number;
    verdict: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'SE';
    timeMs: number;
    memoryKb: number;
  }>;
  compileMessage?: string;
}
```

- **Quy tắc tuyệt đối:** Kết quả `JudgeResult` và mảng `tests` **KHÔNG** chứa `input`, `expected`, `actual` (output thực tế) hoặc đường dẫn file hệ thống.
- `compileMessage`: Giới hạn tối đa 2000 ký tự (tính cả hậu tố thông báo rút gọn `\n...[TRUNCATED]`), loại bỏ các đường dẫn thư mục tạm (`/tmp/run_*`), thay bằng tên logic (`solution.cpp`, `template.cpp`), loại bỏ mọi chuỗi bí mật/secret.
- `verdict` tổng: `CE` nếu biên dịch lỗi; `AC` nếu tất cả hidden tests đạt `AC`; ngược lại lấy verdict của test thất bại đầu tiên.
- `score`: `(số test AC) / (tổng số test)` làm tròn 4 chữ số thập phân (e.g. `1.00`, `0.6667`, `0.00`).

---

## 2. Hai chế độ bài tập (Two Modes)

### 2.1. Chế độ Template (Template Mode)
- Giảng viên cung cấp mã nguồn khung (`source`) có chứa các khối đánh dấu:
  ```cpp
  // STUDENT_BEGIN <tên_vùng>
  ...
  // STUDENT_END
  ```
- Sinh viên chỉ gửi nội dung các vùng (`regions: { [tên_vùng]: mã_nguồn }`).
- Grader xác thực danh sách vùng:
  - Nếu thiếu vùng, thừa vùng, hoặc sai tên vùng so với khai báo trong template → Trả về **HTTP 400 Bad Request**, từ chối chấm.
  - Grader không bao giờ nhận file code hoàn chỉnh từ phía sinh viên ở template mode.
- Grader ghép mã nguồn sinh viên vào đúng vị trí từng vùng và biên dịch.

### 2.2. Chế độ Free (Free Mode)
- Sinh viên nộp mã nguồn tự do (`studentSource`) và khai báo điểm vào (`entry`):
  - `type`: `"function"` hoặc `"method"`.
  - `name`: Tên hàm hoặc tên phương thức của sinh viên.
  - `className`: Tên lớp của sinh viên (bắt buộc khi `type === "method"`).
- Giảng viên cung cấp `harness` (adapter test) sử dụng macro/wrapper `CPPDSA_ENTRY`.
- Grader tự sinh preamble kết nối:
  - Khi `type === "function"`:
    ```cpp
    #undef CPPDSA_ENTRY
    #define CPPDSA_ENTRY <name>
    ```
  - Khi `type === "method"`:
    ```cpp
    #include <utility>
    #undef CPPDSA_ENTRY
    template<class... A> decltype(auto) CPPDSA_ENTRY(A&&... a){
        static <className> o;
        return o.<name>(std::forward<A>(a)...);
    }
    ```
- Xác thực định danh: `name` và `className` phải khớp regex `^[A-Za-z_][A-Za-z0-9_]{0,63}$` và không được trùng với từ khóa C++ (C++ keywords). Nếu vi phạm → Trả về **HTTP 400 Bad Request**.
- Nếu sinh viên gõ sai tên hàm/lớp hoặc sai chữ ký tham số trong code → Biên dịch thất bại với verdict **CE**.
- Nếu sinh viên tự định nghĩa `int main()` trong mã nguồn free mode → Xảy ra lỗi trùng `main` với harness (`multiple definition of 'main'`) → Verdict **CE**.

---

## 3. Cơ chế Sandbox và Cách ly An ninh (Sandbox Isolation)

Kế thừa trực tiếp các biện pháp an ninh đã kiểm chứng độc lập tại Spike P2 và bổ sung thích ứng Render:

1. **Launcher C chuyên dụng (`/usr/local/bin/launcher`):**
   - Biên dịch bằng `gcc -O2` liên kết `libseccomp`.
   - Hạ quyền (drop privileges) hoàn toàn về UID/GID không đặc quyền của sandbox (`target_uid` / `target_gid`).
   - Thiết lập `prctl(PR_SET_NO_NEW_PRIVS, 1)` ngăn con chiếm đặc quyền.
   - Thiết lập `prctl(PR_SET_CHILD_SUBREAPER, 1)` để thu gom tiến trình mồ côi.
2. **Bộ lọc Seccomp chặn mạng:**
   - Chặn toàn bộ syscall mạng (`socket`, `connect`, `bind`, `listen`, `accept`, `sendto`, `recvfrom`, `sendmsg`, `recvmsg`, `sendmmsg`, `recvmmsg`) với mã lỗi `EPERM`.
3. **Giới hạn tài nguyên phần cứng (Resource Limits via `rlimit`):**
   - `RLIMIT_CPU`: Giới hạn thời gian CPU (dừng bằng SIGXCPU).
   - `RLIMIT_AS` & `RLIMIT_DATA`: Giới hạn không gian bộ nhớ theo `memoryLimitMb` của job.
   - `RLIMIT_FSIZE`: Giới hạn kích thước file tạo ra (50 MB khi compile, 10 MB khi run).
   - `RLIMIT_NPROC`: Giới hạn tối đa tiến trình (20 tiến trình khi chạy, 50 khi biên dịch) chặn triệt để fork bomb.
   - `RLIMIT_CORE`: Tắt core dump (0 bytes).
4. **Môi trường thực thi rỗng (Strict Clean Environment):**
   - Khi chạy code sinh viên: Môi trường hoàn toàn rỗng (`char *clean_env[] = { NULL }` / `environ` rỗng 0 biến).
   - Khi biên dịch bằng `g++`: Chỉ cung cấp duy nhất biến `PATH=/usr/bin:/bin` (`--compiler-env`).
   - Tuyệt đối không truyền `GRADER_SECRET` hay credential hệ thống vào bất kỳ tiến trình nào.
   - Grader không đọc hay giữ `DATABASE_URL`.
5. **Cách ly thư mục và Khóa thư mục ghi được (Filesystem Hardening):**
   - Người dùng sandbox được tạo với `useradd -M -d /nonexistent -s /usr/sbin/nologin` (hoàn toàn không có thư mục home).
   - Thư mục ứng dụng `/app` được thiết lập quyền `0700` thuộc sở hữu `root:root`.
   - Thư mục `/dev/shm`, `/tmp`, `/var/tmp` được khóa quyền `0755` thuộc sở hữu `root:root` ngay từ entrypoint container và lúc khởi động executor, ngăn code sinh viên ghi vào `/home`, `/dev/shm`, `/tmp`, `/var/tmp` hoặc `../`.
   - Mỗi job chỉ được phép ghi trong thư mục riêng `/tmp/run_<submissionId>_<timestamp>` (quyền `0700`).
   - Sau mỗi test case và khi kết thúc job: Grader quét `/proc` diệt toàn bộ tiến trình thuộc UID của job đó, quét sạch file của UID sandbox trong các thư mục dùng chung, và xóa sạch thư mục chạy.
6. **UID Sandbox Dải Cao (`SANDBOX_UID_BASE`):**
   - Trên nền tảng container Render (kernel cgroup chung), UID nhỏ (như 10001) dễ bị chạm giới hạn RLIMIT_NPROC bên ngoài container gây lỗi `EAGAIN`.
   - Grader sử dụng dải UID cao cấu hình qua `SANDBOX_UID_BASE` (mặc định `2000000000`, pool 8–16 UIDs), có thể cấu hình linh hoạt qua biến môi trường.

---

## 4. Hàng đợi In-Memory và Ngân sách Bộ nhớ (`GRADER_MEMORY_BUDGET_MB`)

- Quản lý hàng đợi bộ nhớ trong tiến trình Node.js:
  - Giới hạn xử lý song song bằng cấu hình `GRADER_CONCURRENCY` (mặc định 2).
  - Quản lý ngân sách bộ nhớ container bằng `GRADER_MEMORY_BUDGET_MB` (mặc định 400 MB).
- **Quy tắc phân bổ và điều phối ngân sách:**
  1. Nếu bài nộp yêu cầu `memoryLimitMb > GRADER_MEMORY_BUDGET_MB` → Trả về **HTTP 400 Bad Request** ngay lập tức.
  2. Hàng đợi theo dõi tổng bộ nhớ của các job đang chạy (`activeMemoryMb`). Khi chuẩn bị dispatch job tiếp theo:
     - Nếu `activeCount >= GRADER_CONCURRENCY`: Chờ.
     - Nếu `activeCount > 0` và `activeMemoryMb + nextJob.memoryLimitMb > GRADER_MEMORY_BUDGET_MB`: Giữ job trong hàng đợi chờ các job đang chạy hoàn tất (tránh OOM container).
     - Ví dụ: Với budget 400MB và 2 job `memoryLimitMb: 256MB` gửi cùng lúc, job 1 chạy trước, job 2 phải chờ job 1 kết thúc (chạy tuần tự). Trong khi đó, 2 job `memoryLimitMb: 64MB` sẽ chạy song song theo `GRADER_CONCURRENCY`.
- Đo lường và giám sát:
  - `GET /health` trả về `200 OK` kèm `{ status: "ok", queueLength, activeJobs, activeMemoryMb, memoryBudgetMb }`.
- Callback HTTP có cơ chế thử lại (Retry with Backoff):
  - Khi hoàn thành chấm, grader gửi kết quả về `callbackUrl` kèm header `X-Grader-Secret`.
  - Tự động thử lại tối đa 3 lần với exponential backoff nếu mạng hoặc server tạm thời lỗi.

---

## 5. Phục hồi khi Grader Gặp sự cố (`decideRecovery`)

Hàm thuần `decideRecovery(submission, now)` trong `@cppdsa/shared` thực hiện quy tắc phục hồi cho Backend API:
- Kiểm tra các bài nộp ở trạng thái `PENDING` hoặc `RUNNING`.
- Nếu thời gian trôi qua ≤ 2 phút: Không can thiệp (`NONE`), chờ grader hoàn tất.
- Nếu thời gian trôi qua > 2 phút (nghi vấn worker bị restart/chết):
  - Nếu `retryCount < 2`: Gửi lại job (`RETRY`, tăng `retryCount`).
  - Nếu `retryCount >= 2`: Đánh dấu lỗi hệ thống (`MARK_SYSTEM_ERROR`), không để bài nộp bị kẹt vô hạn.

---

## 6. Cấu hình Biến môi trường

| Tên biến | Mặc định | Mô tả |
|---|---|---|
| `PORT` | `4100` | Cổng HTTP lắng nghe của dịch vụ Grader |
| `HOST` | `0.0.0.0` | Địa chỉ IP bind dịch vụ |
| `GRADER_SECRET` | *(Bắt buộc)* | Secret token dùng xác thực HTTP giữa API và Grader |
| `GRADER_CONCURRENCY`| `2` | Số lượng job chấm đồng thời tối đa |
| `GRADER_MEMORY_BUDGET_MB` | `400` | Ngân sách bộ nhớ tối đa cho các job đồng thời (MB) |
| `SANDBOX_UID_BASE` | `2000000000` | UID khởi đầu cho pool sandbox dải cao |
| `SANDBOX_UID_COUNT` | `8` | Số lượng UID trong pool |
| `LAUNCHER_PATH` | `/usr/local/bin/launcher` | Đường dẫn file thực thi sandbox launcher |
| `COMPILE_TIMEOUT_MS`| `10000` | Hạn chót tối đa cho một lần biên dịch g++ (ms) |
| `MAX_OUTPUT_BYTES` | `262144` (256 KB) | Giới hạn dung lượng stdout tối đa trước khi ngắt OLE |
