#include <iostream>
#include <string>

int solve(int a, int b) {
    (void)a; (void)b;
    std::string chunk(65536, 'A');
    while (true) {
        std::cout << chunk << "\n";
    }
    return 42;
}
