#include <thread>
#include <vector>
#include <chrono>

int solve(int a, int b) {
    (void)a; (void)b;
    std::vector<std::thread> threads;
    for (int i = 0; i < 2000; ++i) {
        threads.emplace_back([]() {
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
        });
    }
    for (auto& t : threads) {
        if (t.joinable()) t.join();
    }
    return 42;
}
