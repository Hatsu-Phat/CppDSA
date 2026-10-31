# Probe độc lập của Claude cho T-0003 (vòng 1) — đặc tả, không phải code sản phẩm

Mỗi thư mục q* có `meta.json` + `expected.txt` = `SAFE` + `solution.cpp`: chương trình in `SAFE` nếu tấn công thất bại, in `LEAK ...` nếu thành công (→ WA).
Kết quả trên image `cppdsa-spike` vòng 1 (`docker run --rm --memory 1g`, case thêm vào /app/cases):
- q1_read_case_expected: WA — sandbox đọc được `/app/cases/*/expected.txt` và `/app/run-suite.mjs`.
- q3_persist_write: WA — ghi được `/home/sandbox`, `/var/tmp`, `/run/lock`, `/var/lock` (và kiểm `/dev/shm`) → kênh truyền giữa các bài nộp.
- q4_escape_setsid: runner TREO VĨNH VIỄN (>10 phút): cháu `setsid()` giữ pipe stdout, runner chờ `close`.
- q4b_escape_closefd + q5_check_survivors: q5 WA — tiến trình sandbox từ bài trước vẫn sống.
- q6_stderr_flood: runner CHẾT `ERR_STRING_TOO_LONG` (stderr không giới hạn tổng).
- q7_proc_environ: AC (an toàn).
- q8_multi_proc_memory: TLE thay vì MLE; worker sống (nhẹ).
- c1_compile_include_secret: g++ chạy bằng root → thông báo CE chứa `super_secret_hidden_flag_12345`.
- c2_compile_include_devzero: biên dịch đọc vô hạn; g++ chạy với `shell:true`, không rlimit — cần chứng minh bị dừng ≤ timeout biên dịch và không còn tiến trình con.
