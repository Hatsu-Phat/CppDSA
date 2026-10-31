# Điều phối Claude → Antigravity

## Trạng thái xác minh (2026-10-31)
- **Đã xác minh trên máy bạn:** `agy --version` = 1.4.12; `agy models` có `gemini-3.8-flash-high|medium|low` (cùng `claude-sonnet-4-6`, `claude-opus-4-6-thinking`, `gpt-oss-120b-medium`). Dùng mặc định `gemini-3.8-flash-high`. Slug đã gồm mức effort → không thêm `--effort`.
- **Dựa trên nguồn bên thứ ba, chưa đối chiếu với 1.4.12:** các cờ `-p`, `--model`, `--output-format json`, `--print-timeout` (cheat sheet cho 1.2.4; tài liệu pi-agy-suite cho ≤1.1.22). Khi chạy headless, lệnh ghi bị tự động từ chối nếu chưa cho phép trong `permissions.allow`.
- **Chưa biết:** chế độ `-p` có nạp `AGENTS.md`/`GEMINI.md` (cả bản toàn cục) hay không; cú pháp quyền `command(...)`/`write_file(...)` còn đúng ở 1.4.12 không (changelog có nhắc cảnh báo di trú quyền cũ ở 1.2.2 và chế độ Auto ở 1.3.5).
→ Kiểm chứng bằng task `T-0000` (xem dưới).

## Gọi một task (shell nào cũng chạy được)
Từ thư mục gốc project:
```
powershell -NoProfile -File $HOME\ai-workflow\run-task.ps1 -Task T-0001 [-Model gemini-3.8-flash-medium] [-Timeout 30m]
```
Script chạy `agy -p` (mỗi lần là phiên mới, không kế thừa hội thoại cũ), lưu JSON vào `handoff/reports/<Task>.run.json`, và chỉ in **một dòng**: `RUN task=… exit=… status=… report_exists=…`. Có lỗi thì in thêm 20 dòng cuối stderr. `status=SUCCESS` nghĩa là agy chạy xong, không có nghĩa task đạt: Claude vẫn review.
- Chạy ở nền để Claude nhận thông báo khi kết thúc, không poll.
- Lần lỗi vẫn có thể tốn hạn mức → không tự thử lại quá 3 vòng.
- Chạy trên branch/worktree riêng; Claude review diff rồi mới merge.

## Chu trình
Task (Claude, `handoff/tasks/T-XXXX.md`) → `run-task.ps1` → báo cáo (`handoff/reports/T-XXXX.md`) → Claude review + kiểm thử → TEST_REPORT/PROGRESS. Tối đa 3 vòng/task.

## T-0000: kiểm chứng toàn chuỗi (không đụng code)
`handoff/tasks/T-0000.md` yêu cầu agy chỉ ghi một báo cáo nêu: các file quy tắc nó nhận được, tên model, và việc ghi vào `handoff/reports/` có được phép không. Chạy:
```
powershell -NoProfile -File $HOME\ai-workflow\run-task.ps1 -Task T-0000
```
Kết quả cho biết cờ nào hoạt động, rules có được nạp không, allowlist có hiệu lực không.
