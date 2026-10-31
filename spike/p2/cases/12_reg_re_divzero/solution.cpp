int main() {
    volatile int a = 0;
    volatile int b = 42 / a; // SIGFPE
    (void)b;
    return 0;
}
