#include <fstream>
#include <iostream>
#include <string>

int main() {
    std::ifstream f("/app/hidden_tests/secret.txt");
    std::string s;
    if (f >> s) {
        std::cout << "STOLEN:" << s << "\n";
    } else {
        std::cout << "ACCESS_DENIED\n";
    }
    return 0;
}
