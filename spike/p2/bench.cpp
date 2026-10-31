#include <iostream>

int main() {
    // Deterministic CPU-bound computation (~0.3-0.5 s)
    long long count = 0;
    const int limit = 2000000;
    for (int i = 2; i <= limit; ++i) {
        bool prime = true;
        for (int j = 2; j * j <= i; ++j) {
            if (i % j == 0) {
                prime = false;
                break;
            }
        }
        if (prime) {
            count++;
        }
    }
    std::cout << count << "\n";
    return 0;
}
