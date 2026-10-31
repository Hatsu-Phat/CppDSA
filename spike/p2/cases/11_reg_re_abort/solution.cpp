#include <stdexcept>

int main() {
    throw std::runtime_error("Unhandled C++ exception causing abort");
    return 0;
}
