template <int N>
struct RecursiveBomb {
    using type = typename RecursiveBomb<N + 1>::type;
};

int solve(int a, int b) {
    (void)a;
    (void)b;
    typename RecursiveBomb<0>::type x;
    (void)x;
    return 42;
}

