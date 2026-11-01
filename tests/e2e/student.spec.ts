import { test, expect, Page } from '@playwright/test';

test.describe('Student End-to-End Workflow', () => {
  test.use({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });

  test('complete student journey: login, change password, view classrooms, TEMPLATE mode (all verdicts), FREE mode (all verdicts), history, anti-leak check, late submission, and mobile responsive', async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(300000); // 5 minutes for multi-student workflow

    // 0. Monitor console errors and unhandled page errors: 0 errors allowed
    const consoleErrors: string[] = [];
    const pageErrors: Error[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', (err) => {
      pageErrors.push(err);
    });

    const rootUrl = baseURL || 'http://localhost:3000';
    const runSuffix = Date.now().toString().slice(-4);
    const studentCodeA = `STU_A_${runSuffix}`;
    const studentEmailA = `student_a_${runSuffix}@cppdsa.local`;
    const studentCodeB = `STU_B_${runSuffix}`;
    const studentEmailB = `student_b_${runSuffix}@cppdsa.local`;
    const studentCodeC = `STU_C_${runSuffix}`;
    const studentEmailC = `student_c_${runSuffix}@cppdsa.local`;
    const studentCodeD = `STU_D_${runSuffix}`;
    const studentEmailD = `student_d_${runSuffix}@cppdsa.local`;
    const newStudentPassword = 'NewStudentPassword123!';

    // =========================================================================
    // 1. Data Setup via Lecturer API (using Playwright request)
    // =========================================================================
    // 1.1. Lecturer login
    const lecLoginRes = await request.post(`${rootUrl}/api/auth/login`, {
      data: { email: 'lecturer@cppdsa.local', password: 'ChangeMe123!' },
    });
    expect(lecLoginRes.status()).toBe(200);
    const lecCookie = lecLoginRes.headers()['set-cookie']?.split(';')[0];
    expect(lecCookie).toBeTruthy();

    // 1.2. Create Classroom
    const classRes = await request.post(`${rootUrl}/api/classrooms`, {
      headers: { cookie: lecCookie! },
      data: {
        name: `Lớp CTDL&GT K26 Sinh Viên E2E - ${runSuffix}`,
        description: 'Lớp phục vụ kiểm thử luồng sinh viên P7',
      },
    });
    expect(classRes.status()).toBe(201);
    const classData = await classRes.json();
    const classroomId = classData.classroom.id;
    expect(classroomId).toBeTruthy();

    // 1.3. Import 4 Students via CSV to respect rate limit (<= 5 submissions/min/student)
    const csvContent = [
      'student_code,full_name,email',
      `${studentCodeA},Nguyen Van SV A,${studentEmailA}`,
      `${studentCodeB},Tran Thi SV B,${studentEmailB}`,
      `${studentCodeC},Le Van SV C,${studentEmailC}`,
      `${studentCodeD},Pham Thi SV D,${studentEmailD}`,
    ].join('\n');

    const importRes = await request.post(
      `${rootUrl}/api/classrooms/${classroomId}/students/import`,
      {
        headers: { cookie: lecCookie!, 'Content-Type': 'application/json' },
        data: { csv: csvContent },
      }
    );
    expect(importRes.status()).toBe(200);
    const importData = await importRes.json();
    const createdStudents = importData.createdStudents || importData.students || [];

    const findStudent = (code: string) =>
      createdStudents.find((s: any) => s.studentCode === code || s.student_code === code);
    const getTempPwd = (s: any) => (s?.temporaryPassword || s?.temporary_password || '').trim();

    const tempPwdA = getTempPwd(findStudent(studentCodeA));
    const tempPwdB = getTempPwd(findStudent(studentCodeB));
    const tempPwdC = getTempPwd(findStudent(studentCodeC));
    const tempPwdD = getTempPwd(findStudent(studentCodeD));

    expect(tempPwdA.length).toBeGreaterThan(5);
    expect(tempPwdB.length).toBeGreaterThan(5);
    expect(tempPwdC.length).toBeGreaterThan(5);
    expect(tempPwdD.length).toBeGreaterThan(5);

    // 1.4. Create TEMPLATE mode assignment with hidden tests containing HIDDEN_MARK_P7
    const templateSource = `#include <iostream>
#include <vector>

struct ListNode {
    int val;
    ListNode* next;
    ListNode(int x) : val(x), next(nullptr) {}
};

// STUDENT_BEGIN reverseLinkedList
// Sinh viên cài đặt hàm reverseLinkedList tại đây
// STUDENT_END

int main() {
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(nullptr);

    int n;
    if (!(std::cin >> n)) return 0;
    if (n <= 0) {
        std::cout << "\\n";
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
    std::cout << "\\n";

    return 0;
}`;

    const assign1Res = await request.post(`${rootUrl}/api/classrooms/${classroomId}/assignments`, {
      headers: { cookie: lecCookie! },
      data: {
        title: 'Đảo ngược danh sách liên kết đơn',
        description: 'Cài đặt hàm reverseLinkedList để đảo ngược danh sách liên kết đơn.',
        mode: 'TEMPLATE',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        deadline: '2028-12-31T23:59:00Z',
        templateCode: templateSource,
      },
    });
    expect(assign1Res.status()).toBe(201);
    const assign1Data = await assign1Res.json();
    const assign1Id = assign1Data.assignment.id;

    // Add ≥ 2 hidden tests for Assignment 1 with HIDDEN_MARK_P7 in input
    await request.post(`${rootUrl}/api/assignments/${assign1Id}/tests`, {
      headers: { cookie: lecCookie! },
      data: {
        inputData: '4\n1 2 3 4\nHIDDEN_MARK_P7_TEMPLATE_TEST_1\n',
        expectedOutput: '4 3 2 1\n',
        isHidden: true,
        orderIndex: 0,
      },
    });

    await request.post(`${rootUrl}/api/assignments/${assign1Id}/tests`, {
      headers: { cookie: lecCookie! },
      data: {
        inputData: '5\n10 20 30 40 50\nHIDDEN_MARK_P7_TEMPLATE_TEST_2\n',
        expectedOutput: '50 40 30 20 10\n',
        isHidden: true,
        orderIndex: 1,
      },
    });

    // 1.5. Create FREE mode assignment with hidden tests containing HIDDEN_MARK_P7
    // Using CPPDSA_ENTRY macro so that changing entry point name appropriately affects compilation
    const freeHarness = `#include <iostream>
#include <vector>

std::vector<int> CPPDSA_ENTRY(const std::vector<int>&, int);

int main() {
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(nullptr);

    int n, target;
    if (!(std::cin >> n >> target)) return 0;
    std::vector<int> nums(n);
    for (int i = 0; i < n; ++i) {
        std::cin >> nums[i];
    }

    std::vector<int> result = CPPDSA_ENTRY(nums, target);

    if (result.empty()) {
        std::cout << "-1\\n";
    } else {
        for (size_t i = 0; i < result.size(); ++i) {
            std::cout << result[i] << (i + 1 < result.size() ? " " : "");
        }
        std::cout << "\\n";
    }

    return 0;
}`;

    const assign2Res = await request.post(`${rootUrl}/api/classrooms/${classroomId}/assignments`, {
      headers: { cookie: lecCookie! },
      data: {
        title: 'Two Sum (Tìm hai chỉ số có tổng bằng target)',
        description: 'Cài đặt hàm timChiSoTong trả về 2 chỉ số có tổng bằng target.',
        mode: 'FREE',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        deadline: '2028-12-31T23:59:00Z',
        entryPointSpec: {
          harness: freeHarness,
          entry: {
            type: 'function',
            name: 'timChiSoTong',
          },
        },
      },
    });
    expect(assign2Res.status()).toBe(201);
    const assign2Data = await assign2Res.json();
    const assign2Id = assign2Data.assignment.id;

    // Add ≥ 2 hidden tests for Assignment 2 with HIDDEN_MARK_P7 in input
    await request.post(`${rootUrl}/api/assignments/${assign2Id}/tests`, {
      headers: { cookie: lecCookie! },
      data: {
        inputData: '4 9\n2 7 11 15\nHIDDEN_MARK_P7_FREE_TEST_1\n',
        expectedOutput: '0 1\n',
        isHidden: true,
        orderIndex: 0,
      },
    });

    await request.post(`${rootUrl}/api/assignments/${assign2Id}/tests`, {
      headers: { cookie: lecCookie! },
      data: {
        inputData: '5 10\n2 3 5 7 11\nHIDDEN_MARK_P7_FREE_TEST_2\n',
        expectedOutput: '1 3\n',
        isHidden: true,
        orderIndex: 1,
      },
    });

    // 1.6. Create Past-Deadline Assignment
    const assign3Res = await request.post(`${rootUrl}/api/classrooms/${classroomId}/assignments`, {
      headers: { cookie: lecCookie! },
      data: {
        title: 'Bài tập Quá hạn (Luyện tập sau deadline)',
        description: 'Bài tập này có deadline trong quá khứ để kiểm thử nộp trễ.',
        mode: 'TEMPLATE',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        deadline: '2020-01-01T00:00:00Z',
        templateCode: templateSource,
      },
    });
    expect(assign3Res.status()).toBe(201);
    const assign3Data = await assign3Res.json();
    const assign3Id = assign3Data.assignment.id;

    await request.post(`${rootUrl}/api/assignments/${assign3Id}/tests`, {
      headers: { cookie: lecCookie! },
      data: {
        inputData: '4\n1 2 3 4\nHIDDEN_MARK_P7_PAST_TEST_1\n',
        expectedOutput: '4 3 2 1\n',
        isHidden: true,
        orderIndex: 0,
      },
    });

    // Helper to wait for live polling completion
    const waitForCompleted = async (p: Page, timeoutMs = 30000) => {
      await expect(p.getByTestId('submission-status')).toContainText(/Đã chấm xong|Lỗi hệ thống/i, {
        timeout: timeoutMs,
      });
    };

    // Helper to submit solution, wait for 201 response, then wait for polling completion
    const submitAndWait = async (p: Page, timeoutMs = 30000) => {
      const subPromise = p.waitForResponse(
        (resp) => resp.url().includes('/submissions') && resp.status() === 201
      );
      await p.getByTestId('submit-solution-btn').click();
      await subPromise;
      await waitForCompleted(p, timeoutMs);
    };

    // Helper for student login and first-time password change
    const loginAndChangePassword = async (email: string, tempPwd: string) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: /Đăng nhập CppDSA/i })).toBeVisible();

      await page.locator('#email').fill(email);
      await page.locator('#password').fill(tempPwd.trim());
      await page.getByRole('button', { name: 'Đăng nhập' }).click();

      // Forced redirect to /change-password
      await page.waitForURL('**/change-password');
      await expect(page.getByRole('heading', { name: /Đổi mật khẩu/i })).toBeVisible();

      await page.locator('#oldPassword').fill(tempPwd.trim());
      await page.locator('#newPassword').fill(newStudentPassword);
      await page.locator('#confirmPassword').fill(newStudentPassword);
      await page.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();

      // After password change, student is redirected to /student
      await page.waitForURL('**/student');
      await expect(page.getByRole('heading', { name: /Lớp học của tôi/i })).toBeVisible();
    };

    // Helper for student logout
    const logout = async () => {
      const logoutBtn = page.getByTestId('logout-btn');
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForURL('**/login');
      } else {
        await page.goto('/login');
      }
      await page.context().clearCookies();
    };

    // Shared solutions
    const solutionAC = `ListNode* reverseLinkedList(ListNode* head) {
    ListNode* prev = nullptr;
    ListNode* curr = head;
    while (curr != nullptr) {
        ListNode* nextNode = curr->next;
        curr->next = prev;
        prev = curr;
        curr = nextNode;
    }
    return prev;
}`;

    const solutionWA = `ListNode* reverseLinkedList(ListNode* head) {
    return head;
}`;

    const solutionCE = `ListNode* reverseLinkedList(ListNode* head) {
    this_is_an_intentional_compile_error_xyz;
    return nullptr;
}`;

    const solutionTLE = `ListNode* reverseLinkedList(ListNode* head) {
    while (true) {}
    return head;
}`;

    const solutionMLE = `#include <new>
ListNode* reverseLinkedList(ListNode* head) {
    throw std::bad_alloc();
    return head;
}`;

    const solutionRE = `#include <cstdlib>
ListNode* reverseLinkedList(ListNode* head) {
    std::abort();
    return head;
}`;

    // =========================================================================
    // 2. Student A Journey: TEMPLATE Mode (AC, WA, CE)
    // =========================================================================
    await loginAndChangePassword(studentEmailA, tempPwdA);

    // Check navbar shows student branding and email
    await expect(page.getByTestId('user-email-display')).toContainText(studentEmailA);
    // Warmup button must NOT be visible for student
    await expect(page.locator('[data-testid="warmup-btn"]')).not.toBeVisible();

    // Enter Classroom
    await page.getByTestId(`enter-classroom-${classroomId}`).click();
    await page.waitForURL(`**/student/classrooms/${classroomId}`);
    await expect(page.getByTestId('classroom-title')).toContainText(
      `Lớp CTDL&GT K26 Sinh Viên E2E - ${runSuffix}`
    );

    // Enter TEMPLATE Mode Assignment
    await page.getByTestId(`assignment-link-${assign1Id}`).click();
    await page.waitForURL(`**/student/assignments/${assign1Id}`);
    await expect(page.getByTestId('assignment-title')).toContainText(
      'Đảo ngược danh sách liên kết đơn'
    );
    await expect(page.getByTestId('assignment-mode-badge')).toContainText('TEMPLATE');

    // Verify fixed code blocks are locked (pre blocks, not input/textarea)
    const fixedSegments = page.locator('[data-testid="fixed-code-segment"]');
    const fixedCount = await fixedSegments.count();
    expect(fixedCount).toBeGreaterThan(0);
    for (let i = 0; i < fixedCount; i++) {
      const tagName = await fixedSegments.nth(i).evaluate((el) => el.tagName.toLowerCase());
      expect(tagName).toBe('pre');
    }

    // Editable region textarea
    const regionInputA = page.getByTestId('region-input-reverseLinkedList');
    await expect(regionInputA).toBeVisible();

    // 2.1. Submit CORRECT solution -> AC (Score 1.00)
    await regionInputA.fill(solutionAC);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('AC');
    await expect(page.getByTestId('submission-score')).toContainText('1.00');
    await expect(page.getByTestId('test-verdict-1')).toContainText('AC');
    await expect(page.getByTestId('test-verdict-2')).toContainText('AC');

    // 2.2. Submit WRONG solution -> WA
    await regionInputA.fill(solutionWA);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('WA');
    await expect(page.getByTestId('submission-score')).toContainText('0.00');

    // 2.3. Submit SYNTAX ERROR -> CE with compile output
    await regionInputA.fill(solutionCE);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('CE');
    await expect(page.getByTestId('compile-output')).toBeVisible();
    await expect(page.getByTestId('compile-output')).toContainText('error');

    // Verify SV-A history table has 3 rows
    await expect(page.getByTestId('submission-history')).toBeVisible();
    const historyRowsA = page.locator('[data-testid^="history-row-"]');
    expect(await historyRowsA.count()).toBe(3);

    // Anti-leak check for SV-A on Assignment 1
    const pageContentA = await page.content();
    expect(pageContentA).not.toContain('HIDDEN_MARK_P7');

    await logout();

    // =========================================================================
    // 3. Student B Journey: TEMPLATE Mode (TLE, MLE, RE)
    // =========================================================================
    await loginAndChangePassword(studentEmailB, tempPwdB);

    await page.getByTestId(`enter-classroom-${classroomId}`).click();
    await page.waitForURL(`**/student/classrooms/${classroomId}`);
    await page.getByTestId(`assignment-link-${assign1Id}`).click();
    await page.waitForURL(`**/student/assignments/${assign1Id}`);

    const regionInputB = page.getByTestId('region-input-reverseLinkedList');

    // 3.1. Submit INFINITE LOOP -> TLE
    await regionInputB.fill(solutionTLE);
    await submitAndWait(page, 45000);
    await expect(page.getByTestId('submission-verdict')).toContainText('TLE');

    // 3.2. Submit LARGE ALLOCATION / BAD_ALLOC -> MLE
    await regionInputB.fill(solutionMLE);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('MLE');

    // 3.3. Submit ABORT / RUNTIME ERROR -> RE
    await regionInputB.fill(solutionRE);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('RE');

    // Verify SV-B history table has 3 rows
    await expect(page.getByTestId('submission-history')).toBeVisible();
    const historyRowsB = page.locator('[data-testid^="history-row-"]');
    expect(await historyRowsB.count()).toBe(3);

    // Anti-leak check for SV-B
    const pageContentB = await page.content();
    expect(pageContentB).not.toContain('HIDDEN_MARK_P7');

    await logout();

    // =========================================================================
    // 4. Student C Journey: FREE Mode (AC, WA, CE/Wrong Entry)
    // =========================================================================
    await loginAndChangePassword(studentEmailC, tempPwdC);

    await page.getByTestId(`enter-classroom-${classroomId}`).click();
    await page.waitForURL(`**/student/classrooms/${classroomId}`);
    await page.getByTestId(`assignment-link-${assign2Id}`).click();
    await page.waitForURL(`**/student/assignments/${assign2Id}`);
    await expect(page.getByTestId('assignment-title')).toContainText('Two Sum');
    await expect(page.getByTestId('assignment-mode-badge')).toContainText('FREE');

    const freeAC = `#include <vector>
#include <unordered_map>
#include <algorithm>

std::vector<int> timChiSoTong(const std::vector<int>& arr, int targetSum) {
    std::unordered_map<int, int> numMap;
    for (int i = 0; i < static_cast<int>(arr.size()); ++i) {
        int complement = targetSum - arr[i];
        if (numMap.find(complement) != numMap.end()) {
            int idx1 = numMap[complement];
            int idx2 = i;
            if (idx1 > idx2) std::swap(idx1, idx2);
            return {idx1, idx2};
        }
        numMap[arr[i]] = i;
    }
    return {};
}`;

    // 4.1. Submit CORRECT solution with valid function entry -> AC
    await page.getByTestId('free-source-input').fill(freeAC);
    await page.getByTestId('entry-type-select').selectOption('function');
    await page.getByTestId('entry-name-input').fill('timChiSoTong');
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('AC');
    await expect(page.getByTestId('submission-score')).toContainText('1.00');

    // 4.2. Submit WRONG answer -> WA
    const freeWA = `#include <vector>
std::vector<int> timChiSoTong(const std::vector<int>& nums, int target) {
    return {0, 0};
}`;
    await page.getByTestId('free-source-input').fill(freeWA);
    await page.getByTestId('entry-type-select').selectOption('function');
    await page.getByTestId('entry-name-input').fill('timChiSoTong');
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('WA');
    await expect(page.getByTestId('submission-score')).toContainText('0.00');

    // 4.3. Submit wrong entry point name -> CE
    await page.getByTestId('free-source-input').fill(freeAC);
    await page.getByTestId('entry-type-select').selectOption('function');
    await page.getByTestId('entry-name-input').fill('wrongEntryFunctionName');
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('CE');

    // Verify SV-C history table has 3 rows
    await expect(page.getByTestId('submission-history')).toBeVisible();
    const historyRowsC = page.locator('[data-testid^="history-row-"]');
    expect(await historyRowsC.count()).toBe(3);

    // CRITICAL: AC-US-15-3 Hidden test data leak check on the entire page content
    const pageContentFree = await page.content();
    expect(pageContentFree).not.toContain('HIDDEN_MARK_P7');

    // Check Assignment 1 page content as well
    await page.goto(`/student/assignments/${assign1Id}`);
    await page.waitForLoadState('networkidle');
    const pageContentTemplate = await page.content();
    expect(pageContentTemplate).not.toContain('HIDDEN_MARK_P7');

    await logout();

    // =========================================================================
    // 5. Student D Journey: Mobile Responsive Viewport (390x844) & Late Submission
    // =========================================================================
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAndChangePassword(studentEmailD, tempPwdD);

    // Enter Classroom and Assignment 1 on mobile
    await page.getByTestId(`enter-classroom-${classroomId}`).click();
    await page.waitForURL(`**/student/classrooms/${classroomId}`);
    await page.getByTestId(`assignment-link-${assign1Id}`).click();
    await page.waitForURL(`**/student/assignments/${assign1Id}`);
    await page.waitForLoadState('networkidle');

    // Check no horizontal scroll on mobile viewport
    const isNoHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    expect(isNoHorizontalScroll).toBe(true);

    // Submit button is clickable on mobile
    const submitBtnMobile = page.getByTestId('submit-solution-btn');
    await expect(submitBtnMobile).toBeVisible();

    // Mobile submission for TEMPLATE correct solution -> AC
    const regionInputD = page.getByTestId('region-input-reverseLinkedList');
    await regionInputD.fill(solutionAC);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('AC');
    await expect(page.getByTestId('submission-score')).toContainText('1.00');

    const isNoHorizontalScrollAfter = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    expect(isNoHorizontalScrollAfter).toBe(true);

    // 5.2. Past-Deadline Assignment: Late Submission Badge Check
    await page.goto(`/student/assignments/${assign3Id}`);
    await page.waitForURL(`**/student/assignments/${assign3Id}`);
    await expect(page.getByTestId('assignment-late-notice')).toBeVisible();

    const pastTemplateRegion = page.getByTestId('region-input-reverseLinkedList');
    await pastTemplateRegion.fill(solutionAC);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('AC');

    // Result card displays "Nộp trễ" badge
    await expect(page.getByTestId('badge-late')).toBeVisible();
    await expect(page.getByTestId('badge-late')).toContainText('Nộp trễ');

    // History table also shows "Nộp trễ" badge
    const historyLateBadge = page.locator('[data-testid^="history-late-"]').first();
    await expect(historyLateBadge).toBeVisible();
    await expect(historyLateBadge).toContainText('Nộp trễ');

    // Anti-leak check for assignment 3
    const pageContentLate = await page.content();
    expect(pageContentLate).not.toContain('HIDDEN_MARK_P7');

    // =========================================================================
    // 6. Assert 0 Console Errors and 0 Page Errors
    // =========================================================================
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
