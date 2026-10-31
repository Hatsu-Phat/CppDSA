#include <iostream>
#include <vector>

// Forward declaration của hàm do sinh viên khai báo điểm vào: timChiSoTong
std::vector<int> timChiSoTong(const std::vector<int>&, int);

int main() {
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(nullptr);

    int n, target;
    if (!(std::cin >> n >> target)) return 0;
    std::vector<int> nums(n);
    for (int i = 0; i < n; ++i) {
        std::cin >> nums[i];
    }

    std::vector<int> result = timChiSoTong(nums, target);

    if (result.empty()) {
        std::cout << "-1\n";
    } else {
        for (size_t i = 0; i < result.size(); ++i) {
            std::cout << result[i] << (i + 1 < result.size() ? " " : "");
        }
        std::cout << "\n";
    }

    return 0;
}
