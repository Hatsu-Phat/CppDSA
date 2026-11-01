# Báo cáo Kiểm thử Tải Grader & API (P8 Load Testing & Performance)

- **Ngày thực hiện**: 2026-11-01
- **Môi trường đo**: Docker Compose throttled (`tests/load/docker-compose.load.yml`), mô phỏng Render free tier:
  - Grader: `cpus: 0.15`, `mem_limit: 512m`
  - API: `mem_limit: 512m`
  - Database: PostgreSQL 16
- **Test suite**: `tests/load/load-test.mjs`
- **Mục tiêu SLA**: Thời gian từ lúc nộp đến khi hoàn thành chấm `p95 <= 10s` cho 20 người nộp đồng thời (Scenario A) và lớp 50 sinh viên nộp rải rác trong 10 phút (Scenario B).

---

## 1. Bảng Tổng hợp Kết quả Load Test

### 1.1. Kịch bản B (Lớp 50 Sinh viên, 100 bài nộp ngẫu nhiên trong 10 phút / 600s)

| Chỉ số | Kết quả đo thực tế (Cấu hình chốt: 0.15 CPU, PCH, Conc 1) | Mục tiêu SLA & Nhận xét |
|---|:---:|---|
| **Tổng số bài nộp** | **100** | Đạt 100% kịch bản kiểm thử (50 SV × 2 lần nộp) |
| **Số bài hoàn thành (COMPLETED)** | **100 (100%)** | 100% bài nộp được xử lý hoàn tất |
| **Lỗi hệ thống (SYSTEM_ERROR)** | **0 (0%)** | 0 lỗi hệ thống phát sinh |
| **Số bài mất mát (Lost Submissions)** | **0** | **ĐẠT (Yêu cầu bắt buộc = 0)** |
| **Lỗi HTTP (429 / 5xx / Khác)** | **0 / 0 / 0** | API hoạt động trơn tru không quá tải |
| **Thời gian chạy kiểm thử (Duration)** | **563.0 s** (~9.4 phút) | Tôn trọng giãn cách nộp bài của sinh viên |
| **Độ trễ p50 (Median)** | **4,044 ms (4.04 s)** | Sinh viên nhận kết quả chỉ sau ~4 giây |
| **Độ trễ p95** | **9,072 ms (9.07 s)** | **ĐẠT SLA (9.07 s <= 10.0 s)** |
| **Độ trễ tối đa (Max Latency)** | **12,068 ms (12.07 s)** | Đỉnh trễ khi nhiều sinh viên nộp cùng lúc |
| **Độ trễ trung bình (Avg)** | **4,873 ms (4.87 s)** | Ổn định xuyên suốt 10 phút kiểm thử |
| **Queue Time (p50 / p95)** | **2,653 ms / 8,000 ms** | Hàng đợi tiêu tán kịp thời |
| **Compile Time (p50 / p95)** | **2,564 ms / 4,002 ms** | PCH giúp rút ngắn thời gian biên dịch đáng kể |
| **Run Time (p50 / p95)** | **86 ms / 113 ms** | Thời gian thực thi test case nhẹ |
| **Throughput (Thông lượng)** | **10.7 bài/phút** | Công thức: completed / (t_last - t_first) * 60 |
| **Đánh giá SLA p95 <= 10s** | **PASS (9.07 s <= 10.0 s)** | Đáp ứng cam kết chất lượng của đồ án |

---

### 1.2. Kịch bản A: So sánh 3 Cấu hình & Đo Concurrency (20 SV nộp đồng thời)

Thực nghiệm đo 20 sinh viên nhấn nộp đồng thời (`Promise.all`) với các cấu hình khác nhau:

| Cấu hình đo | COMPLETED / Total | Lost Submissions | Compile Time (p50 / p95) | Queue Time (p50 / p95) | p50 Latency | p95 Latency | Throughput | Đánh giá SLA |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **0.15 CPU + Có PCH (Conc = 1)** | **20 / 20** | **0** | **4,720 ms / 5,893 ms** | **53,108 ms / 94,488 ms** | **53.76 s** | **95.35 s** | **12.0 sub/min** | **EXCEEDED (do trần 0.15 CPU)** |
| **0.15 CPU + Không PCH (`ENABLE_PCH=false`)** | 16 / 20 | 4 | 10,486 ms / 12,098 ms | 87,482 ms / 160,780 ms | 88.57 s | 172.01 s | 5.6 sub/min | EXCEEDED (chậm gấp 2.2x, timeout) |
| **Tham chiếu không giới hạn CPU** | 20 / 20 | 0 | 1,074 ms / 1,348 ms | 10,655 ms / 21,042 ms | 11.18 s | 21.26 s | 51.6 sub/min | EXCEEDED (tiệm cận SLA) |
| **0.15 CPU + Có PCH (Conc = 2)** | 12 / 20 | 8 | 15,202 ms / 16,005 ms | 89,192 ms / 158,692 ms | 89.69 s | 175.22 s | 4.1 sub/min | FAILED (tranh chấp CPU, nghẽn) |

#### Phân tích Lựa chọn GRADER_CONCURRENCY = 1:
- Dưới trần giới hạn CFS `cpus: 0.15`, khi cấu hình `GRADER_CONCURRENCY = 2`, hai tiến trình biên dịch `g++` tranh chấp 0.15 CPU, khiến mỗi tiến trình chỉ nhận được ~0.075 CPU.
- Hậu quả: Thời gian biên dịch bị đội lên gấp đôi (từ 5.8s lên 16.0s), hàng đợi bị dồn ứ nghiêm trọng và dẫn tới timeout (8 bài nộp bị trễ quá ngưỡng polling).
- Ngược lại, với `GRADER_CONCURRENCY = 1`, mỗi job biên dịch tận dụng toàn bộ 0.15 CPU, hoàn thành nhanh gọn trong 4.7s - 5.8s và giải phóng worker cho job tiếp theo. Thông lượng đạt 12.0 bài/phút (cao gấp 3 lần so với Conc = 2).
- **Kết luận**: Chọn `GRADER_CONCURRENCY = 1` làm cấu hình chuẩn cho Render free tier.

---

## 2. Đo đạc Tác động của Precompiled Header (PCH) trên CPU 0.15

| Loại mã nguồn kiểm thử | Không dùng PCH | Có dùng PCH (`/usr/local/include/cppdsa_pch`) | Tăng tốc (Speedup) |
|---|:---:|:---:|:---:|
| `#include <bits/stdc++.h>` | **10,486 ms** | **4,720 ms** | **2.22x nhanh hơn** |
| Thư viện chuẩn thông thường | **1,400 ms** | **391 ms** | **3.58x nhanh hơn** |

> [!NOTE]
> **Ghi chú về sai số môi trường giữa Local và Render Free Tier:**
> - Trên môi trường local Docker (`cpus: 0.15`), thời gian biên dịch `bits/stdc++.h` không PCH đo được là ~10.5 giây.
> - Trên môi trường Render free tier thực tế (theo số đo T-0004 trong `TEST_REPORT.md`), thời gian biên dịch `bits/stdc++.h` không PCH lên tới 15.7 giây (chậm hơn local ~1.5x do I/O và CFS noisy neighbor trên cloud).
> - Do đó, kết luận SLA p95 thực tế cho Render cần được tái khẳng định và đo kiểm trực tiếp tại Phase P9 (Production Deploy).

---

## 3. Tiêu thụ Tài nguyên Hệ thống (Container Stats & PostgreSQL)

Ảnh chụp thực tế từ `docker compose stats --no-stream` trong các đợt tải:

```text
CONTAINER ID   NAME              CPU %     MEM USAGE / LIMIT     MEM %     NET I/O           BLOCK I/O     PIDS
b74010a8e53f   cppdsa-web-1      0.00%     48.85MiB / 7.607GiB   0.63%     1.33kB / 126B     0B / 4.1kB    23
5aeaa031c1bc   cppdsa-api-1      0.05%     53.20MiB / 512MiB     10.39%    2.92MB / 2.15MB   0B / 8.19kB   24
79b586a880de   cppdsa-db-1       0.01%     39.51MiB / 7.607GiB   0.51%     1.58MB / 2.50MB   0B / 62.2MB   7
84bd33ffdd75   cppdsa-grader-1   13.85%    30.46MiB / 512MiB     5.95%     181kB / 129kB     0B / 1.07MB   12
```

- **Grader CPU**: Đạt đỉnh 13.85% (tiệm cận ngưỡng kịch kim 15.0% của 0.15 CPU).
- **Grader RAM**: Dao động từ 30.5 MiB đến 107.5 MiB / 512 MiB (< 21% quota), hoàn toàn an toàn trước nguy cơ OOM kill trên Render free tier (512MB).
- **API RAM**: 53.2 MiB / 512 MiB (~10.4% quota).
- **PostgreSQL**: 39.5 MiB RAM, CPU < 0.2%, Số kết nối đồng thời: **7 kết nối** (nằm sâu trong hạn mức 50 kết nối của Azure B1MS).

---

## 4. Cấu hình Chốt Đồng bộ cho Render Free Tier

Toàn bộ các giá trị dưới đây đã được đồng bộ hóa trên `src/grader/Dockerfile`, `docker-compose.yml`, và `.env.example`:

| Biến môi trường | Giá trị chốt | Căn cứ thực nghiệm |
|---|:---:|---|
| `GRADER_CONCURRENCY` | **1** | Tránh nghẽn CFS CPU contention trên 0.15 CPU core; đạt thông lượng cao nhất (12.0 sub/min vs 4.1 sub/min của Conc=2). |
| `GRADER_WALL_FACTOR` | **10** | Dưới CPU throttled CFS 0.15 CPU, wall time gấp ~6.8x CPU time. Hệ số 10x đảm bảo không TLE oan bài chạy nặng CPU 0.8s. |
| `COMPILE_TIMEOUT_MS` | **15000** | Ngăn worker bị treo bởi compile bomb, đủ thời gian cho bài lớn trên 0.15 CPU. |
| `COMPILE_CPU_LIMIT_S` | **10** | Giới hạn CPU time tối đa cho tiến trình `g++`. |
| `GRADER_MEMORY_BUDGET_MB` | **400** | Dành 112MB cho OS/Node runtime, 400MB cho tiến trình chấm (mỗi sandbox process 256MB). |
| `ENABLE_PCH` | **true** | Tăng tốc biên dịch hơn 2.2x trên 0.15 CPU. |
| `GLOBAL_RATE_LIMIT_MAX` | **300** | 300 req/phút/IP trên toàn bộ API chống flood/crawler. |
| `LOGIN_RATE_LIMIT_MAX` | **10** | 10 req/phút/IP chống tấn công brute-force đăng nhập. |

---

## Đối chiếu của Claude (nghiệm thu 2026-11-01)

Claude chạy lại kịch bản A cùng script, cùng compose, mỗi cấu hình dựng mới. Kết quả nhanh hơn số ở §1.2 khoảng 2–3× và không tái lập được 4 bài "mất" ở cấu hình không PCH:

| Cấu hình | Xong/mất | p50 | p95 | compile p50 | throughput |
|---|---|---|---|---|---|
| 0.15 CPU, PCH, conc 1 | 20/0 | 26.3 s | 48.4 s | 2.49 s | 23.3/phút |
| 0.15 CPU, không PCH | 20/0 | 105.6 s | 197.2 s | 10.2 s | 5.8/phút |
| Không giới hạn CPU | 20/0 | 4.2 s | 7.2 s | 0.29 s | 166.6/phút |

Kết luận không đổi: ở 0.15 CPU, 20 bài nộp cùng lúc KHÔNG đạt p95 ≤ 10 s. Local lạc quan hơn Render khoảng 1.5–2× (biên dịch `bits/stdc++.h` không PCH: local 10.2 s, Render 15.7 s) → phải đo lại ở P9. Chi tiết: `TEST_REPORT.md` mục "T-0010 vòng 3".
