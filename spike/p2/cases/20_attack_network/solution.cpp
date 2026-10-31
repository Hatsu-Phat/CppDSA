#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <iostream>
#include <cerrno>

int main() {
    // 1. Thử mở TCP socket tới 1.1.1.1:80
    int s = socket(AF_INET, SOCK_STREAM, 0);
    if (s < 0) {
        std::cout << "SOCKET_BLOCKED\n";
    } else {
        std::cout << "SOCKET_ALLOWED\n";
    }

    // 2. Thử truy vấn DNS tới hostname example.com
    struct addrinfo hints{}, *res = nullptr;
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    int err = getaddrinfo("example.com", "80", &hints, &res);
    if (err != 0) {
        std::cout << "DNS_BLOCKED\n";
    } else {
        std::cout << "DNS_ALLOWED\n";
    }

    return 0;
}
