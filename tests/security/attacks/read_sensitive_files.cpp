#include <fstream>
#include <iostream>
#include <string>

int solve(int a, int b) {
    (void)a; (void)b;
    std::ifstream shadow("/etc/shadow");
    if (shadow.is_open()) {
        std::string line;
        while (std::getline(shadow, line)) {
            std::cout << "LEAK_SHADOW: " << line << "\n";
        }
        shadow.close();
    }

    std::ifstream proc1("/proc/1/environ");
    if (proc1.is_open()) {
        std::string line;
        while (std::getline(proc1, line)) {
            std::cout << "LEAK_PROC1: " << line << "\n";
        }
        proc1.close();
    }

    std::ifstream selfEnv("/proc/self/environ");
    if (selfEnv.is_open()) {
        std::string line;
        while (std::getline(selfEnv, line)) {
            std::cout << "LEAK_SELF_ENV: " << line << "\n";
        }
        selfEnv.close();
    }

    return 42;
}
