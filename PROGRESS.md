# PROGRESS

PHASE: DEV
CURRENT_PHASE: P9 (chờ người dùng duyệt)

## Quyết định
- 2026-10-31: tạo project từ template ai-workflow.

## Nhật ký

- 2026-10-31: git init (branch main, .gitignore, .gitattributes); PROJECT_PLAN v3 theo ủy quyền người dùng.
- 2026-10-31: PROJECT_PLAN v4 — chốt free mode; DB đổi sang Azure PostgreSQL B1MS (free 12 tháng); Render chỉ dùng free; repo Hatsu-Phat/CppDSA đã push.
- 2026-10-31: PROJECT_PLAN v5 — hosting đổi sang 1 Azure VM B2ats v2 (thay Vercel + Render); chờ xác nhận phí IP public.
- 2026-10-31: người dùng chốt hosting Vercel + Render (bỏ phương án VM); PROJECT_PLAN v6 hoàn chỉnh chờ duyệt.
- 2026-10-31: người dùng duyệt roadmap v6. Tiếp theo: P0 (AGENTS.md, T-0000).
- 2026-10-31: P0 — AGENTS.md đã điền; git/GitHub xong; tạo task T-0000 (P0) và T-0001 (P1). Chờ người dùng chạy T-0000 (phiên Claude chạy trên cloud, không gọi được agy). PHASE giữ SETUP tới khi T-0000 PASS.
- 2026-10-31: người dùng duyệt roadmap, chuyển PHASE sang DEV và bắt đầu P1 (T-0000/P0 chưa chạy, người dùng cho bỏ qua cổng). Host không có node/g++ → người dùng chọn chạy kiểm chứng trong Docker `node:22-bookworm` (Node 22.23.4, g++ 12.2.0). Giao T-0001 cho agy trên branch `task/T-0001`.
- 2026-11-01: T-0001 (P1) PASS sau 3 vòng (v1: test free-mode đa nghiệm + thiếu `[CẦN XÁC MINH]`; v2: còn "90 ngày", "2 job"; v3: đạt). Bàn giao: docs/REQUIREMENTS, ARCHITECTURE, DECISIONS, DATA_MODEL, docs/examples, tests/p1. Merge `task/T-0001` → main. Chờ người dùng duyệt P1 (hợp đồng chấm hai mode) trước khi sang P2/P3. T-0000 (P0) vẫn chưa chạy.
- 2026-11-01: kiểm tra T-0000: không thấy kết quả từ Claude desktop. Chạy lại 2 lần, đều bị hủy vì quyền headless (read_file ngoài workspace). Tiêu chí P0 3–6 đạt, 1–2 chưa. Xem TEST_REPORT.
- 2026-11-01: T-0000 chạy lại sau khi thêm quyền read_file → exit=0, SUCCESS; P0 PASS (6/6 tiêu chí). P1 đã PASS kỹ thuật, chờ người dùng duyệt.
- 2026-11-01: accept-phase P1 → FAIL do test: check-docs để lọt 6/6 mutation, độ phủ MVP chưa tự động hóa; run-examples ổn (lọt 1: test hardcode). Tài liệu đúng nội dung. Giao T-0002 trên branch `task/T-0002`.
- 2026-11-01: T-0002 PASS (checker bắt 17/17 mutation độc lập). P1 PASS kỹ thuật, chờ người dùng duyệt (hợp đồng chấm hai mode) trước khi mở P2/P3. Merge `task/T-0002` → main.
- 2026-11-01: người dùng duyệt P1 (gồm hợp đồng chấm hai mode). Bắt đầu P2. Chia 2 task: T-0003 spike sandbox local trong Docker không privileged (tiêu chí 1–4, 6, 8; 5 ở local); T-0004 (sau T-0003 PASS) thử trên Render free + bench (tiêu chí 5, 7) — cần người dùng cho phép deploy.
- 2026-11-01: người dùng cấp quyền tự động 6 giờ (tự giao task, kiểm thử, sang phase khi không còn lỗi). T-0003 vòng 1 FAIL (probe độc lập: runner treo bởi setsid, crash bởi stderr flood, CE lộ secret do biên dịch bằng root, đọc được expected, ghi file ngoài). Giao vòng 2.
- 2026-11-01: T-0003 PASS (vòng 3). P2 PASS phần local; tiêu chí 5, 7 (Render) → T-0004 chờ connector Render (phiên song song) + push. Theo ủy quyền tự động, bắt đầu P3 (T-0005). Quyết định kỹ thuật P3 (Fastify, Vitest, ESLint+Prettier, node-pg-migrate, postgres:16 [CẦN XÁC MINH major Azure]) ghi trong T-0005.
- 2026-11-01: P3 PASS (T-0005). Ghi chú vận hành: chạy agy qua bash (scratchpad/run-agy.sh, cùng prompt/model run-task.ps1) vì PowerShell thoát sớm khi agy ghi stderr; npm luôn chạy trong bản sao repo trong container (symlink NTFS). Tiếp: T-0004 (Render spike) + P4.

## Điểm dừng 2026-11-01 (người dùng yêu cầu tạm dừng)
- Nhánh hiện tại: `task/T-0006`. `main` local đã gồm P0–P3; CHƯA push được `main` lên GitHub (token thiếu scope `workflow` vì có `.github/workflows/ci.yml`) → CHỜ NGƯỜI DÙNG cấp scope.
- P2: PASS local (T-0003). Render (T-0004 vòng 1, service `cppdsa-spike` srv-dbj88mh42hec73c9nbug, free, singapore, nhánh `task/T-0004` đã push): env-probe OK, cold start 13.37 s; FAIL ở bench (EAGAIN do RLIMIT_NPROC uid 10001) và run-suite (OOM 512Mi). Việc tiếp: giao T-0004 vòng 2 với phản hồi soạn sẵn `handoff/tasks/T-0004-r2-feedback.md` (dán vào mục "Phản hồi vòng trước" của T-0004 trên nhánh `task/T-0004`, đổi Vòng 2/3), push, nhờ phiên deploy-helper trigger_deploy, đo lại bằng `spike/p2/remote-check.mjs` (SPIKE_SECRET xem trong Render dashboard → Environment).
- P3: PASS (T-0005), đã merge vào `main` local.
- P4: T-0006 vòng 1 agy báo DONE (commit trên `task/T-0006`), Claude CHƯA nghiệm thu. Việc tiếp: accept-phase P4 — chạy 4 lệnh kiểm chứng trong T-0006, probe độc lập (gian lận, đồng thời, lộ test ẩn, grader chết, `--memory 512m`), kiểm agy có áp dụng phần "BỔ SUNG từ số đo Render" (SANDBOX_UID_BASE, GRADER_MEMORY_BUDGET_MB) không.
- Sau đó: P5 → P8 tự động; dừng trước P9.
- Cách chạy agy: `bash handoff/run-agy.sh T-XXXX <timeout>` (không dùng run-task.ps1 — PowerShell thoát sớm khi agy ghi stderr). npm luôn chạy trong bản sao repo trong container (symlink lỗi trên mount NTFS). Agy hay bị hủy nếu dùng `Get-ChildItem`/`Get-Content`… → mỗi task phải ghi cấm rõ.

- 2026-11-01: P4 PASS (T-0006 vòng 2; vòng 1 FAIL: env không rỗng, compileMessage 2005 ký tự, ghi được home/`/dev/shm`, thiếu SANDBOX_UID_BASE/GRADER_MEMORY_BUDGET_MB). Merge `task/T-0006` → main. Tiếp: T-0004 vòng 2 (Render) và P5 (T-0007).
- 2026-11-01: P5 PASS (T-0007 vòng 2; vòng 1 FAIL: import không trả mật khẩu tạm, lệch index 0/1-based giữa grader và API, test deadline tautology, thiếu test biên). Merge `task/T-0007` → main. T-0004 vòng 2 trên Render: hết OOM/EAGAIN, bench đạt (độ lệch 1.56%, CPU/wall 0.148), run-suite 16/38 do CPU 0.15 → T-0004 vòng 3. SPIKE_SECRET của `cppdsa-spike` đã được Claude đặt lại (giá trị chỉ ở scratchpad phiên).
- 2026-11-01: T-0004 vòng 3 (cuối): local 0 FAIL kể cả --cpus 0.15; Render: biên dịch bits/stdc++ 15.7 s, bench độ lệch 3.35%, run-suite không hoàn tất trong 5 phút. Dừng T-0004 (hết 3 vòng), báo người dùng: Render free khó đạt p95 ≤ 10 s; xử lý ở P8 hoặc đổi nơi chạy grader.
- 2026-11-01: P6 PASS (T-0008 vòng 1; lượt agy bị ngắt do thiếu RAM, không có báo cáo bàn giao — Claude tự chạy lệnh 1, 2 và probe, đều đạt). Merge `task/T-0008` → main. Tiếp: P7 (T-0009).
- 2026-11-01: P7 PASS (T-0009 vòng 2; vòng 1 FAIL: E2E chạm rate limit 6 lần/phút do dùng 1 sinh viên, lượt agy bị ngắt không có báo cáo). Merge `task/T-0009` → main. Tiếp: P8 (T-0010).

## Điểm dừng 2026-11-01 (P8 dở dang)
- Nhánh `task/T-0010`; `main` local đã gồm P0–P7 (P7 PASS, merge fe779ee). Vẫn CHƯA push `main` (token thiếu scope `workflow`).
- T-0010 (P8): vòng 1 bị hủy (agy chạy `dir`); vòng 2 FAIL (PCH làm CE mọi `#include <iostream>` không ở dòng đầu, 6 ca tấn công không chạy thật, lộ token `/etc/passwd`, không có test mới, throughput tính sai, cấu hình lệch — chi tiết TEST_REPORT). Vòng 3: lượt 1 bị hủy sau 278 s (lệnh nhiều dòng ngoài allow-list); lượt 2 bị Claude Code dừng vì máy thiếu RAM — CHƯA có kết quả vòng 3. Mã vòng 1–3 nằm chưa commit trong working tree; `handoff/reports/T-0010.md` vẫn là báo cáo vòng 2.
- Việc tiếp: khi người dùng cho phép, chạy lại `bash handoff/run-agy.sh T-0010 240m` (phản hồi vòng 3 đã ghi trong task) → nghiệm thu. Dừng trước P9.
- 2026-11-01 (sau): người dùng cho chạy lại vòng 3 → lượt bị Claude Code dừng lần nữa vì thiếu RAM (vmmemWSL chiếm phần lớn bộ nhớ; còn ~0.4–0.9 GB trống). Agy đã xong lệnh 1–2 (grading 58/58 theo báo cáo agy, Claude CHƯA kiểm), đang ở lệnh 3–5. Compose đã down -v. Chờ người dùng xử lý RAM rồi chạy lại.

## Điểm dừng 2026-11-01 (P8 xong, dừng trước P9)
- P8 PASS (T-0010 vòng 3; các lượt 3–5 bị hủy vì `docker ps` không đối số, `$env:X=...;` trước lệnh docker, lỗi đọc script khi ổ H: mất mount). Merge `task/T-0010` → main (--no-ff). `main` local gồm P0–P8, CHƯA push (token thiếu scope `workflow`).
- Số đo Claude (local, grader 0.15 CPU/512 MB): A 20 bài đồng thời p50 26.3 s / p95 48.4 s (✘ ngưỡng 10 s); không giới hạn CPU p95 7.2 s; B (số agy) p95 9.07 s. Local lạc quan hơn Render ~1.5–2×.
- Docker Desktop mất mount ổ H: (`mkdir /run/desktop/mnt/host/h: file exists`) — khởi động lại Docker Desktop để sửa; tạm thời chạy lệnh bằng `tar -cf - . | docker run -i ...`.
- Việc mở cho P9: `.env.example` chưa được Claude kiểm (bị chặn đọc `.env*`) — người dùng xem có `ENABLE_PCH`, `COMPILE_TIMEOUT_MS`, `COMPILE_CPU_LIMIT_S`, `GRADER_WALL_FACTOR` chưa; `GET /jobs/:id/metrics` của grader chưa có xác thực + Map không giới hạn; quyết định p95 burst (chấp nhận / grader nơi khác nhiều CPU hơn).
- Chờ người dùng: cấp scope `workflow` cho token GitHub, tài khoản/tài nguyên Azure PostgreSQL, Render, Vercel; duyệt bắt đầu P9.
