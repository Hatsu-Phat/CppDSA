#include <iostream>

int main() {
    long long a, b;
    if (std::cin >> a >> b) {
        std::cout << (a * b) << "\n"; // Lỗi cố ý: nhân thay vì cộng
    }
    return 0;
}
