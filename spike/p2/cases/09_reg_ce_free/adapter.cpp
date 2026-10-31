#include <iostream>
#include <vector>

// Yêu cầu chữ ký: std::vector<int> timChiSoTong(const std::vector<int>&, int);
std::vector<int> timChiSoTong(const std::vector<int>&, int);

int main() {
    std::vector<int> nums = {1, 2};
    std::vector<int> res = timChiSoTong(nums, 3);
    return 0;
}
