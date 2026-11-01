char huge_buffer[200 * 1024 * 1024] = {1};

int solve(int a, int b) {
    return a + b + huge_buffer[0];
}
