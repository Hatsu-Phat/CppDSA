# PROGRESS

PHASE: DEV
CURRENT_PHASE: P2

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
