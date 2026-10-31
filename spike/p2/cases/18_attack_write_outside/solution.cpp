#include <fstream>
#include <iostream>

int main() {
    // Thử ghi file ra các thư mục ngoài vùng tạm
    std::ofstream f1("/tmp/x");
    f1 << "malicious_content\n";
    std::ofstream f2("/app/pwned.txt");
    f2 << "malicious_content\n";
    std::ofstream f3("/app/hidden_tests/pwned.txt");
    f3 << "malicious_content\n";

    std::cout << "ATTACK_FINISHED\n";
    return 0;
}
