# AGENTS.md — CppDSA (chỉ phần riêng của project; quy tắc chung nằm ở ~/.claude/CLAUDE.md và ~/.gemini/GEMINI.md)

Mục tiêu: ứng dụng web chấm bài thực hành C++ (môn Cấu trúc dữ liệu và Giải thuật) cho giảng viên và sinh viên; frontend Vercel, API + grader Render, database Azure PostgreSQL. Kế hoạch: PROJECT_PLAN.md.
Giai đoạn: xem dòng `PHASE:` trong PROGRESS.md (SETUP/DEV). Chỉ code khi PHASE = DEV.

## Cấu trúc
`src/` code · `tests/` · `configs/` · `reports/` kết quả thực nghiệm · `literature/` tóm tắt paper đã xác minh
`handoff/tasks/` Claude→Antigravity · `handoff/reports/` Antigravity→Claude · `docs/` hướng dẫn

## Không đụng vào
`data/` (nếu xuất hiện), `.git/`, `.claude/`, file secret `.env*`. Không có repo baseline.

## Ngôn ngữ
Tài liệu: tiếng Việt. Code, tên biến, commit: tiếng Anh.
