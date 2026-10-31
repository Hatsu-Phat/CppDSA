#include <iostream>
#include <vector>

int main() {
    // Giới hạn bộ nhớ là 64 MB (67,108,864 bytes).
    // Cấp phát các khối 1 MB và chạm (touch) từng trang bộ nhớ cho đến khi vượt ngưỡng.
    std::vector<int*> chunks;
    try {
        for (int i = 0; i < 200; ++i) { // Tối đa 200 MB
            int* p = new int[256 * 1024]; // 1 MB
            for (int j = 0; j < 256 * 1024; j += 1024) {
                p[j] = i + j;
            }
            chunks.push_back(p);
        }
        std::cout << "Allocated " << chunks.size() << " MB\n";
    } catch (const std::bad_alloc& e) {
        std::cerr << "std::bad_alloc: memory limit exceeded\n";
        return 134; // Thoát với mã lỗi tương ứng SIGABRT cho MLE
    }
    return 0;
}
