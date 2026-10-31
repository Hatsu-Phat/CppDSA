#include <iostream>
#include <cstdlib>

int main() {
    const char* sec = std::getenv("GRADER_SECRET");
    if (sec) {
        std::cout << "SECRET_FOUND:" << sec << "\n";
    } else {
        std::cout << "SECRET_NOT_FOUND\n";
    }
    return 0;
}
