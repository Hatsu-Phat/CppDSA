import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Student End-to-End Workflow', () => {
  test.use({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });

  test('complete student journey: home screenshots, login, change password, account, TEMPLATE mode, FREE mode, history tabs, anti-leak check, late submission, and mobile responsive', async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(300000); // 5 minutes

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

    // Ensure reports/ui directory exists
    const reportsDir = path.resolve(process.cwd(), 'reports/ui');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // =========================================================================
    // 0. Home Page & Screenshots (Light, Dark, Mobile) & Login Screenshot
    // =========================================================================
    // 0.1. Home Light
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
    });
    await expect(page.getByText('FTISU CodeLab').first()).toBeVisible();
    await page.screenshot({ path: 'reports/ui/home-light.png' });

    // 0.2. Home Dark via Theme Toggle
    const themeBtn = page.getByTestId('theme-toggle-btn');
    await themeBtn.click();
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-theme') === 'dark'
    );
    await page.evaluate(async () => {
      const animations = document.getAnimations();
      await Promise.all(animations.map((a) => a.finished));
    });
    await page.waitForTimeout(100);
    await page.screenshot({ path: 'reports/ui/home-dark.png' });

    // Reset back to light
    await themeBtn.click();
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-theme') === 'light'
    );
    await page.evaluate(async () => {
      const animations = document.getAnimations();
      await Promise.all(animations.map((a) => a.finished));
    });
    await page.waitForTimeout(100);

    // 0.3. Home Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const isHomeMobileNoScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    expect(isHomeMobileNoScroll).toBe(true);
    await page.screenshot({ path: 'reports/ui/home-mobile.png' });

    // 0.4. Login Screenshot
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Đăng nhập/i })).toBeVisible();
    await page.screenshot({ path: 'reports/ui/login.png' });

    // =========================================================================
    // 1. Data Setup via Lecturer API
    // =========================================================================
    const lecLoginRes = await request.post(`${rootUrl}/api/auth/login`, {
      data: { email: 'lecturer@cppdsa.local', password: 'ChangeMe123!' },
    });
    expect(lecLoginRes.status()).toBe(200);
    const lecCookie = lecLoginRes.headers()['set-cookie']?.split(';')[0];
    expect(lecCookie).toBeTruthy();

    const classRes = await request.post(`${rootUrl}/api/classrooms`, {
      headers: { cookie: lecCookie! },
      data: {
        name: `Lớp CTDL&GT K26 Sinh Viên E2E - ${runSuffix}`,
        description: 'Lớp phục vụ kiểm thử luồng sinh viên T-0013',
      },
    });
    expect(classRes.status()).toBe(201);
    const classData = await classRes.json();
    const classroomId = classData.classroom.id;
    expect(classroomId).toBeTruthy();

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

    // 1.1. Create TEMPLATE mode assignment
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

    // Add hidden tests with HIDDEN_MARK_P7
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

    // 1.2. Create FREE mode assignment (without harness, full program with main)
    const assign2Res = await request.post(`${rootUrl}/api/classrooms/${classroomId}/assignments`, {
      headers: { cookie: lecCookie! },
      data: {
        title: 'Two Sum (Tìm hai chỉ số có tổng bằng target)',
        description: 'Đọc n và target, sau đó in ra 2 chỉ số có tổng bằng target.',
        mode: 'FREE',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        deadline: '2028-12-31T23:59:00Z',
      },
    });
    expect(assign2Res.status()).toBe(201);
    const assign2Data = await assign2Res.json();
    const assign2Id = assign2Data.assignment.id;

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

    // 1.3. Create Past-Deadline Assignment
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

    // Polling waiter
    const waitForCompleted = async (p: Page, timeoutMs = 30000) => {
      await expect(p.getByTestId('submission-status')).toContainText(/Đã chấm xong|Lỗi hệ thống/i, {
        timeout: timeoutMs,
      });
    };

    // Submit solution helper
    const submitAndWait = async (p: Page, timeoutMs = 30000) => {
      const subPromise = p.waitForResponse(
        (resp) => resp.url().includes('/submissions') && resp.status() === 201
      );
      await p.getByTestId('submit-solution-btn').click();
      await subPromise;

      // Check auto tab switch to history
      await expect(p.getByTestId('tab-history')).toHaveClass(/active/);
      await waitForCompleted(p, timeoutMs);
    };

    // Login and first-time change password helper
    const loginAndChangePassword = async (email: string, tempPwd: string) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: /Đăng nhập/i })).toBeVisible();

      await page.locator('#email').fill(email);
      await page.locator('#password').fill(tempPwd.trim());
      await page.getByRole('button', { name: 'Đăng nhập' }).click();

      await page.waitForURL('**/change-password');
      await expect(page.getByRole('heading', { name: /Đổi mật khẩu/i })).toBeVisible();

      await page.locator('#oldPassword').fill(tempPwd.trim());
      await page.locator('#newPassword').fill(newStudentPassword);
      await page.locator('#confirmPassword').fill(newStudentPassword);
      await page.getByRole('button', { name: 'Lưu mật khẩu mới' }).click();

      await page.waitForURL('**/student');
      await expect(page.getByRole('heading', { name: /Lớp học của tôi/i })).toBeVisible();
    };

    // Logout helper
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

    // Solutions
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
    // 2. Student A Journey: Login, Account Page, TEMPLATE Mode (AC, WA, CE)
    // =========================================================================
    await loginAndChangePassword(studentEmailA, tempPwdA);

    // Navbar check
    await expect(page.getByTestId('user-email-display')).toContainText(studentEmailA);

    // 2.1. Account Page test & screenshot
    await page.getByTestId('user-email-display').click();
    await page.waitForURL('**/account');
    await expect(page.getByTestId('account-email')).toContainText(studentEmailA);
    await expect(page.getByTestId('account-role')).toContainText('Sinh viên');
    await page.screenshot({ path: 'reports/ui/account.png' });

    // Return to /student
    await page
      .getByRole('link', { name: /Quay lại|Danh sách lớp/i })
      .first()
      .click();
    await page.waitForURL('**/student');

    // Enter Classroom
    await page.getByTestId(`enter-classroom-${classroomId}`).click();
    await page.waitForURL(`**/student/classrooms/${classroomId}`);

    // Enter TEMPLATE Mode Assignment
    await page.getByTestId(`assignment-link-${assign1Id}`).click();
    await page.waitForURL(`**/student/assignments/${assign1Id}`);
    await expect(page.getByTestId('assignment-title')).toContainText(
      'Đảo ngược danh sách liên kết đơn'
    );

    // Verify NO TEMPLATE/FREE string or ID visible to student
    const studentPageText1 = await page.content();
    expect(studentPageText1).not.toContain('Chế độ Khung mẫu (TEMPLATE)');
    expect(studentPageText1).not.toContain('Chế độ Tự do (FREE)');
    expect(studentPageText1).not.toContain('(ID:');

    // Take screenshot student-assignment-work.png on "Làm bài" tab
    await expect(page.getByTestId('tab-work')).toHaveClass(/active/);
    await page.screenshot({ path: 'reports/ui/student-assignment-work.png' });

    // Verify fixed code blocks are locked pre elements
    const fixedSegments = page.locator('[data-testid="fixed-code-segment"]');
    const fixedCount = await fixedSegments.count();
    expect(fixedCount).toBeGreaterThan(0);
    for (let i = 0; i < fixedCount; i++) {
      const tagName = await fixedSegments.nth(i).evaluate((el) => el.tagName.toLowerCase());
      expect(tagName).toBe('pre');
    }

    const regionInputA = page.getByTestId('region-input-reverseLinkedList');
    await expect(regionInputA).toBeVisible();

    // 2.2. Submit CORRECT solution -> AC (Score 1.00)
    await regionInputA.fill(solutionAC);
    await submitAndWait(page);

    // Check screenshot student-assignment-history.png right after submit
    await page.screenshot({ path: 'reports/ui/student-assignment-history.png' });

    await expect(page.getByTestId('submission-verdict')).toContainText('Đúng');
    await expect(page.getByTestId('submission-score')).toContainText('1.00');
    await expect(page.getByTestId('test-verdict-1')).toContainText('Đúng');
    await expect(page.getByTestId('test-verdict-2')).toContainText('Đúng');

    // Switch back to "Làm bài" tab to submit WA
    await page.getByTestId('tab-work').click();
    await regionInputA.fill(solutionWA);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('Sai kết quả');
    await expect(page.getByTestId('submission-score')).toContainText('0.00');

    // Switch back to "Làm bài" tab to submit CE
    await page.getByTestId('tab-work').click();
    await regionInputA.fill(solutionCE);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('Lỗi biên dịch');
    await expect(page.getByTestId('compile-output')).toBeVisible();

    // Verify SV-A history table has 3 rows
    await expect(page.getByTestId('submission-history')).toBeVisible();
    const historyRowsA = page.locator('[data-testid^="history-row-"]');
    expect(await historyRowsA.count()).toBe(3);

    // Anti-leak check for SV-A
    const pageContentA = await page.content();
    expect(pageContentA).not.toContain('HIDDEN_MARK_P7');
    expect(pageContentA).not.toContain('SYSTEM_ERROR');

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

    // 3.1. Submit TLE
    await regionInputB.fill(solutionTLE);
    await submitAndWait(page, 45000);
    await expect(page.getByTestId('submission-verdict')).toContainText('Quá thời gian');

    // 3.2. Submit MLE
    await page.getByTestId('tab-work').click();
    await regionInputB.fill(solutionMLE);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('Quá bộ nhớ');

    // 3.3. Submit RE
    await page.getByTestId('tab-work').click();
    await regionInputB.fill(solutionRE);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('Lỗi khi chạy');

    const historyRowsB = page.locator('[data-testid^="history-row-"]');
    expect(await historyRowsB.count()).toBe(3);

    const pageContentB = await page.content();
    expect(pageContentB).not.toContain('HIDDEN_MARK_P7');
    expect(pageContentB).not.toContain('SYSTEM_ERROR');

    await logout();

    // =========================================================================
    // 4. Student C Journey: FREE Mode (Full program with main: AC, WA, CE)
    // =========================================================================
    await loginAndChangePassword(studentEmailC, tempPwdC);

    await page.getByTestId(`enter-classroom-${classroomId}`).click();
    await page.waitForURL(`**/student/classrooms/${classroomId}`);
    await page.getByTestId(`assignment-link-${assign2Id}`).click();
    await page.waitForURL(`**/student/assignments/${assign2Id}`);
    await expect(page.getByTestId('assignment-title')).toContainText('Two Sum');

    // Verify NO harness or entry point inputs in FREE mode!
    await expect(page.locator('[data-testid="entry-type-select"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="entry-name-input"]')).toHaveCount(0);

    const freeAC = `#include <iostream>
#include <vector>
#include <unordered_map>

using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int n, target;
    if (!(cin >> n >> target)) return 0;
    vector<int> nums(n);
    for (int i = 0; i < n; ++i) {
        cin >> nums[i];
    }

    unordered_map<int, int> numMap;
    for (int i = 0; i < n; ++i) {
        int complement = target - nums[i];
        if (numMap.find(complement) != numMap.end()) {
            int idx1 = numMap[complement];
            int idx2 = i;
            if (idx1 > idx2) swap(idx1, idx2);
            cout << idx1 << " " << idx2 << "\\n";
            return 0;
        }
        numMap[nums[i]] = i;
    }
    cout << "-1\\n";
    return 0;
}`;

    // 4.1. Submit CORRECT FREE program -> AC
    await page.getByTestId('free-source-input').fill(freeAC);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('Đúng');
    await expect(page.getByTestId('submission-score')).toContainText('1.00');

    // 4.2. Submit WRONG FREE program -> WA
    const freeWA = `#include <iostream>
using namespace std;
int main() {
    cout << "0 0\\n";
    return 0;
}`;
    await page.getByTestId('tab-work').click();
    await page.getByTestId('free-source-input').fill(freeWA);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('Sai kết quả');
    await expect(page.getByTestId('submission-score')).toContainText('0.00');

    // 4.3. Submit syntax error -> CE
    await page.getByTestId('tab-work').click();
    await page.getByTestId('free-source-input').fill('this is a syntax error;;');
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('Lỗi biên dịch');

    const historyRowsC = page.locator('[data-testid^="history-row-"]');
    expect(await historyRowsC.count()).toBe(3);

    // Anti-leak check
    const pageContentFree = await page.content();
    expect(pageContentFree).not.toContain('HIDDEN_MARK_P7');
    expect(pageContentFree).not.toContain('SYSTEM_ERROR');

    await logout();

    // =========================================================================
    // 5. Student D Journey: Mobile Responsive Viewport (390x844) & Late Submission
    // =========================================================================
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAndChangePassword(studentEmailD, tempPwdD);

    await page.getByTestId(`enter-classroom-${classroomId}`).click();
    await page.waitForURL(`**/student/classrooms/${classroomId}`);
    await page.getByTestId(`assignment-link-${assign1Id}`).click();
    await page.waitForURL(`**/student/assignments/${assign1Id}`);
    await page.waitForLoadState('networkidle');

    // Check no horizontal scroll on mobile
    const isNoHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth <= window.innerWidth;
    });
    expect(isNoHorizontalScroll).toBe(true);

    const submitBtnMobile = page.getByTestId('submit-solution-btn');
    await expect(submitBtnMobile).toBeVisible();

    // Mobile submission
    const regionInputD = page.getByTestId('region-input-reverseLinkedList');
    await regionInputD.fill(solutionAC);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('Đúng');
    await expect(page.getByTestId('submission-score')).toContainText('1.00');

    // 5.2. Past-Deadline Assignment: Late Submission Badge Check
    await page.goto(`/student/assignments/${assign3Id}`);
    await page.waitForURL(`**/student/assignments/${assign3Id}`);
    await expect(page.getByTestId('assignment-late-notice')).toBeVisible();

    const pastTemplateRegion = page.getByTestId('region-input-reverseLinkedList');
    await pastTemplateRegion.fill(solutionAC);
    await submitAndWait(page);
    await expect(page.getByTestId('submission-verdict')).toContainText('Đúng');

    await expect(page.getByTestId('badge-late')).toBeVisible();
    await expect(page.getByTestId('badge-late')).toContainText('Nộp trễ');

    const historyLateBadge = page.locator('[data-testid^="history-late-"]').first();
    await expect(historyLateBadge).toBeVisible();
    await expect(historyLateBadge).toContainText('Nộp trễ');

    const pageContentLate = await page.content();
    expect(pageContentLate).not.toContain('HIDDEN_MARK_P7');
    expect(pageContentLate).not.toContain('SYSTEM_ERROR');

    // =========================================================================
    // 6. Assert 0 Console Errors and 0 Page Errors
    // =========================================================================
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
