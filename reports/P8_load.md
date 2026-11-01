# Báo cáo Kiểm thử Tải Grader & API (P8 Load Testing & Performance)

- **Ngày thực hiện**: 2026-11-01
- **Môi trường đo**: Docker Compose throttled (`tests/load/docker-compose.load.yml`), mô phỏng Render free tier:
  - Grader: `cpus: 0.15`, `mem_limit: 512m`
  - API: `mem_limit: 512m`
  - Database: PostgreSQL 16
- **Test suite**: `tests/load/load-test.mjs`
- **Mục tiêu SLA**: Thời gian từ lúc nộp đến khi hoàn thành chấm `p95 <= 10s` cho 20 người nộp đồng thời (Scenario A) và lớp 50 sinh viên nộp rải rác (Scenario B).

---

## 1. Bảng Tổng hợp Kết quả Load Test

| Chỉ số | Kịch bản A (20 nộp đồng thời) | Kịch bản B (Lớp 50 SV, 100 bài nộp) | Ghi chú & Đánh giá SLA |
|---|:---:|:---:|---|
| **Số bài nộp (Total)** | 20 | 100 | Đạt 100% chỉ tiêu kịch bản |
| **Số bài hoàn thành (COMPLETED)** | 20 (100%) | 100 (100%) | Không có bài nào bị kẹt |
| **Lỗi hệ thống (SYSTEM_ERROR)** | 0 (0%) | 0 (0%) | Hệ thống ổn định tuyệt đối |
| **Số bài mất mát (Lost Submissions)** | **0** | **0** | **0 bài mất (Yêu cầu bắt buộc = 0)** |
| **Độ trễ p50 (Median)** | **6,151 ms** (6.15 s) | **1,014 ms** (1.01 s) | Phản hồi nhanh chóng |
| **Độ trễ p95** | **10,187 ms** (10.19 s) | **2,026 ms** (2.03 s) | Kịch bản B đạt SLA; A suýt soát mục tiêu |
| **Độ trễ tối đa (Max Latency)** | 11,193 ms (11.19 s) | 2,056 ms (2.06 s) | Hàng đợi tiêu tán triệt để |
| **Độ trễ trung bình (Avg)** | 6,196 ms (6.20 s) | 1,131 ms (1.13 s) | Thời gian xử lý ổn định |
| **Throughput (Bài/phút)** | 107.2 bài/phút | 2,918.3 bài/phút | Thông lượng xử lý cao |
| **Mục tiêu p95 <= 10s** | **EXCEEDED (10.19 s > 10.0 s)** | **PASS (2.03 s <= 10.0 s)** | Kịch bản A vượt ngưỡng 187ms do giới hạn CPU 0.15 |
| **Số kết nối PostgreSQL (Peak)** | 7 kết nối | 7 kết nối | Nằm sâu trong giới hạn B1MS (max 50) |

---

## 2. Đo đạc Tác động của Precompiled Header (PCH) trên CPU 0.15

Thực nghiệm đo thời gian biên dịch trên container Grader với giới hạn `--cpus 0.15 --memory 512m`:

| Thư viện C++ | Không dùng PCH | Có dùng PCH (`/usr/local/include/cppdsa_pch`) | Tăng tốc (Speedup) |
|---|:---:|:---:|:---:|
| `#include <bits/stdc++.h>` | **6,992 ms** | **1,498 ms** | **4.67x** nhanh hơn |
| `#include <iostream>` | **1,400 ms** | **391 ms** | **3.58x** nhanh hơn |

### Nhận xét & Đánh giá:
- **Tầm quan trọng của PCH**: Nếu không có PCH, một bài nộp chứa `bits/stdc++.h` mất gần 7 giây chỉ riêng cho bước `g++`. Khi 20 bài nộp tới cùng lúc, tổng thời gian biên dịch nối tiếp sẽ lên tới 140 giây (p95 > 60 giây). Với PCH, thời gian biên dịch chỉ còn ~1.5 giây, giúp p95 của Scenario A đạt 10.19 giây (chỉ vượt ngưỡng 187ms so với tiêu chuẩn 10 giây).
- **Tính ổn định**: Việc precompile cả `iostream.gch` bên cạnh `bits/stdc++.h.gch` loại bỏ hiện tượng CFS CPU starvation jitter trong các bài kiểm tra song song (`TC-MEM-BUDGET`, `TC-CONC-20`), đưa tỷ lệ pass suite test grading lên 100% (50/50 test cases).

---

## 3. Tiêu thụ Tài nguyên Hệ thống (Container Stats & Cgroup)

Ảnh chụp thực tế từ `docker compose stats --no-stream`:

### Lúc chạy Kịch bản A (20 concurrent submissions):
```text
CONTAINER ID   NAME              CPU %     MEM USAGE / LIMIT     MEM %     NET I/O           BLOCK I/O         PIDS
8dabf6e3474c   cppdsa-web-1      0.00%     49MiB / 7.607GiB      0.63%     1.33kB / 126B     0B / 4.1kB        23
c5e90cef46db   cppdsa-api-1      1.73%     47.96MiB / 512MiB     9.37%     1.54MB / 481kB    0B / 8.19kB       24
59f36c5b9242   cppdsa-db-1       5.52%     44.88MiB / 7.607GiB   0.58%     346kB / 1.44MB    0B / 54.8MB       11
a0c1e659a968   cppdsa-grader-1   14.31%    30.16MiB / 512MiB     5.89%     31.6kB / 19.6kB   2.42MB / 53.2kB   13
```
- **Grader CPU**: Đạt 14.31% (chạm trần mức giới hạn 15.0% của 0.15 CPU).
- **Grader RAM**: Tiêu thụ đỉnh 30.5 MiB / 512 MiB (chỉ chiếm 5.96% bộ nhớ), hoàn toàn an toàn trước nguy cơ OOM kill trên Render free tier (512MB).
- **API RAM**: 48-51 MiB / 512 MiB (< 10% bộ nhớ).
- **PostgreSQL**: 40-45 MiB, CPU peak 5.5%.

---

## 4. Cấu hình Chốt Đề xuất cho Render Free Tier

Dựa trên các số đo thực nghiệm ở trên, cấu hình tối ưu được chốt cho Render free tier (`cpus: 0.15`, `memory: 512m`):

| Biến môi trường | Giá trị chốt | Căn cứ thực nghiệm |
|---|:---:|---|
| `GRADER_CONCURRENCY` | **2** | Ở 0.15 CPU, chạy 2 jobs song song cho phép gối đầu I/O và CPU giữa compile và test run. Concurrency = 2 duy trì throughput cao mà không gây OOM. |
| `GRADER_WALL_FACTOR` | **10** | Dưới CPU throttled CFS 0.15 CPU, wall clock time có thể gấp ~6.8 lần CPU time. Hệ số 10x đảm bảo bài nộp tính toán nặng CPU 0.8s vẫn hoàn thành kịp trong wall clock mà không bị ngắt oan. |
| `COMPILE_TIMEOUT_MS` | **15000** | Trên môi trường 0.15 CPU, các bài nộp lớn hoặc lỗi cú pháp có thể tốn 5-8s biên dịch. Mức 15s vừa an toàn vừa tránh treo worker lâu. |
| `COMPILE_CPU_LIMIT_S` | **10** | Giới hạn CPU time tối đa cho tiến trình `g++`, ngăn compile bomb template đệ quy sâu. |
| `GRADER_MEMORY_BUDGET_MB` | **384** | Container có 512MB RAM, dành 128MB cho Node.js runtime/OS và 384MB cho các job chạy đồng thời (mỗi job 128-256MB). |
| `ENABLE_PCH` | **true** | Bắt buộc bật trên môi trường Render để rút ngắn 4.7x thời gian biên dịch `bits/stdc++.h`. |
| `GLOBAL_RATE_LIMIT_MAX` | **300** | Giới hạn 300 req/phút/IP trên toàn bộ API, ngăn chặn cạn kiệt tài nguyên từ crawler/bot. |
