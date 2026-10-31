# Hợp đồng chấm chế độ có Template (Template Mode Contract)

Thư mục này minh họa cách thức vận hành, cấu trúc tệp và cơ chế ghép mã nguồn (code stitching) cho chế độ bài tập có Template trong hệ thống CppDSA.

---

## 1. Cấu trúc bài toán ví dụ

- **Đề bài:** "Cài đặt hàm đảo ngược danh sách liên kết đơn".
- **Khung mẫu (`template.cpp`):**
  - Giảng viên định nghĩa cấu trúc `ListNode`, khai báo hàm kiểm tra, hàm `main()` xử lý nhập/xuất và giải phóng bộ nhớ.
  - Vùng sinh viên được giới hạn bởi cặp chú thích đặc biệt:
    ```cpp
    // STUDENT_BEGIN reverseLinkedList
    // Sinh viên cài đặt hàm reverseLinkedList tại đây
    // STUDENT_END
    ```
- **Lời giải của sinh viên (`solution.cpp`):**
  - Sinh viên chỉ viết định nghĩa hàm `ListNode* reverseLinkedList(ListNode* head)`.
- **Bộ test ẩn (`tests/`):**
  - Chứa các cặp input và output chuẩn (`test1.in` / `test1.out`, `test2.in` / `test2.out`).

---

## 2. Quy trình ghép mã nguồn (Stitching Process)

1. **Phía Trình duyệt (Client-side):**
   - Trình soạn thảo Monaco Editor trên giao diện sinh viên chỉ cho phép nhập/chỉnh sửa mã nguồn bên trong vùng `reverseLinkedList`.
   - Khi bấm Nộp bài, client chỉ gửi một payload chứa nội dung của vùng được sửa:
     ```json
     {
       "regions": {
         "reverseLinkedList": "ListNode* reverseLinkedList(ListNode* head) { ... }"
       }
     }
     ```
   - Client không gửi toàn bộ mã nguồn template để tiết kiệm băng thông và ngăn chặn hành vi giả mạo.

2. **Phía Máy chủ / Grader (Server-side):**
   - Grader nạp tệp `template.cpp` gốc được lưu trữ trong cơ sở dữ liệu (`assignments.template_code`).
   - Tìm kiếm mẫu regex tương ứng với từng vùng:
     ```regex
     \/\/ STUDENT_BEGIN reverseLinkedList[\s\S]*?\/\/ STUDENT_END
     ```
   - Thay thế toàn bộ đoạn bên trong bằng:
     ```cpp
     // STUDENT_BEGIN reverseLinkedList
     <mã nguồn sinh viên gửi lên>
     // STUDENT_END
     ```
   - Lưu mã nguồn đã ghép hoàn chỉnh ra tệp nguồn tạm thời trong `/tmp` và tiến hành biên dịch:
     ```bash
     g++ -std=c++17 -O2 stitched_solution.cpp -o solution_bin
     ```

3. **Bảo đảm an ninh và toàn vẹn:**
   - Mã nguồn hàm `main()` và các hàm kiểm tra được giữ nguyên vẹn 100% từ template gốc.
   - Nếu sinh viên cố ý khai báo macro hoặc đóng ngoặc nhọn để làm gián đoạn hàm `main()`, chương trình sẽ bị lỗi biên dịch (`CE`) hoặc chạy sai logic (`WA`), không thể làm hại hệ thống vì việc so sánh kết quả được thực hiện hoàn toàn bên ngoài bởi Node.js worker.
