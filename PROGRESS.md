# PROGRESS

PHASE: DEV
CURRENT_PHASE: P4

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

