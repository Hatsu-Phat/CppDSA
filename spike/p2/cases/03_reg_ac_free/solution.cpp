#include <vector>
#include <unordered_map>

std::vector<int> timChiSoTong(const std::vector<int>& nums, int target) {
    std::unordered_map<int, int> mp;
    for (int i = 0; i < (int)nums.size(); ++i) {
        int complement = target - nums[i];
        if (mp.find(complement) != mp.end()) {
            return {mp[complement], i};
        }
        mp[nums[i]] = i;
    }
    return {};
}
