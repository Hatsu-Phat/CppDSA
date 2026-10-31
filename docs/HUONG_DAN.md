# Hướng dẫn sử dụng workflow Claude (điều phối) + Antigravity (code)

Áp dụng cho mọi project đã tạo bằng `new-project.ps1`. Phần đã kiểm chứng và phần chưa kiểm chứng ghi rõ ở cuối.

## 1. Vai trò
| Ai | Làm gì |
|---|---|
| Bạn | Ra mục tiêu, chốt quyết định khoa học (split, metric, hướng phương pháp), duyệt kết quả |
| Claude Code | Phân tích, lập kế hoạch, viết task, giao việc, review `git diff`, chạy kiểm thử, ghi báo cáo |
| Antigravity (`agy`, Gemini 3.8 Flash) | Viết code theo đúng một task, ghi báo cáo vào `handoff/reports/` |

Quy tắc chung (không bịa, tiết kiệm token, sửa đúng phạm vi) đã nằm sẵn trong `~\.claude\CLAUDE.md` và `~\.gemini\GEMINI.md`: bạn **không cần nhắc lại** trong prompt.

## 2. Bắt đầu một project mới (làm một lần)
```
powershell -NoProfile -File $HOME\ai-workflow\new-project.ps1 -Path H:\lab\TenProject
cd H:\lab\TenProject
```
Mở Claude Code **tại thư mục này**, rồi dùng Prompt 1 ở mục 3.

## 3. Quy trình theo phase và 4 prompt chuẩn cho project mới

```
[1 Roadmap] Claude lập kế hoạch ──> bạn duyệt
      │
      ▼  (lặp cho từng phase P1, P2, ...)
[2 Build]   Claude viết task ──> Gemini Flash 3.8 High viết code + test, tự chạy, tự sửa (≤3 lần) ──> báo cáo
      │
      ▼
[3 Nghiệm thu] Claude chạy kiểm thử độc lập, đối chiếu tiêu chí, KHÔNG sửa code
      │ PASS → phase kế (bạn duyệt)        FAIL → task sửa giao lại agy (≤3 vòng/phase)
```
Phân vai: **Claude** lập roadmap, viết task, nghiệm thu, ghi báo cáo, không sửa `src/` `tests/` (template còn chặn cứng bằng `Edit(./src/**)`, `Edit(./tests/**)` trong `.claude/settings.json`; muốn nới thì xóa 2 dòng đó). **Gemini** viết code và test, tự sửa, bàn giao.

**Prompt 1 — Khởi động project (Claude chỉ lập kế hoạch, chờ bạn duyệt):**
> Dùng plan-roadmap. Mục tiêu project: `<một câu>`. Đầu vào/ràng buộc: `<dataset, GPU, deadline, tài liệu đã có>`. Thư mục không được đụng: `<…>`. Lập roadmap chia phase nhỏ, mỗi phase có sản phẩm bàn giao, tiêu chí nghiệm thu đo được và kế hoạch kiểm thử, ghi vào PROJECT_PLAN.md. Chưa tạo task, chưa code. Cuối kế hoạch liệt kê tối đa 5 câu hỏi cần tôi quyết, kèm mặc định bạn đề xuất.

Bạn đọc PROJECT_PLAN.md, trả lời câu hỏi, chỉnh nếu cần rồi nhắn: "Duyệt roadmap."

**Prompt 2 — Chạy một phase (Claude giao, Gemini code):**
> Duyệt roadmap. Chuyển PHASE sang DEV, bắt đầu Phase P1. Lập task cho phase này (gộp thành ít task lớn), giao Gemini 3.8 Flash High viết code + test và tự sửa tới khi qua kiểm chứng. Bạn không viết hay sửa code. Xong thì tự nghiệm thu theo accept-phase và báo tôi kết quả (≤10 dòng).

**Prompt 3 — Nghiệm thu thủ công (khi bạn muốn tự yêu cầu kiểm tra):**
> Dùng accept-phase cho Phase P1. Chạy kiểm thử độc lập, đối chiếu từng tiêu chí, đánh giá test của Gemini có kiểm đúng không. Ghi TEST_REPORT.md. FAIL thì lập task sửa giao lại; không tự sửa code.

**Prompt 4 — Sang phase kế / đổi kế hoạch:**
> P1 đã PASS, tôi duyệt. Bắt đầu Phase P2 theo PROJECT_PLAN.md. (hoặc) Thay đổi: `<…>`. Dùng plan-roadmap cập nhật các phase còn lại, chờ tôi duyệt.

Lưu ý: Claude chỉ làm khi mở Claude Code đúng thư mục project. Mỗi phase nên một phiên mới (`/clear`) để tiết kiệm token; trạng thái nằm trong PROGRESS.md (`CURRENT_PHASE`), PROJECT_PLAN.md và TEST_REPORT.md nên Claude đọc lại được.

## 4. Công thức prompt (dùng cho mọi yêu cầu)
Một prompt tốt có 5 phần, mỗi phần một dòng:
1. **Mục tiêu:** một câu, kết quả cuối cùng cần có.
2. **Phạm vi:** file/thư mục được đụng (đường dẫn, không dán nội dung).
3. **Xong khi:** tiêu chí đo được (lệnh chạy qua, số nào đạt).
4. **Cấm:** điều không được làm (đổi hyperparameter, đụng `data/`, thêm thư viện…).
5. **Mức tự chủ:** "tự quyết và ghi vào PROGRESS.md" hoặc "dừng hỏi tôi nếu gặp X".

## 5. Prompt mẫu theo tình huống

**Khảo sát tài liệu (skill `lit-verified`)**
> Dùng lit-verified: tìm 5 paper về `<chủ đề>` từ `<năm>`. Chỉ ghi paper đã mở được nguồn, kèm link; số liệu chỉ lấy khi đọc trực tiếp trong paper, ghi bảng/mục. Cập nhật RESEARCH_NOTES.md. Không suy đoán, chưa xác minh được thì ghi vậy.

**Thiết kế thực nghiệm (skill `experiment-protocol`)**
> Dùng experiment-protocol: thiết kế thực nghiệm kiểm tra `<giả thuyết>`. Dataset/split/metric theo PROJECT_PLAN.md (nếu chưa chốt thì liệt kê lựa chọn, tôi chọn). Ghi config vào `configs/`, chưa chạy.

**Giao việc code ngoài luồng phase (việc lẻ)**
> Chuyển PHASE sang DEV. Mục tiêu: `<…>`. Phạm vi: chỉ `src/<…>` và `tests/<…>`. Xong khi: `pytest tests/<…>` qua và `<kiểm chứng khác>`. Cấm: đổi hyperparameter, đụng `data/`. Hãy: lập task T-XXXX, giao agy chạy nền, review diff, tự chạy lại kiểm thử, ghi TEST_REPORT.md và PROGRESS.md. Tối đa 3 vòng sửa rồi báo tôi.

Claude sẽ tự gọi: `run-task.ps1 -Task T-XXXX`, đọc báo cáo, kiểm `git diff`, chạy test. Bạn chỉ cần đọc kết luận.

**Việc nhỏ, đơn giản (giảm chi phí)**
> … giao agy với model medium (`-Model gemini-3.8-flash-medium`).

**Sửa lỗi sau review**
> Task T-XXXX FAIL ở tiêu chí 2. Ghi phản hồi cụ thể vào task, giao lại vòng 2.

**Kiểm tra trạng thái**
> Tóm tắt PROGRESS.md: đang ở PHASE nào, task nào đang mở, việc tiếp theo. Tối đa 5 dòng.

## 6. Chọn model
- **Claude Code:** dùng `/model` để chọn; mặc định đủ cho điều phối và review. Chỉ nâng lên model mạnh nhất khi thiết kế phương pháp/phân tích khó. `[Mức hạn mức của gói Pro: chưa kiểm chứng, theo dõi bằng /context và /usage nếu có.]`
- **Antigravity:** tham số `-Model` của `run-task.ps1`: `gemini-3.8-flash-high` (mặc định, việc khó), `-medium` (việc thường), `-low` (việc mẫu mực). Đừng thêm `--effort` (slug đã gồm effort). `agy models` còn liệt kê model Claude/GPT-OSS, không dùng cho workflow này.

## 7. Tiết kiệm token (đã đo: mỗi task agy tối thiểu ~57k input)
- Gộp việc: một task lớn có tiêu chí rõ thay vì nhiều task nhỏ.
- Một việc một phiên: xong việc thì `/clear`; phiên dài thì `/compact`; xem mức dùng bằng `/context`.
- Không dán log/dữ liệu vào chat: đưa đường dẫn, Claude đọc 20 dòng cuối.
- Trỏ file thay vì chép nội dung ("đọc docs/X.md").

## 8. Khi có sự cố
| Hiện tượng | Làm gì |
|---|---|
| `run-task` báo `exit` khác 0 | đọc 20 dòng stderr in kèm; báo Claude, không tự chạy lại quá 3 lần (lỗi vẫn tốn hạn mức) |
| `status=SUCCESS` nhưng sai | bình thường: SUCCESS là agy chạy xong, không phải đạt; Claude review rồi giao lại |
| agy sửa file ngoài phạm vi | Claude phát hiện qua `git diff`; yêu cầu hoàn tác file đó. Khuyến nghị chạy agy trên branch riêng |
| Claude đọc `data/` hay file lớn | nhắc: "theo dataset-safety, chỉ xem số lượng và vài mẫu" |
| Claude hỏi duyệt lệnh `run-task.ps1` | chọn "không hỏi lại"; luật cho phép đã có nhưng chưa được kiểm chứng |

## 9. Trạng thái xác minh
- **Đã kiểm chứng (T-0000):** agy 1.4.12 chạy headless với các cờ trên; tự nạp quy tắc toàn cục + project; ghi báo cáo được; model Gemini 3.8 Flash (High).
- **Chưa kiểm chứng:** luồng 3 bước theo phase (plan-roadmap → build → accept-phase) và luật chặn `Edit(./src/**)` chưa chạy thử trên project thật; Claude Code tự gọi `run-task.ps1` rồi nhận thông báo khi xong; `new-project.ps1` trên project mới; allowlist quyền của agy có hiệu lực hay không (nên luôn review diff).
- Đường dẫn cấu hình: Claude `~\.claude\` · agy `~\.gemini\` và `~\.gemini\antigravity-cli\` · template và script `~\ai-workflow\`.
