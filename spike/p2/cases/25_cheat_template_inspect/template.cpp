#include <iostream>
#include <vector>

struct ListNode {
    int val;
    ListNode* next;
    ListNode(int x) : val(x), next(nullptr) {}
};

// =========================================================================
// KHU VỰC DÀNH CHO SINH VIÊN
// =========================================================================
// STUDENT_BEGIN reverseLinkedList
// Sinh viên cài đặt hàm reverseLinkedList tại đây
// STUDENT_END
// =========================================================================

int main() {
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(nullptr);

    int n;
    if (!(std::cin >> n)) return 0;
    if (n <= 0) {
        std::cout << "\n";
        return 0;
    }

    ListNode* head = nullptr;
    ListNode* tail = nullptr;
    for (int i = 0; i < n; ++i) {
        int x;
        std::cin >> x;
        ListNode* node = new ListNode(x);
        if (!head) {
            head = tail = node;
        } else {
            tail->next = node;
            tail = node;
        }
    }

    head = reverseLinkedList(head);

    ListNode* curr = head;
    while (curr != nullptr) {
        std::cout << curr->val << (curr->next ? " " : "");
        ListNode* tmp = curr;
        curr = curr->next;
        delete tmp;
    }
    std::cout << "\n";

    return 0;
}
