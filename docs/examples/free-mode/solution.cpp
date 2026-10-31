#include <vector>
#include <unordered_map>
#include <algorithm>

// Sinh viên tự do đặt tên hàm theo ý mình: timChiSoTong
std::vector<int> timChiSoTong(const std::vector<int>& arr, int targetSum) {
    std::unordered_map<int, int> numMap;
    for (int i = 0; i < static_cast<int>(arr.size()); ++i) {
        int complement = targetSum - arr[i];
        if (numMap.find(complement) != numMap.end()) {
            int idx1 = numMap[complement];
            int idx2 = i;
            if (idx1 > idx2) std::swap(idx1, idx2);
            return {idx1, idx2};
        }
        numMap[arr[i]] = i;
    }
    return {};
}
