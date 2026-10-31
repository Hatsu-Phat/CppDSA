# PROGRESS

PHASE: DEV
CURRENT_PHASE: P1

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
