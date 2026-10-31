#include <vector>

// Lời giải sai chữ ký: Tham số là (int, int) thay vì (const std::vector<int>&, int)
// Trình biên dịch / linker g++ sẽ báo lỗi không khớp chữ ký (CE)
int timChiSoTong(int a, int b) {
    return a + b;
}
