#include <vector>

// Thuật toán thay thế: Brute-force O(n^2)
// Chữ ký hàm khớp với giao diện yêu cầu, tên hàm theo entry_point.json: timChiSoTong
std::vector<int> timChiSoTong(const std::vector<int>& arr, int targetSum) {
    int n = static_cast<int>(arr.size());
    for (int i = 0; i < n; ++i) {
        for (int j = i + 1; j < n; ++j) {
            if (arr[i] + arr[j] == targetSum) {
                return {i, j};
            }
        }
    }
    return {};
}
