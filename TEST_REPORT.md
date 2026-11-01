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

### T-0000 vòng 2 (chạy lại sau khi người dùng thêm quyền read_file) — 2026-11-01
- Lệnh: `run-task.ps1 -Task T-0000` → `RUN task=T-0000 model=gemini-3.8-flash-high exit=0 status=SUCCESS report_exists=True`.
- Đối chiếu: báo cáo nêu model "Gemini 3.8 Flash (High)"; dòng đầu trích của AGENTS.md, GEMINI.md, ~/.gemini/GEMINI.md khớp với `head -1` do Claude chạy; `git status --short` chỉ có `handoff/reports/T-0000.md` (+ stderr rỗng do harness ghi, đã xóa); branch `main`.
- Tiêu chí P0: 1 ✔ · 2 ✔ · 3 ✔ · 4 ✔ · 5 ✔ · 6 ✔.
- Kết luận: P0 PASS.

### Phase P1 — nghiệm thu (accept-phase) — 2026-11-01
- Môi trường: Docker `node:22-bookworm` (Node v22.23.4, g++ 12.2.0), commit `44ad5dd` (main).
- Phạm vi: `git diff 99b1dec..HEAD` chỉ chạm docs P1, `docs/examples/`, `tests/p1/`, handoff, file quản lý; không có file ngoài phạm vi, `src/` trống.
- Lệnh kiểm chứng (Claude chạy lại): check-docs exit=0; `--self-test` exit=0 (5/5); run-examples exit=0 (8/8).
- Tiêu chí PROJECT_PLAN §9 P1:
  1. 0 mục `[CHƯA CHỐT]` thuộc MVP ✔ (grep `CHƯA CHỐT` trong 4 docs: 0 dòng).
  2. Mọi user story có AC kiểm thử được ✔ (17 US; kiểm tay US-15/16/17 khớp PROJECT_PLAN 4.3: verdict từng test, không lộ dữ liệu, điểm cao nhất trước deadline, nộp trễ không tính điểm).
  3. DB/chi phí/networking ghi nhận ✔ (D-01, D-02, D-04; 7 điểm `[CẦN XÁC MINH]`).
  4. Hợp đồng test hai mode ✔ về kỹ thuật (ví dụ chạy được, có CE/WA/lời giải thay thế); chờ người dùng duyệt.
  5. Ngưỡng tải ✔ (REQUIREMENTS §6, D-15: 20 người đồng thời, lớp 50, p95 ≤ 10 s khi grader đã thức — đúng PROJECT_PLAN).
  6. Kế hoạch kiểm thử "rà chéo mọi yêu cầu MVP → tiêu chí P2–P10": ✘ chưa được tự động hóa; checker chỉ kiểm US đã khai báo, không kiểm độ phủ so với PROJECT_PLAN.
  7. Người dùng duyệt: CHƯA.
- Đánh giá test do agy viết (mutation trên bản sao trong scratchpad, script `mutate_docs.py`, `mutate_examples.py`):
  - `check-docs.mjs`: 0/6 mutation bị bắt (đều exit 0): m1 `[CHƯA CHỐT: TL]`; m2 xóa trọn US-17; m3 xóa D-09; m4 AC-US-01 đặt sai mục; m5 `Nguồn: TODO`; m6 cột phase = P1, "P2" chỉ trong văn bản. Bản đối chứng exit 0. → Checker chỉ kiểm định dạng, không kiểm được yêu cầu.
  - `run-examples.mjs`: 5/5 mutation sai bị bắt (exit 1): template sai, free hợp lệ thay bằng WA, CE biên dịch được, expected đổi, WA thành đúng. Lọt 1: thêm test3 (expected sai) vẫn exit 0 vì danh sách test hardcode. Bản đối chứng exit 0.
- Kết luận: FAIL (test chưa đủ để chứng minh tiêu chí; tài liệu không phát hiện lỗi nội dung) → T-0002 (làm chặt checker + độ phủ MVP + self-test mutation). Ghi chú: P1 đã dùng 3 vòng ở T-0001; người dùng yêu cầu rõ giao task sửa khi FAIL.

### T-0002 — làm chặt checker P1 — 2026-11-01
- Lệnh (Claude chạy lại, Docker `node:22-bookworm`): check-docs → exit=0 (17 US, 24 yêu cầu MVP ánh xạ, 15 chủ đề quyết định, 16 D-xx, 14 tag); `--self-test` → exit=0 (11 fixture lỗi bị bắt + `valid` PASS); run-examples → exit=0 (8/8); run-examples `--self-test` → exit=0 (6/6 mutation bị phát hiện, bản gốc PASS).
- Mutation độc lập của Claude (scratchpad, không dùng fixture của agy):
  - Bộ cũ `mutate_docs.py`: 6/6 exit=1 (trước T-0002: 0/6); đối chứng exit=0.
  - Bộ mới agy chưa thấy `mutate_docs2.py`: xóa US-09; xóa dòng R-01; AC US-03 rỗng; đổi tên heading D-13 (CI); `chưa chốt` chữ thường → 5/5 exit=1 với thông báo đúng luật; đối chứng exit=0.
  - `mutate_examples.py`: 6/6 exit=1 (gồm test3 trước đây lọt); đối chứng exit=0.
- `mvp-requirements.json`: 24 mục, mọi `text` trùng nguyên văn PROJECT_PLAN (R-17, R-19 chỉ khác backtick/tag); hosting/DB/CI được kiểm qua `requiredDecisionTopics`. Không phủ riêng stack TypeScript/Next.js (không chặn).
- Phạm vi: chỉ chạm `tests/p1/**`, `docs/REQUIREMENTS.md` (chỉ thêm 33 dòng, 0 dòng xóa), báo cáo.
- Kết luận: PASS.

### Phase P1 — nghiệm thu lại — 2026-11-01
- Tiêu chí 1–3, 5 ✔ (như mục trước); 4 hợp đồng chấm hai mode ✔ kỹ thuật; 6 rà chéo MVP ✔ nay tự động (24 R-xx → US → phase P2–P10, có mutation chứng minh); 7 người dùng duyệt: CHƯA.
- Đánh giá test: checker và runner bắt được 17/17 mutation độc lập, không báo lỗi bản đúng.
- Kết luận: PASS kỹ thuật → chờ người dùng duyệt để mở P2/P3.

### T-0003 vòng 1 — P2 spike sandbox local — 2026-11-01
- Môi trường: Docker Desktop 29.8.1; image `cppdsa-spike` (node:22-bookworm + g++ + libseccomp); branch `task/T-0003`.
- Lệnh (Claude chạy lại): `docker build -t cppdsa-spike spike/p2` OK; `docker run --rm cppdsa-spike node run-suite.mjs` → exit=0, 27/27 PASS (AC/WA/CE/RE mỗi loại 3–4; TLE cpu 1064 ms, sleep 1063 ms; MLE; fork bomb→TLE; worker recovery PASS); `node bench.mjs` → 10 lần, mean 256.70 ms, SD 9.26 ms, (max−min)/mean 9.74%.
- Probe độc lập (`handoff/tasks/T-0003-probes/`, chạy `--memory 1g`):
  - q1 đọc `/app/cases/*/expected.txt` + `/app/run-suite.mjs`: LEAK (WA).
  - q3 ghi `/home/sandbox`, `/var/tmp`, `/run/lock`, `/var/lock`: LEAK (WA).
  - q4 cháu `setsid()` giữ pipe: runner TREO > 10 phút (phải `docker kill`).
  - q4b+q5 tiến trình sandbox sống sót sau bài nộp: LEAK (WA).
  - q6 800 MB ra stderr: runner chết `ERR_STRING_TOO_LONG`.
  - q7 đọc `/proc/1/environ`, `/proc/<ppid>/environ`: SAFE (AC).
  - q8 16 tiến trình × 200–300 MB: TLE thay vì MLE; worker sống.
  - c1 `#include "/app/hidden_tests/secret.txt"`: g++ chạy bằng root → thông báo CE chứa `super_secret_hidden_flag_12345`.
- Đánh giá test agy: ca tấn công chỉ kiểm file mồi được bảo vệ riêng, không kiểm expected thật, thoát process group, stderr, bước biên dịch → test không chứng minh tiêu chí 4, 8.
- Tiêu chí P2 (local): 1 ✔ · 2 ✔ · 3 ✔ (q8 lệch verdict, nhẹ) · 4 ✘ (q3, q4, q6, c1) · 5 ✔ local, Render CHƯA · 6 ✘ (runner treo/chết) · 7 CHƯA (Render) · 8 ✘ (q1, c1).
- Kết luận: FAIL → T-0003 vòng 2/3.

### T-0003 vòng 2–3 — 2026-11-01
- Vòng 2: agy bị ngắt 2 lần ("root agent idle; waiting … background task" — lệnh >10 s bị đẩy nền); Claude tự build và chạy lại trên trạng thái file của agy.
  - `docker build -t cppdsa-spike spike/p2` OK; `docker run --rm cppdsa-spike node run-suite.mjs` → exit=0, 38/38 PASS, 15131 ms (tự kết thúc, không treo).
  - Probe gốc của Claude (bản scratchpad, không phải bản agy chép), `--memory 1g`: q1, q3, q4 (setsid gốc), q4b, q5, q6, q7 → SAFE/AC; q8 → TLE (nhẹ, chấp nhận).
  - Probe mới chưa đưa cho agy: tiến trình respawn đổi PID liên tục + kiểm tiến trình sống sót → SAFE; CE `#include` expected thật + secret → CE, thông báo không chứa secret/expected.
  - `node bench.mjs` (Claude): mean 254.20 ms, SD 8.70 ms (3.42%), (max−min)/mean 9.44%.
- Vòng 3 (chỉ báo cáo): `reports/P2_spike.md` cập nhật; Claude tính lại thống kê bench từ 10 lần đo liệt kê trong báo cáo: mean 256.70, SD 11.25, (max−min)/mean 12.08% — khớp số báo cáo. Không sửa code.
- Kết luận T-0003: PASS.

### Phase P2 — nghiệm thu (accept-phase) — 2026-11-01
- Tiêu chí PROJECT_PLAN §9 P2:
  1. ≥ 12 chương trình AC/WA/CE/RE phân loại đúng 100% ✔ (13 ca thường, 3 mỗi loại + RE exit code; 38/38).
  2. Vòng lặp vô hạn dừng ≤ TL + 0,5 s, TLE ✔ (cpu ~1064 ms, sleep ~1063 ms, TL 1000 ms).
  3. Vượt ML → MLE, worker sống ✔ (ca đơn tiến trình); rủi ro: đa tiến trình → TLE (ghi trong báo cáo).
  4. Fork bomb, ghi ngoài, mạng, output khổng lồ bị chặn ✔ (sau vòng 2; kiểm cả hiệu ứng thật bằng probe độc lập).
  5. Container không privileged ✔ local (`docker run --rm` mặc định); Render thật: CHƯA (T-0004).
  6. Giới hạn tài nguyên áp dụng được ✔ trên Docker Desktop; trên Render: CHƯA (T-0004).
  7. Bench 10 lần + cold start trên Render free: CHƯA (T-0004); local đã đo (9.44–12.08% < 20%).
  8. Không đọc được expected, không giả được kết quả, cả hai mode ✔ (q1, c1, ca cheat template/free, ca spoof).
- Đánh giá test agy: vòng 1 không đủ (chỉ kiểm file mồi); vòng 2 đã gồm probe độc lập và hậu kiểm hiệu ứng thật; Claude thêm 3 probe chưa thấy đều SAFE → test đủ cho phạm vi local.
- Kết luận: PASS phần local (1–4, 6 local, 8). Tiêu chí 5, 7 (Render) chuyển T-0004, chờ phiên có connector Render + push GitHub. Theo ủy quyền tự động của người dùng, chuyển sang P3 (không phụ thuộc kết quả Render); nếu T-0004 FAIL theo PROJECT_PLAN 3.3 thì dừng và báo người dùng.

### T-0005 / Phase P3 — khung monorepo, compose, CI — 2026-11-01
- Môi trường: Docker 29.8.1, `node:22-bookworm`, `postgres:16`; commit `cbfe933` (task/T-0005).
- Sự cố chạy agy: `run-task.ps1` thoát sớm (PowerShell coi dòng stderr "root agent idle…" là lỗi) trong khi agy vẫn chạy; một lần agy bị hủy do `Get-ChildItem`; một lần mắc lỗi symlink `npm install` trên mount NTFS. Xử lý: Claude chạy agy trực tiếp từ bash, đổi lệnh kiểm chứng sang chép repo vào filesystem container.
- Lệnh Claude chạy lại:
  - Bản sao trong container: `npm ci` OK; `npm run lint` exit=0; `format:check` exit=0 ("All matched files use Prettier code style!"); `build` exit=0; `npm test` exit=0 — shared 6, api 2, grader 1, web 2 test PASS.
  - `git clone` sạch nhánh task/T-0005 → chuỗi ci+lint+format+build+test: exit=0.
  - `docker compose up -d --build` exit=0; 4 service running (db healthy); `GET :4000/health` 200 `{"status":"ok","db":"ok"}`; `:4100/health` 200; `:3000/` 200; `:3000/api/health` 200; port bind 127.0.0.1.
  - Migration: bảng users/classrooms/assignments/pgmigrations sau up tự động; `migrate:down` → còn 1 bảng; `migrate:up` lại OK. Dừng db → api `/health` 503 `{"status":"error","db":"error"}`. `docker compose down -v` OK.
  - CI YAML hợp lệ: on push/PR; checkout, setup-node 22 (cache npm), npm ci, lint, format:check, build, test.
  - `.gitignore` phủ node_modules/.next/dist ở mọi cấp; không thấy secret cứng (chỉ mặc định postgres local).
- Mutation: cài `return undefinedVar` → build api exit=2 (TS2552); đổi status health → test api exit=1. Biến không dùng chỉ là warning của ESLint → lint exit 0 (điểm nhỏ: nên `--max-warnings=0`).
- Tiêu chí P3: (1) một lệnh khởi động toàn bộ ✔; (2) health 200 ✔; (3) build+lint+test pass từ clone sạch, mỗi phần ≥ 1 test ✔; làm lại theo DEV_SETUP ✔. CI trên GitHub: kiểm sau khi push.
- Kết luận: PASS.

### T-0004 vòng 1 — spike trên Render free thật — 2026-11-01
- Local (Claude chạy lại, nhánh task/T-0004 commit 48231d0): `docker build` OK; `run-suite.mjs` 38/38; `server-selftest.mjs` 8/8 (health; 401 thiếu/sai secret; 503 khi không đặt secret; 409 khi chạy đồng thời; run-suite failed=0; bench exit 0); secret so sánh `timingSafeEqual`, không endpoint nào nhận code/lệnh từ client.
- Render (service `cppdsa-spike`, srv-dbj88mh42hec73c9nbug, free, singapore, nhánh task/T-0004; tạo qua phiên deploy-helper):
  - `/env-probe`: kernel 6.8.0-1057-aws; uid 0; CapEff 0x400cb; NoNewPrivs=1; Seccomp=0 (chưa filter); cgroup memory.max 536870912 (512 MiB); `setuid`/`setrlimit`/`seccomp_load` trong launcher: ok cả ba. Metrics Render: cpu_limit 0.15 CPU.
  - `/health` (service đang thức): 305 ms, sau đó 0.13–0.29 s.
  - `/run-suite`: kết nối đứt; Render event `server_failed` 00:18:18Z `oomKilled memoryLimit 512Mi`, tự restart 00:18:22Z → bộ ca đa tiến trình/MLE làm OOM cả container.
  - `/bench`: exitCode 1, `execve failed: Resource temporarily unavailable` (status 127) ngay lần 1 → RLIMIT_NPROC của uid sandbox 10001 trên Render bị vượt ngay (số tiến trình theo uid có thể tính chung ngoài container) [CẦN XÁC MINH nguyên nhân chính xác].
- Đánh giá tiêu chí P2: 5 (không privileged trên Render) ✔ — sandbox áp dụng được setuid/rlimit/seccomp; 6 (giới hạn tài nguyên chấp nhận được) ✘ hiện tại — OOM container và NPROC; 7 (bench 10 lần + cold start) CHƯA — bench không chạy được.
- Kết luận: FAIL → T-0004 vòng 2 (uid sandbox cấu hình được dải cao; ngân sách bộ nhớ để không OOM container; đo lại bench + cold start). Đã chuyển các ràng buộc sang thiết kế P4 (T-0006). Lưu ý TL: 0.15 CPU → thời gian chạy trên Render có thể chậm hơn local nhiều lần; cần số đo bench.
- Cold start Render (2026-11-01, sau > 15 phút không có request): `GET /health` 200 sau 13.37 s; request kế tiếp `uptimeMs` 12672, 0.18 s → instance vừa được đánh thức. Tiêu chí 7 (cold start) ✔ đo được; bench còn chờ T-0004 vòng 2.
