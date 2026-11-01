#include <fstream>
#include <string>

int solve(int a, int b) {
    (void)a; (void)b;
    std::string chunk(1024 * 1024, 'Z');
    std::ofstream out("huge_disk_file.bin", std::ios::binary);
    for (int i = 0; i < 500; ++i) {
        out.write(chunk.data(), chunk.size());
        out.flush();
    }
    return 42;
}
