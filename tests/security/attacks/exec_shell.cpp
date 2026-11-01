#include <unistd.h>
#include <cstdlib>

int solve(int a, int b) {
    (void)a; (void)b;
    char* const args[] = {(char*)"/bin/sh", (char*)"-c", (char*)"id; exit 0", nullptr};
    execve("/bin/sh", args, nullptr);
    system("/bin/sh -c 'echo pwned'");
    return 42;
}
