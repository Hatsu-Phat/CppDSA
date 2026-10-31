# TEST_REPORT

## Quy trình
1. Mỗi task: Claude tự chạy lại lệnh kiểm chứng (không dựa vào báo cáo của Antigravity).
2. Ghi một khối theo mẫu dưới đây, output nguyên văn (lỗi + 20 dòng cuối).
3. Kết luận PASS/FAIL dựa trên tiêu chí nghiệm thu của task. Không có kết quả → `CHƯA CHẠY`.

## Mẫu một mục
### T-XXXX — <tiêu đề> — <YYYY-MM-DD>
- Môi trường: python / torch / CUDA / commit
- Lệnh:
- Kết quả (nguyên văn):
- Tiêu chí: 1 ✔/✘ …
- Kết luận: PASS | FAIL
- Việc tiếp theo:

## Mẫu nghiệm thu một phase
### Phase Pn — <YYYY-MM-DD>
- Tiêu chí: 1 ✔/✘ (lệnh + output thật) …
- Đánh giá test do agy viết: <đủ/thiếu gì>
- Kết luận: PASS | FAIL → task sửa T-XXXX

## Nhật ký kiểm thử
### T-0001 vòng 1 — P1 đặc tả + hợp đồng chấm — 2026-11-01
- Môi trường: Docker `node:22-bookworm` (Node v22.23.4, g++ 12.2.0); branch `task/T-0001`.
- Lệnh (Claude chạy lại): `node tests/p1/check-docs.mjs` → exit=0 (17 US, 16 D-xx); `--self-test` → exit=0 (4/4 fixture); `node tests/p1/run-examples.mjs` → exit=0 (6/6 ca PASS).
- Kiểm thử độc lập thêm: lời giải brute-force đúng (`scratchpad/brute.cpp`) + `adapter.cpp`: test1 `0 1` = expected; test2 ra `0 4`, expected `1 3` → chấm WA sai (test có 2 đáp án hợp lệ).
- Tiêu chí: 1 ✔ · 2 ✔ · 3 ✔ (lệnh) nhưng hợp đồng free-mode sai · 4 ✘ (0 tag `[CẦN XÁC MINH]` trong 4 docs; "1 vCore, 2 GB RAM" không có trong PROJECT_PLAN; công nghệ chưa chốt ghi như quyết định).
- Kết luận: FAIL → phản hồi ghi trong T-0001 (vòng 2/3).

### T-0001 vòng 2 — 2026-11-01
- Lệnh (Claude chạy lại, Docker `node:22-bookworm`): check-docs → exit=0 (17 US, 16 D-xx, 14 tag `[CẦN XÁC MINH`); `--self-test` → exit=0 (5/5 fixture, thêm missing-verify-tag); run-examples → exit=0 (8/8 ca, thêm Free Mode Alt brute-force AC).
- Review: test2 đổi thành `2 3 5 7 11`/10 → đơn nghiệm (chỉ 3+7); 7 điểm chưa xác minh (a–g) đã có tag; bỏ "1 vCore, 2 GB RAM"; công nghệ ngoài plan gắn `[ĐỀ XUẤT]`.
- Rà số liệu ngoài PROJECT_PLAN: còn "Render PostgreSQL Free bị xóa sau 90 ngày" (khẳng định chưa xác minh); "tối đa 2 job" thiếu "đề xuất, chỉnh theo P2/P8".
- Kết luận: FAIL (nhỏ) → vòng 3/3.

### T-0001 vòng 3 — 2026-11-01
- Lệnh (Claude chạy lại, Docker `node:22-bookworm`): check-docs → exit=0 (17 US, 16 D-xx, 14 tag `[CẦN XÁC MINH`); `--self-test` → exit=0 (5/5); run-examples → exit=0 (8/8 ca PASS).
- Review diff: bỏ "90 ngày"; "tối đa 2 job" → "đề xuất 2, chỉnh theo số đo P2/P8" ở REQUIREMENTS/ARCHITECTURE/DECISIONS. Chỉ sửa trong Allowed files.
- Ghi chú: lần chạy vòng 3 đầu bị hủy do agy dùng `Select-String` (ngoài allowlist), không có thay đổi; chạy lại cùng vòng.
- Kết luận: PASS.

### Phase P1 — 2026-11-01
- Tiêu chí PROJECT_PLAN §9 P1:
  1. 0 mục `[CHƯA CHỐT]` thuộc MVP ✔ (check-docs).
  2. Mọi user story có tiêu chí chấp nhận kiểm thử được ✔ (17/17 US có AC-US-xx-n).
  3. Lựa chọn DB/chi phí/networking được ghi nhận ✔ (D-01, D-02, D-04; 7 điểm chưa xác minh gắn `[CẦN XÁC MINH]`).
  4. Hợp đồng test template + free mode: có ví dụ biên dịch/chạy được, gồm ca CE/WA và lời giải thuật toán khác ✔ — chờ người dùng duyệt.
  5. Ngưỡng kiểm thử tải chốt ✔ (D-15, theo PROJECT_PLAN).
  6. Rà chéo: mọi US ánh xạ ≥ 1 phase P2–P10 ✔ (bảng truy vết, check-docs).
  7. Người dùng duyệt: CHƯA.
- Đánh giá test do agy viết: checker có self-test 5 fixture lỗi; run-examples phủ AC/CE/WA cả hai mode. Thiếu: không kiểm TLE/RE (thuộc P2/P4).
- Còn mở (không chặn P1): 7 điểm `[CẦN XÁC MINH]` cần người dùng/thực nghiệm (ngày free Azure, region/outbound IP Render, giới hạn kết nối B1MS, Vercel Hobby, GitHub Actions, rewrite cookie); P0/T-0000 chưa chạy.
- Kết luận: PASS kỹ thuật (3 vòng) → chờ người dùng duyệt để sang P2/P3.

### T-0000 / Phase P0 — 2026-11-01
- Không tìm thấy kết quả T-0000 của CppDSA từ phiên Claude desktop: không có `handoff/reports/T-0000.md` ở local, trên `origin` (chỉ có commit 99b1dec), hay trong log agy (2 phiên T-0000 trong log đều thuộc `H:\lab\AIVDetection`).
- Claude chạy lại T-0000 hai lần trên máy này: đều bị hủy vì quyền headless (lần 1 dùng `Get-Content`; lần 2 cần `read_file` cho `~/.gemini/GEMINI.md` ngoài workspace). Trước khi bị hủy, agy đã chạy được `git status --short` và `git rev-parse`.
- Tiêu chí P0: (1) agy chạy headless model `gemini-3.8-flash-high` exit=0 ✔ (thấy qua T-0001 vòng 2–3: `RUN ... exit=0 status=SUCCESS report_exists=True`) nhưng `run-task -Task T-0000` ✘; (2) báo cáo model và file quy tắc nạp vào: CHƯA CÓ; (3) AGENTS.md có 0 `<điền>` ✔; (4) remote `origin` = github.com/Hatsu-Phat/CppDSA, `git status` sạch ✔ (main local đi trước origin, chưa push); (5) `git check-ignore .env data/` ra cả hai ✔; (6) `docker version` server 29.8.1 ✔.
- Kết luận: P0 CHƯA PASS đầy đủ (thiếu 1–2) → cần thêm quyền `read_file` cho `~/.gemini/GEMINI.md`, hoặc người dùng chấp nhận ghi "không xác định được".

