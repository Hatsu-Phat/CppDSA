# Cấu hình lưu đề bài PDF trên Google Drive

Cập nhật: 2026-11-02 · Trạng thái: CHƯA CHẠY (chờ người dùng). Dùng cho tính năng T-0014.

Đề bài PDF được lưu trong Google Drive của tài khoản chủ hệ thống (`lamnginphat@gmail.com`). API giữ một **refresh token** OAuth với quyền hẹp `drive.file` (chỉ thấy/sửa các file do chính ứng dụng tạo, không đọc được file khác trong Drive). File không chia sẻ công khai; sinh viên xem qua API sau khi đăng nhập.

Các mục `[CẦN XÁC MINH]` là chi tiết giao diện Google Cloud có thể khác khi bạn làm.

## 1. Tạo project và bật Drive API
1. Vào https://console.cloud.google.com bằng `lamnginphat@gmail.com` → chọn project ở thanh trên → **New Project** → tên `ftisu-codelab` → Create.
2. **APIs & Services → Library** → tìm **Google Drive API** → **Enable**.

## 2. Màn hình đồng ý OAuth
1. **APIs & Services → OAuth consent screen** (giao diện mới: **Google Auth Platform → Branding/Audience**) → User type **External**.
2. App name `FTISU CodeLab`, email hỗ trợ và email liên hệ: `lamnginphat@gmail.com`.
3. Scopes: thêm `.../auth/drive.file`.
4. **Audience/Publishing status:** bấm **Publish app** (In production). Nếu để "Testing", refresh token **hết hạn sau 7 ngày** và chức năng tải PDF sẽ ngừng. `drive.file` được Google xếp là phạm vi không nhạy cảm nên thường không cần xét duyệt `[CẦN XÁC MINH khi publish]`.

## 3. Tạo OAuth client
**APIs & Services → Credentials → Create credentials → OAuth client ID** → Application type **Web application** → tên `codelab-api` → Authorized redirect URIs thêm `https://developers.google.com/oauthplayground` → Create. Ghi lại **Client ID** và **Client secret** (giữ bí mật, không gửi vào chat).

## 4. Lấy refresh token (OAuth Playground)
1. Mở https://developers.google.com/oauthplayground → biểu tượng bánh răng (góc phải) → tích **Use your own OAuth credentials** → dán Client ID/Client secret.
2. Ô "Input your own scopes" nhập `https://www.googleapis.com/auth/drive.file` → **Authorize APIs** → đăng nhập `lamnginphat@gmail.com` → cho phép.
3. **Exchange authorization code for tokens** → copy **Refresh token**.
4. (Tùy chọn) Tạo thư mục `FTISU CodeLab - De bai` trong Drive; với `drive.file`, thư mục nên do ứng dụng tạo — để trống `GDRIVE_FOLDER_ID` nếu không chắc, file sẽ nằm ở gốc Drive.

## 5. Đặt biến trên Render (`cppdsa-api` → Environment)
| Biến | Giá trị |
|---|---|
| `STATEMENT_STORAGE` | `gdrive` |
| `GDRIVE_CLIENT_ID` | Client ID |
| `GDRIVE_CLIENT_SECRET` | Client secret |
| `GDRIVE_REFRESH_TOKEN` | Refresh token |
| `GDRIVE_FOLDER_ID` | (tùy chọn) |
| `MAX_STATEMENT_PDF_BYTES` | `10485760` (10 MB) |

## 6. Chạy migration 0003 trước khi deploy code T-0014
API trên Render khởi động bằng role `cppdsa_app` (không có quyền đổi cấu trúc bảng), nên migration phải chạy trước bằng `cppdsa_migrator` từ máy bạn — Claude sẽ mở sẵn script trong tab Terminal (như lần migrate đầu), bạn chỉ nhập mật khẩu. Sau đó Claude merge T-0014 và push để Render/Vercel tự deploy.

## Thu hồi khi cần
Google Account → Security → Third-party apps with account access → `FTISU CodeLab` → Remove access; hoặc xóa OAuth client trong Credentials. Sau đó tạo refresh token mới và cập nhật Render.
