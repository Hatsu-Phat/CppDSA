# Hợp đồng chấm chế độ tự do (Free Mode Contract)

Thư mục này đặc tả hợp đồng tương tác, cấu trúc dữ liệu và quy trình sinh adapter cho chế độ bài tập Free Mode trong hệ thống CppDSA.

---

## 1. Mục tiêu và Nguyên lý hoạt động

- **Mục tiêu sư phạm:** Sinh viên được rèn luyện kỹ năng tự thiết kế, tự đặt tên hàm và tổ chức cấu trúc mã nguồn C++ mà không bị gò bó vào tên hàm cố định hay template cứng nhắc. Đồng thời không bắt buộc sinh viên phải tự viết mã đọc `std::cin` và in `std::cout`.
- **Cơ chế "Khai báo điểm vào" (Entry Point Declaration):**
  1. Đề bài công bố đặc tả giao diện (`interface_spec.json`) gồm kiểu dữ liệu tham số và kiểu dữ liệu trả về.
  2. Sinh viên viết mã nguồn hoàn chỉnh với tên hàm/lớp tự do.
  3. Khi nộp bài, sinh viên khai báo tên hàm (hoặc tên lớp + phương thức) tương ứng trong trường điểm vào (`entry_point.json`).
  4. Hệ thống Grader tự động sinh mã `adapter.cpp` bọc lấy hàm của sinh viên để thực hiện đọc input từ test case, gọi hàm giải thuật và in kết quả chuẩn mực ra output.

---

## 2. Các thành phần trong ví dụ

1. **Đặc tả giao diện (`interface_spec.json`):**
   - Kiểu trả về: `std::vector<int>`
   - Tham số: `const std::vector<int>& nums, int target`
2. **Lời giải đúng của sinh viên (`solution.cpp`):**
   - Sinh viên tự chọn tên hàm là `timChiSoTong`.
   - Cài đặt thuật toán bảng băm `std::unordered_map` chính xác, kỳ vọng AC mọi test.
3. **Lời giải thay thế của sinh viên (`solution_alt.cpp`):**
   - Thuật toán brute-force $O(n^2)$ kiểm tra từng cặp chỉ số `(i, j)` với `i < j`.
   - Đúng chữ ký hàm và tên hàm theo khai báo `timChiSoTong`, kỳ vọng AC mọi test.
4. **Khai báo điểm vào (`entry_point.json`):**
   - `{ "entry_type": "function", "entry_name": "timChiSoTong" }`
5. **Adapter sinh bởi Grader (`adapter.cpp`):**
   - Khai báo forward declaration hàm `std::vector<int> timChiSoTong(const std::vector<int>&, int);`
   - Cung cấp hàm `main()` đọc mảng số nguyên và target từ test case, gọi `timChiSoTong(...)`, định dạng và in kết quả.
6. **Bộ test ẩn (`tests/`):**
   - `test1.in` / `test1.out`: Mảng `[2, 7, 11, 15]`, target 9 -> Kết quả `0 1`.
   - `test2.in` / `test2.out`: Mảng `[2, 3, 5, 7, 11]`, target 10 -> Đáp án duy nhất `1 3` (`3 + 7 = 10`).
   - **Quy tắc đơn nghiệm:** Mọi hidden test trong Free Mode (với bộ so sánh output mặc định của MVP) phải có đúng một đáp án duy nhất; nếu bài toán có nhiều nghiệm hợp lệ thì cần checker riêng (ngoài phạm vi MVP).
7. **Ca kiểm thử lỗi:**
   - `solution_ce.cpp`: Sinh viên cài đặt hàm `timChiSoTong(int, int)` sai kiểu tham số -> Gây lỗi biên dịch/liên kết (Compilation Error - CE).
   - `solution_wa.cpp`: Sinh viên cài đặt đúng chữ ký nhưng trả về `{0, 0}` -> Gây lỗi sai kết quả (Wrong Answer - WA).

---

## 3. Quy trình biên dịch và thực thi

Tại Grader, lệnh biên dịch kết hợp mã sinh viên và adapter:
```bash
g++ -std=c++17 -O2 solution.cpp adapter.cpp -o solution_bin
```
- Nếu biên dịch thất bại: Trả về verdict `CE`.
- Nếu biên dịch thành công: Chạy tệp thực thi `solution_bin` lần lượt với các tệp `.in` của test ẩn, so sánh stdout với `.out`.
- Nếu kết quả khớp: Trả về `AC`.
- Nếu kết quả lệch: Trả về `WA`.
