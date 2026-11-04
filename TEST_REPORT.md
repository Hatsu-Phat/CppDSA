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

### T-0006 vòng 1 / Phase P4 — nghiệm thu (accept-phase) — 2026-11-01
- Claude chạy lại (nhánh task/T-0006, commit 988cb6d; Docker 29.8.1):
  - Lệnh 1 (npm ci/lint/format/build/test trong node:22-bookworm): exit 0; shared 25 test, api 2, grader 5, web 2 pass. (Lần chạy đầu với `npm ci >/dev/null` exit 1, log trống; chạy lại không chặn output thì exit 0 — chưa tái hiện được.)
  - Lệnh 2 `docker build`: exit 0. Lệnh 3 `test:grading`: exit 0, `Summary: 44/44 cases PASSED` (41 ca + đồng thời 20 job + recovery có SIGKILL + leak-check). Chạy lại với `--memory 512m`: 44/44.
  - Lệnh 4 compose: grader `Up (healthy)`, db healthy; `down -v` exit 0.
- Probe độc lập (scratchpad/probe.mjs, probe2.mjs; grader container `--memory 512m`, gửi job qua HTTP thật):
  - ✔ Quét toàn bộ FS (trừ /proc/self,/sys,/dev) tìm expected ẩn của chính job và job song song: không tìm thấy (WA).
  - ✔ Callback không chứa input/expected/actual; log grader không chứa marker (0 dòng).
  - ✘ Env tiến trình sinh viên KHÔNG rỗng: có `PATH`, `HOME`, `LANG`, ≥ 3 biến (tiêu chí 8).
  - ✘ `compileMessage` dài 2005 ký tự (> 2000) với 300 lỗi undefined symbol (tiêu chí 6). Không lộ đường dẫn/secret ✔.
  - ✘ Code sinh viên ghi được `/home/sandbox10001/` (home của uid sandbox, tồn tại qua các job, uid được tái dùng) và `/dev/shm` → kênh lưu dữ liệu giữa các submission/đầy đĩa. `/tmp`, `/var/tmp`, `../`, `/run/lock` bị chặn ✔.
  - ✘ Phần BỔ SUNG từ số đo Render chưa làm: không có `SANDBOX_UID_BASE` (uid vẫn 10001..10008 — đúng uid gây EAGAIN trên Render) và không có `GRADER_MEMORY_BUDGET_MB`; 2 job ML 256 gửi cùng lúc kết thúc cách nhau 2 ms (chạy song song, kỳ vọng tuần tự).
- Tiêu chí P4: (1) bộ chuẩn ≥30 ca đúng 100% ✔; (2) test công khai không trong job ✔ (hợp đồng không có trường); (3) không lộ test ẩn ✔; (4) grader chết không kẹt ✔ (recovery SIGKILL); (5) 20 đồng thời không lẫn ✔; (6) ✘ 2005 ký tự; (7) gian lận không AC ✔ (11 ca + probe); (8) ✘ env không rỗng (credential DB: grader không đọc DATABASE_URL ✔).
- Kết luận: FAIL → T-0006 vòng 2.

### T-0006 vòng 2 / Phase P4 — nghiệm thu lại — 2026-11-01
- Claude chạy lại: lệnh 1 exit 0 (shared 25, api 2, grader 6, web 2 test); lệnh 2 build exit 0; lệnh 3 `Summary: 50/50 cases PASSED` (thêm TC-42..45, TC-UID-BASE, TC-MEM-BUDGET); lệnh 3b `--memory 512m` 50/50; lệnh 4 compose: grader/db healthy, down exit 0.
- Probe độc lập (container `--memory 512m`): quét FS tìm expected ẩn của job mình + job song song → không thấy ✔; env sinh viên 0 biến (PATH/HOME không có) ✔; `compileMessage` 300 lỗi → đúng 2000 ký tự, không đường dẫn/secret ✔; callback không chứa input/expected/actual ✔; ghi `/home/*/x`, `/dev/shm`, `/tmp`, `/var/tmp`, `../`, `/run/lock`, `/home` → đều bị chặn ✔; `getuid()` ≥ 2000000000 ✔; 2 job ML 256 với budget 400 kết thúc cách nhau 2528 ms (tuần tự) ✔; job ML > budget → 400 (app.ts) ✔.
- Tiêu chí P4 1–8: ✔ cả 8.
- Ghi chú: agy không cập nhật `handoff/reports/T-0006.md` cho vòng 2 (vẫn nội dung vòng 1) — lỗi quy trình, không ảnh hưởng sản phẩm; kết quả trên do Claude tự chạy. `/dev/shm` được chặn bằng `chmod 755` trong entrypoint (cần container chạy root — đúng trên Render theo env-probe).
- Kết luận: PASS.

### T-0004 vòng 2 — spike trên Render free thật — 2026-11-01
- Local (Claude, commit 479b0c0, `--memory 512m`): build exit 0; `run-suite.mjs` exit 0, 0 FAIL (ca nhiều tiến trình bị hạ ML 256→96 MB, NPROC 20→4 theo budget 384); `server-selftest.mjs` exit 0; `bench.mjs` exit 0.
- Render (push `task/T-0004`, deploy dep-dbjab3h2tl4s73ecteug live 02:36:57Z; Claude đặt SPIKE_SECRET mới ngẫu nhiên qua Render API; `remote-check.mjs` từ node:22 container):
  - `/health` 200 trong 1375 ms (service đang thức, uptimeMs 285546 → KHÔNG phải số đo cold start; cold start giữ số đo vòng 1: 13.37 s).
  - `/env-probe`: kernel 7.0.0-1009-aws; cgroup 512 MiB; uid 0; CapEff 0x400cb; sandbox uid 2000000000; setuid/setrlimit/seccomp_load ok; fork 5 tiến trình con ok → lỗi EAGAIN vòng 1 đã hết ✔.
  - `/run-suite`: server KHÔNG bị OOM (trả 200 sau 151 s) ✔ nhưng exitCode 1, 16 pass / 22 fail. Nhóm lỗi: (a) 14 ca CE với message rỗng sau ~5.5–6.7 s → biên dịch quá thời hạn ở 0.15 CPU; (b) 7 ca "Surviving sandbox processes detected" (PID 152,160… tồn tại qua nhiều ca liên tiếp) sau TLE/fork; (c) q4_escape_setsid, q6_stderr_flood → TLE thay vì AC (deadline wall quá chặt ở 0.15 CPU); q5_check_survivors → WA.
  - `/bench` exitCode 0: 10 lần wall mean 2128.80 ms, StdDev 33.11 ms (1.56%), spread 4.18%; CPU time mean 314.10 ms; tỉ lệ CPU/wall 0.148 (local cùng chương trình: wall ~248 ms, CPU ~239 ms, tỉ lệ 0.95).
- Đánh giá tiêu chí P2: 5 ✔; 7 ✔ (độ lệch 1.56% ≤ 20%; cold start 13.37 s từ vòng 1); 6 ✘ một phần — giới hạn bộ nhớ/tiến trình đã ổn, nhưng thời gian biên dịch và hạn chót wall chưa phù hợp CPU 0.15, và còn tiến trình sandbox sống sót.
- Hệ quả thiết kế (chuyển P8 tiêu chí 7, ghi vào grader): trên Render free, wall ≈ 6.8 × CPU time → TL phải tính theo CPU time (rusage/RLIMIT_CPU), hạn chót wall = hệ số × TL; thời hạn biên dịch phải ≥ vài chục giây; thông lượng chấm sẽ thấp (ước lượng cần đo ở P8).
- Kết luận: FAIL → T-0004 vòng 3 (vòng cuối).
- Bổ sung (Claude, 2026-11-01): grader P4 (main f83d8e1) chạy `docker run --rm --memory 512m --cpus 0.15 cppdsa-grader npm run test:grading` → `Summary: 49/50`, chỉ TC-MEM-BUDGET (kiểm theo thời gian) FAIL. Dữ liệu đầu vào cho P8 tiêu chí 7.

### T-0007 vòng 1 / Phase P5 — nghiệm thu (accept-phase) — 2026-11-01
- Claude chạy lại (nhánh task/T-0007, chưa commit của agy): lệnh 1 exit 0 (api: 18 pass, 47 integration skipped do không có DB — đúng thiết kế); lệnh 2 (compose `db` + `TEST_DATABASE_URL`, `npm test -w @cppdsa/api`) exit 0, `Tests 65 passed (65)`, 0 skipped; lệnh 3 compose: api/db/grader healthy, migration chạy khi khởi động api.
- Probe E2E độc lập (scratchpad/e2e5.mjs; api + grader + postgres THẬT trong compose, giảng viên seed bằng `seed:lecturer`):
  - ✔ must_change_password → 403; tạo lớp/bài template/test ẩn; sinh viên không thấy chuỗi đánh dấu test ẩn ở 6 endpoint GET; sinh viên gọi 5 endpoint giảng viên → 403; nộp đúng → COMPLETED score 1.00; nộp sai → 0.25; CE → compileOutput 1299 ký tự, không đường dẫn; SV2 đọc submission SV1 → 403; vùng thừa → 400; callback thiếu/sai secret → 401/401; CSV điểm đúng; warmup `{"db":"ok","grader":"ok"}`.
  - ✘ Import CSV tạo tài khoản với mật khẩu tạm nhưng response chỉ có `{"successCount":2,"errorCount":0,"errors":[]}` → giảng viên không biết mật khẩu, sinh viên không đăng nhập được (AC-US-01-1).
  - ✘ Lệch chỉ số kết quả từng test: grader gửi `tests[].index` bắt đầu từ 0 (`src/grader/src/executor.ts:134`), API (`src/api/src/routes/internal.ts:81`) hiểu là 1-based → DB: submission 4 test ẩn chỉ lưu 3 dòng `submission_test_results` (passed_tests 4/4 nhưng n_results 3), verdict test i bị gán cho test i-1. Integration test dùng mock gửi index 1-based nên không phát hiện.
- Đánh giá test: test deadline (`integration.test.ts:929`) tự INSERT `is_late` bằng SQL → không kiểm logic tính trễ của API (gần tautology). Thiếu test biên: mã sinh viên đúng 65536 byte được nhận (chỉ có test > 65536), 50/51 hidden tests, CSV 500/501 dòng, rate limit 429.
- Tiêu chí P5: (1) endpoint có integration test ✔ (65 test, có kiểm openapi coverage); (2) phân quyền âm tính ✔ (probe xác nhận); (3) giới hạn kích thước ✘ thiếu test biên một số giới hạn; (4) deadline/max-score ✘ test không kiểm logic API; (5) credential chỉ ở backend ✔ (chưa thấy vi phạm; test quét có sẵn). Thêm 2 lỗi chức năng ở trên.
- Kết luận: FAIL → T-0007 vòng 2.

### T-0007 vòng 2 / Phase P5 — nghiệm thu lại — 2026-11-01
- Claude chạy lại: lệnh 1 exit 0 (api 18 pass, 52 integration skipped khi không có DB); lệnh 2 (compose db) `Tests 70 passed (70)`, 0 skipped; compose: api/db/grader healthy.
- Test mới đã có và kiểm đúng điều cần kiểm: 0-based 4 test [AC, WA, TLE, AC] → 2/4 đúng thứ tự (`integration.test.ts:1028`); deadline/late/max-score qua API với `config.now` tiêm được, không INSERT trực tiếp (`:1232`); biên 65536/65537 byte mã sinh viên (`:915`), 50/51 hidden tests (`:798`), CSV 500/501 dòng (`:448`); rate limit đăng nhập lần 11 → 429 (`:1577`), submit lần 7 → 429 (`:1600`).
- Probe E2E độc lập (e2e5.mjs, grader thật): 18/18 OK — import trả `temporaryPassword` cho tài khoản mới (`status:"created"`); AC → 4 verdict AC; DB: submission AC 4/4 có 4 dòng kết quả, WA 1/4 có 4 dòng (vòng 1 chỉ 3); các kiểm tra phân quyền/leak/callback/CSV/warmup như vòng 1 đều đạt.
- Credential: không có `postgres://`, `DATABASE_URL`, `GRADER_SECRET` trong `src/web`, `src/shared/src`. Tài liệu: `docs/API.md` (91 dòng), `docs/openapi.yaml` (745), `docs/AZURE_SETUP.md` (148, 6 mục `[CẦN XÁC MINH]`). Kiểm tra kết nối Azure staging: CHƯA CHẠY (chưa tạo tài nguyên Azure — để P9).
- Tiêu chí P5 1–5: ✔. Kết luận: PASS.

### T-0004 vòng 3 (vòng cuối) — spike trên Render free thật — 2026-11-01
- Local (Claude, commit 0741905): build exit 0; `run-suite.mjs` `--memory 512m` 0 FAIL; `--memory 512m --cpus 0.15` (mô phỏng Render) 0 FAIL; `server-selftest.mjs` exit 0. Agy sửa 3 ca (15_tle_sleep ngủ vô hạn, q8 sleep 30 s, c2 chấp nhận CE/CTE) — hợp lý vì hạn chót wall đổi thành TL×10+1 s; không làm yếu mục tiêu ca.
- Render (deploy dep-dbjc7l0u01pc73f22qdg live 04:46:18Z):
  - `/env-probe`: thời gian biên dịch chương trình nhỏ `#include <bits/stdc++.h>` = 15698 ms; sandbox uid 2000000000; fork 5 ok; cgroup 512 MiB.
  - `/run-suite`: client nhận `fetch failed` (vượt 300 s), server vẫn giữ khóa (409) → bộ 38 ca không hoàn tất trong hạn 5 phút của server vì mỗi ca biên dịch ~15 s ở 0.15 CPU. KHÔNG có số pass/fail trên Render cho vòng này.
  - `/bench` (gọi riêng): exit 0; wall mean 2187.90 ms, StdDev 73.25 ms (3.35%), spread 11.34%; CPU mean 321.20 ms; tỉ lệ 0.147.
- Đánh giá P2: 5 ✔, 7 ✔ (độ lệch 3.35% ≤ 20%; cold start 13.37 s), 6: cách ly bộ nhớ/tiến trình/uid hoạt động trên Render ✔ nhưng thời gian biên dịch ~15.7 s/bài ✘ so với ngưỡng p95 ≤ 10 s (REQUIREMENTS §6) khi grader chạy trên Render free.
- Kết luận: hết 3 vòng của T-0004 → DỪNG task, báo người dùng. Rủi ro chuyển P8 (tiêu chí 3 và 7): cần giảm thời gian biên dịch (vd precompiled header, không `-O2` khi biên dịch, giới hạn header) hoặc người dùng chọn nơi chạy grader khác.

### T-0008 / Phase P6 — giao diện giảng viên — nghiệm thu (accept-phase) — 2026-11-01
- Bối cảnh: lượt agy chạy 4144 s, bị Claude Code ngắt (máy thiếu RAM) khi đang chạy lệnh kiểm chứng 2; KHÔNG có báo cáo `handoff/reports/T-0008.md` (lỗi quy trình, ghi nhận). Claude nghiệm thu trực tiếp trên mã agy để lại.
- Phạm vi: chỉ đổi `src/web/**`, `tests/e2e/**`, `docker-compose.yml` (+`API_INTERNAL_URL` cho web), `package.json` gốc (+script `test:e2e`, +`@playwright/test` 1.64.1 — gói đã được phép), lockfile, `docs/UI.md`. Không đụng `src/api`, `src/grader`, `src/shared` ✔.
- Lệnh 1 (node:22, lint + format:check + build + test): exit 0; web `Tests 25 passed (25)`; api `18 passed | 52 skipped`; grader `6 passed`; shared `14 passed`.
- Lệnh 2 (`docker compose down -v` → `up -d --build` → `seed:lecturer` → Playwright 1.64.1 trên `cppdsa_default`, BASE_URL=http://web:3000): exit 0; `1 passed (9.7s)`.
- Spec E2E kiểm đúng tiêu chí (không tautology): đăng nhập → tạo lớp → import CSV 2 SV + 1 dòng lỗi (hiển thị "Dòng 4") + mật khẩu tạm → reset mật khẩu → bài TEMPLATE (ML 256, deadline, TL) + 2 hidden tests → bài FREE + 2 hidden tests → SV nộp qua API (đúng → COMPLETED score 1; sai → < 1) → giảng viên thấy điểm 1.00/0.00, lọc, mở chi tiết verdict AC/WA → tải CSV kiểm nội dung (mã SV, email) → warmup db/grader "Sẵn sàng". Form từ chối TL âm và template thiếu `STUDENT_END`. `consoleErrors` và `pageErrors` phải rỗng.
- Probe độc lập (Claude, `p6probe.mjs` trên compose): `/api/health` qua web (rewrite) → 200; `/api/classrooms` chưa đăng nhập qua web → 401; login sai qua web → 401; 10 bundle JS client không chứa `postgres://`, `GRADER_SECRET`, `DATABASE_URL`, `SESSION_SECRET`, `api:4000`, `localhost:4000`; env container web không có biến secret/DB. Grep `src/web`: mọi `fetch` dùng đường dẫn tương đối `/api/...`; URL nội bộ duy nhất là `API_INTERNAL_URL` phía server trong `next.config.mjs`; không dùng `NEXT_PUBLIC_*`.
- Tiêu chí P6: (1) ✔ (2) ✔ (3) ✔ (4) ✔ (5) ✔. Kết luận: PASS (vòng 1). Ghi chú: bước "sinh viên nộp" đi qua API vì giao diện sinh viên thuộc P7.

### T-0009 vòng 1 / Phase P7 — giao diện sinh viên — nghiệm thu (accept-phase) — 2026-11-01
- Bối cảnh: lượt agy bị ngắt (run.json rỗng, stderr dừng ở "waiting up to 3h0m0s for 1 background task"); KHÔNG có `handoff/reports/T-0009.md` dù task bắt buộc viết sớm (tiêu chí 8 ✘). Mã để lại chưa commit trên `task/T-0009`.
- Lệnh 1 (node:22): exit 0; web `Tests 32 passed (32)` (8 file, có template-editor, free-mode-editor, submission-result, submission-polling); api `18 passed | 52 skipped`; grader `6 passed`.
- Lệnh 2 (compose down -v → up --build → seed → Playwright 1.64.1): exit 1; `lecturer.spec.ts` pass; `student.spec.ts` FAIL tại `student.spec.ts:456` (bài FREE, lần nộp AC đầu tiên): `submission-status` không xuất hiện trong 30 s. Log api: `POST .../submissions` → 429 "tối đa 6 lần/phút" — spec dùng MỘT sinh viên cho 6 lần nộp TEMPLATE (AC/WA/CE/TLE/MLE/RE) rồi nộp tiếp FREE trong cùng phút → lần 7 bị rate limit P5. Lỗi ở thiết kế spec, không phải API. Các bước FREE, lịch sử, chống lộ, nộp trễ, viewport 390×844 CHƯA được kiểm (chưa chạy tới).
- Đọc mã (Claude): chuyển hướng theo vai trò ở `login/page.tsx:44-47`, `student/layout.tsx:45` chặn không phải STUDENT ✔; TemplateEditor phần cố định là `<pre>`, payload `{ regions }` ✔; poller `setInterval` 2000 ms + `clearInterval` khi trạng thái cuối/unmount ✔; UI có thông báo 429/413 ✔.
- Tiêu chí P7: (1) ✘; (2)–(7) chưa xác nhận bằng E2E; (8) ✘. Kết luận: FAIL → T-0009 vòng 2. `docker compose down -v` đã chạy.

### T-0009 vòng 2 / Phase P7 — nghiệm thu lại — 2026-11-01
- Lượt agy đầu của vòng 2 bị hủy sau 56 s (`git show` ngoài allow-list headless) → đã ghi cấm vào task, chạy lại: SUCCESS, có `handoff/reports/T-0009.md`.
- Claude chạy lại: lệnh 1 exit 0 (web `32 passed`, api `18 passed | 52 skipped`, grader `6 passed`, shared `25 passed`); lệnh 2 (down -v → up --build → seed → Playwright 1.64.1) exit 0: `lecturer.spec.ts` (8.8s) + `student.spec.ts` (37.7s) `2 passed (38.7s)`; `docker compose down -v` exit 0.
- Spec mới dùng 4 sinh viên (mỗi người ≤ 3 lần nộp/phút, đều đổi mật khẩu qua UI) → không chạm rate limit; không dùng chờ 60 s.
- Kiểm mã (Claude): `submission-verdict` chỉ render mã verdict (`SubmissionResultCard.tsx:178-181`) nên `toContainText('AC'|'WA'|'CE'|'TLE'|'MLE'|'RE')` không trùng nhầm; `student/layout.tsx:45` và `lecturer/layout.tsx:45` chặn sai vai trò; phần cố định template là `<pre data-testid="fixed-code-segment">`, payload `{ regions }`; poll 2000 ms, dừng khi trạng thái cuối/unmount; spec kiểm `HIDDEN_MARK_P7` trên `page.content()` cả hai mode + bài trễ, `scrollWidth <= innerWidth` ở 390×844, console/pageerror rỗng.
- Câu hỏi agy: API danh sách bài cho sinh viên chưa có `bestScore`; UI tự tính max từ lịch sử nộp. Ghi nhận, không chặn P7 (điểm chính thức phía giảng viên đã có ở P5/P6) — cân nhắc ở P10.
- Tiêu chí P7 1–8: ✔. Kết luận: PASS (vòng 2).

### T-0010 vòng 1 / Phase P8 — 2026-11-01
- Lượt agy bị hủy sau 1326 s (agy chạy `dir tests/load`, lệnh bị cấm trong task) → không có `handoff/reports/T-0010.md`.
- Claude chạy lệnh 1 trên mã để lại: `npm ci` ok, lint ok, `format:check` FAIL (3 file: `src/api/src/routes/internal.ts`, `src/grader/src/runner.ts`, `tests/security/run-attacks.mjs`). Thiếu load test, `reports/P8_*.md`, lệnh 2–5 CHƯA CHẠY.
- Kết luận: FAIL → T-0010 vòng 2.

### T-0010 vòng 2 / Phase P8 — nghiệm thu — 2026-11-01
- Claude chạy lại: lệnh 1 exit 0 (`npm audit --audit-level=high` exit 0; còn 5 moderate); lệnh 2 (`--memory 512m --cpus 0.15`) `Summary: 50/50`; lệnh 3 runner báo 15/15; lệnh 5 E2E `2 passed (40.9s)` (next 16, fastify 5 không hồi quy); compose down -v sau mỗi lần.
- Probe (bản sao runner trong container in kết quả thật): TC-ATK-01/04/05/06/07/08 đều CE `fatal error: /usr/local/include/cppdsa_pch/iostream: No such file or directory` → PCH làm hỏng mọi bài có `#include <iostream>` không ở dòng đầu (lỗi sản phẩm); 6 ca tấn công chưa chạy mà vẫn báo PASS. TC-ATK-14 lộ token `'root'` của `/etc/passwd`. TC-ATK-13 compile bomb ra WA (không bom). Các ca chạy thật: thread bomb RE, memory bomb MLE 259644 KB, sleep TLE, kill parent WA, execve WA, disk fill RE, binary bomb CE (File size limit) — grader sống, canary AC sau mỗi ca.
- Không có test mới (api 18|52, grader 6 không đổi) cho CPU-time/PCH/compile timeout/rate limit IP/redact, trái với báo cáo agy.
- Load test: throughput tính sai (`completed / maxLatency`, B = 2918 bài/phút); thiếu queue/compile/run time; A chỉ chạy 1 cấu hình. Số agy báo (chưa Claude tái lập): A p50 6151 ms, p95 10187 ms (> 10 s), B p95 2026 ms, 0 bài mất, peak 7 kết nối DB.
- Cấu hình lệch: Dockerfile `GRADER_CONCURRENCY=1`, `COMPILE_CPU_LIMIT_S=15` vs báo cáo 2/10.
- Kết luận: FAIL → T-0010 vòng 3 (cuối).

### T-0010 vòng 3 (cuối) / Phase P8 — nghiệm thu — 2026-11-01
- Lượt agy: lượt 3 hủy (`docker ps` không đối số), lượt 4 hủy (`$env:X=...;` trước lệnh docker), lượt 6 xong cả 5 lệnh và có báo cáo `handoff/reports/T-0010.md`. Ổ H: bị Docker Desktop mất mount giữa chừng (`mkdir /run/desktop/mnt/host/h: file exists`) → Claude chạy mọi lệnh bằng cách đẩy mã qua stdin (`tar -cf - . | docker run -i ...`), không bind mount; nội dung lệnh giữ nguyên.
- Lệnh 1 (npm ci, lint, format:check, build, test, audit): exit 0. Test: api `21 passed | 52 skipped` (vòng 2: 18|52), grader `13 passed` (vòng 2: 6), các workspace khác 25 và 32 passed. `npm audit --audit-level=high`: 5 moderate, 0 high/critical ✔.
- Lệnh 2: `docker build` ok; `--memory 512m --cpus 0.15` → `Summary: 58/58 cases PASSED`; không giới hạn CPU (`--memory 512m`) → `58/58` ✔. Gồm TC-46..49 (PCH: `<iostream>` dòng 1; `<vector>` rồi `<iostream>`; `bits/stdc++.h` trong vùng sinh viên; FREE include sau code) đều AC.
- Lệnh 3 (compose + `docker-compose.load.yml`, 0.15 CPU/512 MB): `15/15 PASSED`, verdict thật: fork bomb WA, thread bomb RE, memory bomb MLE, đọc file nhạy cảm WA, đọc job khác WA, socket WA, stdout flood RE, stderr flood TLE, sleep TLE, kill cha WA, execve WA, disk fill RE, compile bomb CE (`In instantiation of ...` — chạm giới hạn độ sâu template của gcc, không phải COMPILE_TIMEOUT), `#include` file hệ thống CE "Không được include file ngoài bài nộp", binary bomb CE (File size limit). Không ca chạy nào kết thúc bằng CE; `/health` 200 và canary AC sau mỗi ca ✔.
- Probe độc lập của Claude (script ngoài repo, API thật, 0.15 CPU): bài đốt 0.8 s CPU (`clock()`) TL 1 s → AC, `execution_time_ms=803`; đốt 1.3 s → TLE `1302` (timeMs = CPU time ✔ ở 0.15 CPU, nơi wall ≈ 6–7× CPU). `#include <iostream>`+`bits/stdc++.h` trong vùng sinh viên → AC. Né bộ lọc bằng macro (`#define F "/etc/passwd"` / `/etc/hostname` / `/etc/debian_version`) và nối dòng `\` → CE thông báo chung, không lộ token; `/app/...` → `Permission denied` (compiler chạy uid sandbox); `/proc/self/environ` qua macro → biên dịch được, AC (environ của compiler rỗng, không có secret). Ghi vào `/usr/local/include/cppdsa_pch` từ bài nộp → không được (AC). Grep 763 dòng log grader+api: 0 lần xuất hiện mật khẩu, `dev-grader-secret`, `postgres://`, mã nguồn, `#include`, input test ẩn ✔; log JSON có `queueMs/compileMs/runMs/totalMs/verdict` theo `submissionId` ✔.
- Lệnh 4 — Claude chạy lại kịch bản A (20 SV đồng thời, `bits/stdc++.h`), mỗi cấu hình compose mới + down -v:

  | Cấu hình | Xong/mất | p50 | p95 | max | queue p95 | compile p50/p95 | throughput |
  |---|---|---|---|---|---|---|---|
  | 0.15 CPU, PCH, conc 1 | 20/0 | 26.3 s | 48.4 s | 51.5 s | 48.2 s | 2.49/2.91 s | 23.3/phút |
  | 0.15 CPU, không PCH | 20/0 | 105.6 s | 197.2 s | 206.2 s | 196.2 s | 10.2/10.9 s | 5.8/phút |
  | Không giới hạn CPU, PCH | 20/0 | 4.2 s | 7.2 s | 7.2 s | 6.1 s | 0.29/0.35 s | 166.6/phút |

  DB sau mỗi lượt: 20 COMPLETED. Số của agy trong `reports/P8_load.md` chậm hơn ~2–3× (PCH p95 95.35 s; không giới hạn CPU p95 21.26 s) và báo mất 4 bài ở cấu hình không PCH — Claude KHÔNG tái lập được (0 mất); coi số Claude là số đối chiếu, số agy là một lần đo khi máy tải nặng. Throughput tính đúng (`completed/(t_last−t_first)`) ✔; có queue/compile/run ✔. Kịch bản B: Claude CHƯA CHẠY lại; agy báo `--duration 600`, 100/100 COMPLETED, 0 mất, 0 HTTP lỗi, p50 4.04 s, p95 9.07 s, max 12.07 s, 10.7 bài/phút, peak 7 kết nối PostgreSQL (mã B rải lịch nộp trong 0–570 s, khớp duration 563 s).
- Lệnh 5: E2E `lecturer.spec.ts` + `student.spec.ts` → `2 passed (42.1s)` ✔.
- Cấu hình chốt khớp giữa `src/grader/Dockerfile`, `docker-compose.yml`, `src/grader/src/config.ts` (mặc định) và `reports/P8_load.md`: `GRADER_CONCURRENCY=1`, `GRADER_WALL_FACTOR=10`, `COMPILE_TIMEOUT_MS=15000`, `COMPILE_CPU_LIMIT_S=10`, `GRADER_MEMORY_BUDGET_MB=400`, `ENABLE_PCH=true` ✔. `.env.example`: Claude KHÔNG kiểm được (quy tắc chặn đọc `.env*`); `git diff fe779ee --stat` không có `.env.example` → nhiều khả năng CHƯA có các biến mới.
- Điểm yếu test (không chặn, đã bù bằng probe): test redact API dựng Fastify riêng với danh sách redact chép tay (không kiểm `app.ts`); test quyền thư mục PCH có `if (existsSync)` nên trống ngoài image grader; TC-50/53 (`sum += i & 1`, "~300/800 ms") có thể bị `-O2` rút gọn, không chứng minh 0.8 s CPU — probe của Claude đã chứng minh. Endpoint mới `GET /jobs/:id/metrics` của grader không yêu cầu `X-Grader-Secret` (chỉ lộ thời gian/verdict, cần UUID) và `recentMetrics` là Map không giới hạn → xử lý ở P9.
- Tiêu chí P8 (PROJECT_PLAN): (1) tấn công ✔; (2) đo tải ✔; (3) p95 ≤ 10 s: ✘ kịch bản A ở 0.15 CPU (p95 48.4 s, 20 bài dồn cùng lúc phải biên dịch nối tiếp), ✔ A không giới hạn CPU (7.2 s), B 9.07 s (số agy, sát ngưỡng); không mất submission ✔; (4) audit ✔; (5)(6) Azure: CHƯA CHẠY (P9), có `docs/OPERATIONS.md`, số kết nối PostgreSQL local peak 7; (7) cấu hình chốt ✔. Local lạc quan hơn Render: biên dịch `bits/stdc++.h` không PCH local 10.2 s vs Render 15.7 s (T-0004) → ~1.5–2×; không PCH trên Render sẽ vượt `COMPILE_TIMEOUT_MS=15000` → PCH bắt buộc bật.
- Kết luận: T-0010 PASS (đủ 9 tiêu chí của task; task quy định p95 không đạt là ghi số thật, không phải lỗi task). Phase P8 PASS phần sản phẩm; tiêu chí 3 (p95 burst 20 trên Render free) KHÔNG đạt do giới hạn 0.15 CPU → quyết định của người dùng trước/trong P9. Merge `task/T-0010` → main.

### Kiểm thử API trước deploy (Claude, độc lập) — 2026-11-01
- Test tích hợp với PostgreSQL thật (`TEST_DATABASE_URL` trỏ db compose, `npx vitest run` trong `src/api`): `Test Files 6 passed`, `Tests 73 passed` (52 ca tích hợp trước đây bị skip nay chạy hết) ✔.
- Probe 80 điểm kiểm (script ngoài repo, compose thật, 2 giảng viên, 4 sinh viên): 73 PASS. Đạt: đăng nhập sai/đúng, không lộ email tồn tại, cookie `HttpOnly; SameSite=Lax`, cookie giả/đăng xuất → 401, SQL injection/JSON hỏng → 400/401 không lộ stack, chặn SV chưa đổi mật khẩu (403), mật khẩu yếu → 400, mật khẩu tạm hết hiệu lực sau khi đổi; SV không gọi được 9 route của giảng viên (403); GV2 gọi 16 route trên lớp/bài/test/bài nộp của GV1 → 403/404; SV lớp khác không xem đề/nộp/xem bài nộp; SV chỉ thấy bài nộp của mình; kết quả và đề không chứa test ẩn; callback grader không/sai secret → 401; warmup cần giảng viên; body 11 MB → 413; route lạ → 404; giới hạn nộp 6/phút (tính cả lần nộp không hợp lệ) và đăng nhập 10/phút → 429 tiếng Việt.
- LỖI tìm thấy:
  1. **CHẶN DEPLOY — rate limit theo IP sau proxy:** `app.ts` không bật `trustProxy`, global (300/phút) và đăng nhập (10/phút) đều dùng `req.ip`. Thực nghiệm: container A đăng nhập sai 10 lần qua `http://web:3000/api` (rewrite Next) → container B (IP khác, chưa từng gọi) đăng nhập qua web nhận **429**, gọi thẳng API nhận 200. Log API: mọi request qua web có cùng `remoteAddress`. Trên production (Vercel rewrite → Render proxy) cả hệ thống sẽ dùng chung 10 lần đăng nhập/phút và 300 request/phút; trang kết quả poll 2 s/lần → ~10 SV đang chờ kết quả là 429 cho tất cả. Phòng máy dùng chung NAT cũng gặp giới hạn đăng nhập theo IP.
  2. **CSV formula injection:** họ tên `=HYPERLINK(...)` xuất nguyên văn trong `/classrooms/:id/grades/csv` (`PA...,=HYPERLINK(http://evil),...`) → chạy công thức khi giảng viên mở bằng Excel.
  3. **UUID sai → 500 và lộ lỗi PostgreSQL:** `GET /submissions/abc`, `/assignments/abc`, `/classrooms/abc` → `500 {"code":"22P02","message":"invalid input syntax for type uuid: \"abc\""}`.
  4. **Thiếu kiểm biên bài tập:** `timeLimitMs: -1` và `memoryLimitMb: 999999` được tạo (201).
  5. (Thấp) `GET /jobs/:id/metrics` của grader không xác thực, `recentMetrics` không giới hạn; API không chặn khởi động khi `NODE_ENV=production` mà thiếu `COOKIE_SECRET`/`GRADER_SECRET`; `src/api/Dockerfile` không đặt `NODE_ENV=production` (cookie chỉ `Secure` khi biến này đúng).
- Tài liệu: `docs/AZURE_SETUP.md` §4.1 sai — `ALTER DEFAULT PRIVILEGES` chạy bởi admin không áp dụng cho bảng do `cppdsa_migrator` tạo. Thực nghiệm local (PG16): migrate bằng migrator → `has_table_privilege('cppdsa_app','users','SELECT') = f`. Sửa bằng `GRANT ... ON ALL TABLES` sau migration + `ALTER DEFAULT PRIVILEGES FOR ROLE cppdsa_migrator ...` → `t`; khi đó API khởi động bằng `cppdsa_app` (`No migrations to run!`, listen OK) và `seed:lecturer` chạy được. `CREATE EXTENSION pgcrypto` không cần (`gen_random_uuid()` có sẵn từ PG13). `docs/DEV_SETUP.md` còn ghi `GRADER_CONCURRENCY=2`, budget 384 (chốt P8: 1, 400).
- Kết luận: CHƯA nên deploy cho lớp thật trước khi sửa lỗi 1 (hoặc tạm nâng `LOGIN_RATE_LIMIT_MAX`/`GLOBAL_RATE_LIMIT_MAX` qua env, chấp nhận giảm bảo vệ brute-force); lỗi 2–4 nên sửa trước pilot. Đã lập task `handoff/tasks/T-0011.md`.

### T-0011 vòng 1 — sửa lỗi API trước deploy — review — 2026-11-02
- File sửa đều trong Allowed files (14 file + `src/api/tests/deploy-fixes.test.ts`). Test mới dùng `buildApp` thật, có đủ các ca rate limit (a–d), CSV, UUID, biên TL/ML (POST và PUT), production guard.
- Lệnh 1: exit 0; api `36 passed | 52 skipped` (trước 21|52), grader `15 passed` (trước 13); audit 5 moderate, 0 high/critical ✔.
- Lệnh 2 (`TEST_DATABASE_URL`, PostgreSQL compose): `Test Files 7 passed`, `Tests 88 passed` ✔.
- Lệnh 3: grader `--memory 512m --cpus 0.15` → `Summary: 58/58 cases PASSED` ✔.
- Lệnh 4: compose với `TRUST_PROXY=1` → E2E `2 passed (44.8s)` ✔.
- Probe 80 điểm của Claude chạy lại: 77 PASS. Lỗi cũ đã hết: `timeLimitMs -1`/`memoryLimitMb 999999` → 400; `/submissions|assignments|classrooms/abc` → 400 `Mã không hợp lệ` (không còn `22P02`); CSV xuất `'=HYPERLINK(...)`. 3 FAIL còn lại không phải lỗi sản phẩm: B8/B12 do probe gửi `studentId=undefined` nên nay bị chặn 400 bởi kiểm UUID trước bước phân quyền (vẫn từ chối); H1 do 3 lần nộp không hợp lệ trước đó được tính vào hạn mức 6/phút (đúng thiết kế).
- Qua proxy (rewrite của web): container A đăng nhập sai 10 lần email X → container B (IP khác) đăng nhập email khác qua web → **200** (trước T-0011: 429) ✔.
- Kết luận: PASS. Merge `task/T-0011` → main. Còn phải xác minh trên production: giá trị `TRUST_PROXY` đúng cho chuỗi Vercel → Render (DEPLOY.md §6 bước 4).

### T-0012 vòng 1 — FREE không harness, sửa/chấm lại điểm, nhập bộ test — review — 2026-11-02
- Nguyên nhân lỗi `SYSTEM_ERROR` trên production (log Render 20:29:55Z): API gửi `POST /jobs` tới chính `cppdsa-api.onrender.com` (`Route POST:/jobs not found`, 404) → biến `GRADER_URL` của `cppdsa-api` bị đặt nhầm URL API. Claude sửa qua Render MCP thành `https://cppdsa-grader.onrender.com` (deploy `dep-dbjq90h42hec73dphhl0` succeeded). Không phải lỗi code.
- File sửa trong phạm vi; KHÔNG có thay đổi trong `src/api/migrations/` ✔. Thêm `src/api/src/services/grader-dispatch.ts` (dùng chung cho nộp bài và chấm lại).
- Lệnh 1: exit 0; api `36 passed | 58 skipped`, grader 15, shared 25, web 32; audit 5 moderate, 0 high/critical ✔.
- Lệnh 2 (PostgreSQL thật): `Test Files 7 passed`, `Tests 94 passed` (có FREE không entryPointSpec, nộp FREE chỉ studentSource, sửa điểm + biên + phân quyền, regrade 1 bài/cả bài tập, bulk import, đăng nhập gọi grader `/health` không chặn) ✔.
- Lệnh 3 (0.15 CPU/512 MB): `Summary: 58/58 cases PASSED`; ca FREE mới: in cứng bằng `if/cout` → AC, thiếu `main` → CE, harness cũ bị bỏ qua → AC ✔.
- Ghi chú: `dispatchSubmissionToGrader` không kiểm `res.ok` khi grader trả 4xx/5xx → bài ở PENDING và được recovery gửi lại sau 2 phút (trước đây đánh SYSTEM_ERROR ngay). Chấp nhận.
- Kết luận: PASS. Merge `task/T-0012` → main.

### T-0013 vòng 1 — giao diện FTISU CodeLab — nghiệm thu — 2026-11-02
- Lượt agy dừng sau 830 s: `RESOURCE_EXHAUSTED (429) Individual quota reached … Resets in 28h52m` — mã đã viết, chưa tự chạy kiểm chứng, không có `handoff/reports/T-0013.md`.
- Claude chạy lệnh 1: lint 0 lỗi (3 warning biến thừa), build OK, api/grader/shared pass; web `1 failed | 28 passed` (test trang chủ còn kỳ vọng tiêu đề `CppDSA`) → FAIL.
- Lệnh 2 (compose + Playwright): lecturer PASS (gồm nhập bộ test từ file, sửa điểm, chấm lại); student FAIL chỉ ở kiểm tra cuối: 1 lỗi console `401 (Unauthorized)` do trang chủ gọi `/api/auth/me` khi chưa đăng nhập; các bước chức năng trước đó đều qua.
- Xem 9 ảnh (bản sao tại scratchpad Claude): trang chủ/đăng nhập/tài khoản/làm bài/lịch sử/nhập test/chi tiết bài nộp đúng yêu cầu; `home-dark.png` không khác `home-light.png` (chưa chứng minh được chế độ tối); chi tiết bài nộp (GV) hiện JSON vùng code thô và trạng thái `COMPLETED` thô.
- Kết luận: FAIL vòng 1 → phản hồi đã ghi vào `handoff/tasks/T-0013.md` (vòng 2/3). KHÔNG merge, KHÔNG deploy giao diện mới; production giữ giao diện cũ + backend T-0012 (tương thích: API bỏ qua `entryPointSpec`/`entry` do giao diện cũ gửi). Vòng 2 chờ quota agy reset (~29 giờ) hoặc người dùng cho phép Claude sửa trực tiếp.

## T-0013 vòng 2 — PASS (Claude nghiệm thu 2026-11-04)
- Lệnh 1 (Claude tự chạy, thêm `--exclude=probs`): lint/format/build OK; web 33 test pass (vòng 1: 29), api 36 pass (58 integration skip do không có DB), grader 15, shared 25; `npm audit --audit-level=high` exit 0.
- Lệnh 2 (Claude tự chạy E2E): `lecturer.spec.ts` + `student.spec.ts` 2/2 pass, 0 lỗi console (trang chủ đổi sang route web `/api-session` trả `{user:null}` khi chưa đăng nhập).
- Ảnh: `home-dark.png` và `lecturer-dark.png` đúng chế độ tối; trang chi tiết bài nộp hiện từng vùng code và trạng thái tiếng Việt.

## T-0014 vòng 1 — PASS (Claude nghiệm thu 2026-11-05)
- Lệnh 1 (Claude tự chạy): lint/format/build OK; api 47 pass (62 skip không DB), web 36, grader 15, shared 25; audit high exit 0.
- Lệnh 2: integration với Postgres 109/109 pass, 0 skip; `node-pg-migrate up` rồi `down` (gỡ 0003) đều "Migrations complete!".
- Lệnh 3: E2E 2/2 pass (giảng viên đính PDF khi tạo bài; sinh viên xem PDF).
- Review: `GET /api/assignments/:id` không trả `statement_file_id`/`statement_storage`; PUT kiểm `%PDF-`, `bodyLimit` 10 MB, chỉ GV chủ lớp; GET chỉ GV chủ lớp/SV đã ghi danh. Driver gdrive gọi REST bằng `fetch`, không thêm gói.
