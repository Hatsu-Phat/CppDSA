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
    ListNode* head = new ListNode(1);
    head = reverseLinkedList(head);
    delete head;
    return 0;
}
