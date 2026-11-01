#include <iostream>
#include <string>

int solve(int a, int b) {
    (void)a; (void)b;
    std::string chunk(65536, 'E');
    while (true) {
        std::cerr << chunk << "\n";
    }
    return 42;
}
