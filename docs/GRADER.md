# Đặc tả Dịch vụ Chấm bài (Grader Service Specification)

Tài liệu đặc tả hợp đồng dữ liệu, cơ chế sandbox, hàng đợi và bảo mật của dịch vụ chấm bài `src/grader` trong hệ thống CppDSA.

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
- `compileMessage`: Giới hạn tối đa 2000 ký tự, loại bỏ các đường dẫn thư mục tạm (`/tmp/run_*`), thay bằng tên logic (`solution.cpp`, `template.cpp`), loại bỏ mọi chuỗi bí mật/secret.
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

Kế thừa trực tiếp các biện pháp an ninh đã kiểm chứng độc lập tại Spike P2:

1. **Launcher C chuyên dụng (`/usr/local/bin/launcher`):**
   - Biên dịch bằng `gcc -O2` liên kết `libseccomp`.
   - Hạ quyền (drop privileges) hoàn toàn về UID/GID không đặc quyền của sandbox (`target_uid` / `target_gid`).
   - Thiết lập `prctl(PR_SET_NO_NEW_PRIVS, 1)` ngăn con chiếm đặc quyền.
   - Thiết lập `prctl(PR_SET_CHILD_SUBREAPER, 1)` để thu gom tiến trình mồ côi.
2. **Bộ lọc Seccomp chặn mạng:**
   - Chặn toàn bộ syscall mạng (`socket`, `connect`, `bind`, `listen`, `accept`, `sendto`, `recvfrom`, `sendmsg`, `recvmsg`, `sendmmsg`, `recvmmsg`) với mã lỗi `EPERM`.
3. **Giới hạn tài nguyên phần cứng (Resource Limits via `rlimit`):**
   - `RLIMIT_CPU`: Giới hạn thời gian CPU (dừng bằng SIGXCPU).
   - `RLIMIT_AS` & `RLIMIT_DATA`: Giới hạn không gian bộ nhớ (mặc định 256 MB hoặc theo job).
   - `RLIMIT_FSIZE`: Giới hạn kích thước file tạo ra (50 MB khi compile, 10 MB khi run).
   - `RLIMIT_NPROC`: Giới hạn tối đa tiến trình (20 tiến trình khi chạy, 50 khi biên dịch) chặn triệt để fork bomb.
   - `RLIMIT_CORE`: Tắt core dump (0 bytes).
4. **Môi trường thực thi rỗng (Clean Environment):**
   - Biến môi trường của tiến trình sinh viên chỉ gồm `PATH`, `HOME`, `TMPDIR`, `LANG`.
   - Tuyệt đối không truyền `GRADER_SECRET` hay credential hệ thống vào tiến trình sinh viên.
   - Grader không đọc hay giữ `DATABASE_URL`.
5. **Cách ly thư mục và Pool UID:**
   - Mỗi job được cấp phát một UID riêng biệt từ pool (`10001` đến `10008`).
   - Mỗi job chạy trong thư mục tạm độc lập `/tmp/run_<submissionId>_<timestamp>` với quyền `0700` thuộc sở hữu của UID đó.
   - Thư mục ứng dụng `/app` được thiết lập quyền `0700` thuộc sở hữu `root:root`. Người dùng sandbox hoàn toàn không thể đọc thư mục `/app` hay file hệ thống nhạy cảm.
   - Sau mỗi test case và khi kết thúc job: Grader quét `/proc` và gửi `SIGKILL` tiêu diệt toàn bộ tiến trình thuộc UID của job đó, sau đó xóa sạch thư mục tạm.

---

## 4. Hàng đợi In-Memory và Xử lý Đồng thời

- Quản lý hàng đợi bộ nhớ trong tiến trình Node.js:
  - Giới hạn xử lý song song bằng cấu hình `GRADER_CONCURRENCY` (mặc định 2).
  - Khi số job đang chạy đạt giới hạn, các job mới được giữ an toàn trong hàng đợi.
- Đo lường và giám sát:
  - `GET /health` trả về `200 OK` kèm `{ status: "ok", queueLength: number, activeJobs: number }`.
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
| `SANDBOX_UID_START` | `10001` | UID khởi đầu cho pool sandbox |
| `SANDBOX_UID_COUNT` | `8` | Số lượng UID trong pool |
| `LAUNCHER_PATH` | `/usr/local/bin/launcher` | Đường dẫn file thực thi sandbox launcher |
| `COMPILE_TIMEOUT_MS`| `10000` | Hạn chót tối đa cho một lần biên dịch g++ (ms) |
| `MAX_OUTPUT_BYTES` | `262144` (256 KB) | Giới hạn dung lượng stdout tối đa trước khi ngắt OLE |
