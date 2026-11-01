#include <vector>
#include <cstdlib>

int solve(int a, int b) {
    (void)a; (void)b;
    std::vector<std::vector<char>> big;
    while (true) {
        big.emplace_back(10 * 1024 * 1024, 0x41);
    }
    return 42;
}
