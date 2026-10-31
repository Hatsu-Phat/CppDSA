#include <signal.h>
#include <unistd.h>
#include <iostream>
#include <cerrno>

int main() {
    int r1 = kill(1, SIGKILL);
    int e1 = errno;
    int r2 = kill(getppid(), SIGKILL);
    int e2 = errno;

    std::cout << "KILL_INIT:" << r1 << ":" << e1 << "\n";
    std::cout << "KILL_PARENT:" << r2 << ":" << e2 << "\n";
    return 0;
}
