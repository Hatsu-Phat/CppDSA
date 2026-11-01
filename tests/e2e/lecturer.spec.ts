import { test, expect } from '@playwright/test';

test.describe('Lecturer End-to-End Workflow', () => {
  test.use({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });

  test('complete lecturer journey: login, classroom, import CSV, create assignments, verify submissions, export CSV, warmup', async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(120000);

    // 0. Setup console and page error monitors: 0 errors allowed
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
    const s1Code = `S1_${runSuffix}`;
    const s2Code = `S2_${runSuffix}`;
    const s1Email = `student1_${runSuffix}@cppdsa.local`;
    const s2Email = `student2_${runSuffix}@cppdsa.local`;

    // 1. Lecturer Login
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Đăng nhập CppDSA/i })).toBeVisible();

    await page.locator('#email').fill('lecturer@cppdsa.local');
    await page.locator('#password').fill('ChangeMe123!');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    // Verify redirected to lecturer dashboard
    await page.waitForURL('**/lecturer');
    await expect(page.getByRole('heading', { name: /Quản lý Lớp học/i })).toBeVisible();

    // 2. Create Classroom
    await page.getByTestId('create-classroom-btn').click();
    await page.getByTestId('classroom-name-input').fill('Lớp CTDL&GT K26 - E2E Playwright');
    await page.locator('#classroom-desc').fill('Lớp thực hành phục vụ kiểm thử E2E');
    await page.getByTestId('submit-classroom-btn').click();

    // Find and enter the newly created classroom
    const enterClassroomLink = page.getByRole('link', { name: /Vào quản lý lớp →/i }).first();
    await expect(enterClassroomLink).toBeVisible();
    await enterClassroomLink.click();

    await page.waitForURL('**/lecturer/classrooms/*');
    await expect(page.getByTestId('classroom-title')).toContainText(
      'Lớp CTDL&GT K26 - E2E Playwright'
    );

    // Extract classroomId from URL
    const classUrl = page.url();
    const classroomId = classUrl.split('/classrooms/')[1].split('/')[0].split('?')[0];
    expect(classroomId).toBeTruthy();

    // 3. Import CSV with 2 valid students and 1 invalid row
    await page.getByTestId('tab-students').click();

    const csvData = [
      'student_code,full_name,email',
      `${s1Code},Nguyen Van An,${s1Email}`,
      `${s2Code},Tran Thi Binh,${s2Email}`,
      'INVALID_ROW_FORMAT',
    ].join('\n');

    await page.getByTestId('csv-textarea').fill(csvData);
    await page.getByTestId('import-csv-submit').click();

    // Verify success alert and error line alert
    await expect(page.getByTestId('csv-success-alert')).toContainText('2 sinh viên');
    await expect(page.getByTestId('csv-errors-alert')).toContainText('1 dòng dữ liệu bị lỗi');
    await expect(page.getByTestId('csv-error-item')).toContainText('Dòng 4');

    // Verify created students temporary passwords table
    await expect(page.getByTestId('created-passwords-table')).toBeVisible();

    const student1TempPwd = await page.getByTestId(`temp-password-${s1Code}`).innerText();
    const student2TempPwd = await page.getByTestId(`temp-password-${s2Code}`).innerText();

    expect(student1TempPwd).toBeTruthy();
    expect(student2TempPwd).toBeTruthy();
    expect(student1TempPwd.trim().length).toBeGreaterThan(5);
    expect(student2TempPwd.trim().length).toBeGreaterThan(5);

    // Verify students list updated
    await expect(page.getByTestId(`student-row-${s1Code}`)).toBeVisible();
    await expect(page.getByTestId(`student-row-${s2Code}`)).toBeVisible();

    // 4. Test Student Password Reset on Lecturer UI
    await page.getByTestId(`reset-pwd-btn-${s1Code}`).click();
    await expect(page.getByTestId('reset-password-alert')).toBeVisible();
    const student1NewTempPwd = await page.getByTestId('reset-temp-password-code').innerText();
    expect(student1NewTempPwd).toBeTruthy();
    expect(student1NewTempPwd.trim().length).toBeGreaterThan(5);

    // 5. Create TEMPLATE mode assignment
    await page.getByTestId('tab-assignments').click();
    await page.getByTestId('create-assignment-btn').click();
    await page.waitForURL('**/assignments/new');

    // Test Form Rejection for negative TL
    await page.getByTestId('assignment-title-input').fill('Đảo ngược danh sách liên kết');
    await page.getByTestId('assignment-tl-input').fill('-100');
    await page.getByTestId('submit-assignment-btn').click();
    await expect(page.getByTestId('assignment-form-error')).toContainText(
      'Thời gian chạy (TL) phải là số dương'
    );

    // Reset valid TL
    await page.getByTestId('assignment-tl-input').fill('1000');

    // Test Form Rejection for missing STUDENT_END marker
    await page
      .getByTestId('assignment-template-input')
      .fill('#include <iostream>\n// STUDENT_BEGIN reverseLinkedList\nvoid dummy() {}\n');
    await page.getByTestId('submit-assignment-btn').click();
    await expect(page.getByTestId('assignment-form-error')).toContainText('thiếu // STUDENT_END');

    // Fill valid template code (from docs/examples/template-mode/template.cpp)
    const validTemplateCode = `#include <iostream>
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

    await page.getByTestId('assignment-template-input').fill(validTemplateCode);
    await page
      .getByTestId('assignment-desc-input')
      .fill('Cài đặt hàm reverseLinkedList đảo ngược danh sách liên kết đơn.');
    await page.getByTestId('assignment-ml-input').fill('256');
    await page.getByTestId('assignment-deadline-input').fill('2027-12-31T23:59');
    await page.getByTestId('submit-assignment-btn').click();

    // Redirected back to classroom page
    await page.waitForURL(`**/lecturer/classrooms/${classroomId}`);
    await page.getByTestId('tab-assignments').click();
    await expect(
      page.getByRole('heading', { name: 'Đảo ngược danh sách liên kết', level: 4 })
    ).toBeVisible();

    // 6. Manage Hidden Tests for Assignment 1 (TEMPLATE Mode, ≥ 2 tests)
    const card1 = page.locator('.card', { hasText: 'Đảo ngược danh sách liên kết' });
    await card1.getByRole('link', { name: /Quản lý Test ẩn/i }).click();
    await page.waitForURL('**/assignments/*/tests');

    const assign1Url = page.url();
    const assignment1Id = assign1Url.split('/assignments/')[1].split('/')[0];
    expect(assignment1Id).toBeTruthy();

    // Add Hidden Test 1 (from docs/examples/template-mode/tests/test1.in / test1.out)
    await page.getByTestId('new-test-input').fill('4\n1 2 3 4\n');
    await page.getByTestId('new-test-expected').fill('4 3 2 1\n');
    await page.getByTestId('submit-new-test-btn').click();
    await expect(page.getByTestId('test-input-1')).toContainText('4\n1 2 3 4');

    // Add Hidden Test 2 (from docs/examples/template-mode/tests/test2.in / test2.out)
    await page.getByTestId('new-test-input').fill('5\n10 20 30 40 50\n');
    await page.getByTestId('new-test-expected').fill('50 40 30 20 10\n');
    await page.getByTestId('submit-new-test-btn').click();
    await expect(page.getByTestId('test-input-2')).toContainText('5\n10 20 30 40 50');

    // Go back to classroom
    await page.getByRole('link', { name: /← Về chi tiết lớp học/i }).click();
    await page.waitForURL(`**/lecturer/classrooms/${classroomId}`);

    // 7. Create FREE mode assignment
    await page.getByTestId('tab-assignments').click();
    await page.getByTestId('create-assignment-btn').click();
    await page.waitForURL('**/assignments/new');

    await page.getByTestId('assignment-title-input').fill('Two Sum (Tìm hai chỉ số)');
    await page.getByTestId('assignment-desc-input').fill('Tìm hai chỉ số có tổng bằng target.');
    await page.getByTestId('assignment-mode-select').selectOption('FREE');

    const freeHarness = `#include <iostream>
#include <vector>

std::vector<int> timChiSoTong(const std::vector<int>&, int);

int main() {
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(nullptr);

    int n, target;
    if (!(std::cin >> n >> target)) return 0;
    std::vector<int> nums(n);
    for (int i = 0; i < n; ++i) {
        std::cin >> nums[i];
    }

    std::vector<int> result = timChiSoTong(nums, target);

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

    const freeModeSpec = JSON.stringify(
      {
        harness: freeHarness,
        entry: {
          type: 'function',
          name: 'timChiSoTong',
        },
      },
      null,
      2
    );

    await page.getByTestId('assignment-free-spec-input').fill(freeModeSpec);
    await page.getByTestId('assignment-tl-input').fill('1000');
    await page.getByTestId('assignment-ml-input').fill('256');
    await page.getByTestId('assignment-deadline-input').fill('2027-12-31T23:59');
    await page.getByTestId('submit-assignment-btn').click();

    await page.waitForURL(`**/lecturer/classrooms/${classroomId}`);
    await page.getByTestId('tab-assignments').click();
    await expect(
      page.getByRole('heading', { name: 'Two Sum (Tìm hai chỉ số)', level: 4 })
    ).toBeVisible();

    // 8. Manage Hidden Tests for Assignment 2 (FREE Mode, ≥ 2 tests)
    const card2 = page.locator('.card', { hasText: 'Two Sum (Tìm hai chỉ số)' });
    await card2.getByRole('link', { name: /Quản lý Test ẩn/i }).click();
    await page.waitForURL('**/assignments/*/tests');

    const assign2Url = page.url();
    const assignment2Id = assign2Url.split('/assignments/')[1].split('/')[0];
    expect(assignment2Id).toBeTruthy();

    // Add Hidden Test 1 (from docs/examples/free-mode/tests/test1.in / test1.out)
    await page.getByTestId('new-test-input').fill('4 9\n2 7 11 15\n');
    await page.getByTestId('new-test-expected').fill('0 1\n');
    await page.getByTestId('submit-new-test-btn').click();
    await expect(page.getByTestId('test-input-1')).toContainText('4 9\n2 7 11 15');

    // Add Hidden Test 2 (from docs/examples/free-mode/tests/test2.in / test2.out)
    await page.getByTestId('new-test-input').fill('5 10\n2 3 5 7 11\n');
    await page.getByTestId('new-test-expected').fill('1 3\n');
    await page.getByTestId('submit-new-test-btn').click();
    await expect(page.getByTestId('test-input-2')).toContainText('5 10\n2 3 5 7 11');

    await page.getByRole('link', { name: /← Về chi tiết lớp học/i }).click();
    await page.waitForURL(`**/lecturer/classrooms/${classroomId}`);

    // 9. Student Submissions via API (using Playwright request)
    // Student 1: logs in with reset temp password, changes password, submits CORRECT solution for TEMPLATE assignment
    const s1LoginRes = await request.post(`${rootUrl}/api/auth/login`, {
      data: { email: s1Email, password: student1NewTempPwd.trim() },
    });
    expect(s1LoginRes.status()).toBe(200);
    const s1Cookie = s1LoginRes.headers()['set-cookie']?.split(';')[0];
    expect(s1Cookie).toBeTruthy();

    // Student 1 changes password
    const s1ChangePwdRes = await request.post(`${rootUrl}/api/auth/change-password`, {
      headers: { cookie: s1Cookie! },
      data: { oldPassword: student1NewTempPwd.trim(), newPassword: 'NewPassword123!' },
    });
    expect(s1ChangePwdRes.status()).toBe(200);

    // Student 1 submits correct solution (from docs/examples/template-mode/solution.cpp)
    const student1Solution = `ListNode* reverseLinkedList(ListNode* head) {
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

    const s1SubmitRes = await request.post(
      `${rootUrl}/api/assignments/${assignment1Id}/submissions`,
      {
        headers: { cookie: s1Cookie! },
        data: {
          regions: {
            reverseLinkedList: student1Solution,
          },
        },
      }
    );
    expect(s1SubmitRes.status()).toBe(201);
    const s1SubData = await s1SubmitRes.json();
    const s1SubId = s1SubData.submission.id;
    expect(s1SubId).toBeTruthy();

    // Poll for Student 1 completion
    let s1Completed = false;
    for (let i = 0; i < 30; i++) {
      const checkRes = await request.get(`${rootUrl}/api/submissions/${s1SubId}`, {
        headers: { cookie: s1Cookie! },
      });
      const checkData = await checkRes.json();
      if (
        checkData.submission.status === 'COMPLETED' ||
        checkData.submission.status === 'SYSTEM_ERROR'
      ) {
        expect(checkData.submission.status).toBe('COMPLETED');
        expect(Number(checkData.submission.score)).toBe(1);
        s1Completed = true;
        break;
      }
      await page.waitForTimeout(2000);
    }
    expect(s1Completed).toBe(true);

    // Student 2: logs in with temp password, changes password, submits WRONG solution for FREE assignment
    const s2LoginRes = await request.post(`${rootUrl}/api/auth/login`, {
      data: { email: s2Email, password: student2TempPwd.trim() },
    });
    expect(s2LoginRes.status()).toBe(200);
    const s2Cookie = s2LoginRes.headers()['set-cookie']?.split(';')[0];
    expect(s2Cookie).toBeTruthy();

    // Student 2 changes password
    const s2ChangePwdRes = await request.post(`${rootUrl}/api/auth/change-password`, {
      headers: { cookie: s2Cookie! },
      data: { oldPassword: student2TempPwd.trim(), newPassword: 'NewPassword123!' },
    });
    expect(s2ChangePwdRes.status()).toBe(200);

    // Student 2 submits wrong answer (from docs/examples/free-mode/solution_wa.cpp)
    const student2WrongSolution = `#include <vector>

std::vector<int> timChiSoTong(const std::vector<int>& nums, int target) {
    return {0, 0};
}`;

    const s2SubmitRes = await request.post(
      `${rootUrl}/api/assignments/${assignment2Id}/submissions`,
      {
        headers: { cookie: s2Cookie! },
        data: {
          studentSource: student2WrongSolution,
          entry: {
            type: 'function',
            name: 'timChiSoTong',
          },
        },
      }
    );
    expect(s2SubmitRes.status()).toBe(201);
    const s2SubData = await s2SubmitRes.json();
    const s2SubId = s2SubData.submission.id;
    expect(s2SubId).toBeTruthy();

    // Poll for Student 2 completion
    let s2Completed = false;
    for (let i = 0; i < 30; i++) {
      const checkRes = await request.get(`${rootUrl}/api/submissions/${s2SubId}`, {
        headers: { cookie: s2Cookie! },
      });
      const checkData = await checkRes.json();
      if (
        checkData.submission.status === 'COMPLETED' ||
        checkData.submission.status === 'SYSTEM_ERROR'
      ) {
        expect(checkData.submission.status).toBe('COMPLETED');
        expect(Number(checkData.submission.score)).toBeLessThan(1);
        s2Completed = true;
        break;
      }
      await page.waitForTimeout(2000);
    }
    expect(s2Completed).toBe(true);

    // 10. Lecturer views submissions list and filters
    await page.getByTestId('tab-submissions').click();
    await expect(page.getByTestId('submissions-table')).toBeVisible();

    // Verify submission with score 1 (1.00) and score < 1 (0.00)
    await expect(page.getByTestId(`sub-score-${s1SubId}`)).toContainText('1.00');
    await expect(page.getByTestId(`sub-score-${s2SubId}`)).toContainText('0.00');

    // Test filter by Assignment 1
    await page.getByTestId('filter-assignment-select').selectOption(assignment1Id);
    await page.getByTestId('apply-filter-btn').click();
    await expect(page.getByTestId(`sub-score-${s1SubId}`)).toBeVisible();
    await expect(page.locator(`[data-testid="sub-score-${s2SubId}"]`)).not.toBeVisible();

    // Reset filter
    await page.getByRole('button', { name: 'Đặt lại bộ lọc' }).click();
    await expect(page.getByTestId(`sub-score-${s1SubId}`)).toBeVisible();
    await expect(page.getByTestId(`sub-score-${s2SubId}`)).toBeVisible();

    // 11. View Submission Details (Student 1: AC verdicts)
    await page.getByTestId(`view-submission-btn-${s1SubId}`).click();
    await expect(page.getByTestId('submission-detail-modal')).toBeVisible();
    await expect(page.getByTestId('detail-score')).toContainText('1.00');
    await expect(page.getByTestId('detail-submitted-code')).toContainText('reverseLinkedList');
    await expect(page.getByTestId('verdict-0')).toContainText('AC');
    await page.getByRole('button', { name: '✕ Đóng' }).click();

    // View Submission Details (Student 2: WA verdicts)
    await page.getByTestId(`view-submission-btn-${s2SubId}`).click();
    await expect(page.getByTestId('submission-detail-modal')).toBeVisible();
    await expect(page.getByTestId('detail-score')).toContainText('0.00');
    await expect(page.getByTestId('verdict-0')).toContainText('WA');
    await page.getByRole('button', { name: '✕ Đóng' }).click();

    // 12. Export Grades CSV and verify file content
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-csv-btn').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/grades_.*\.csv/);
    const readStream = await download.createReadStream();
    expect(readStream).toBeTruthy();

    const chunks: Buffer[] = [];
    for await (const chunk of readStream!) {
      chunks.push(Buffer.from(chunk));
    }
    const csvContent = Buffer.concat(chunks).toString('utf8');

    // Verify CSV contains students and assignments data
    expect(csvContent).toContain('student_code');
    expect(csvContent).toContain('full_name');
    expect(csvContent).toContain('email');
    expect(csvContent).toContain(s1Code);
    expect(csvContent).toContain(s2Code);
    expect(csvContent).toContain(s1Email);
    expect(csvContent).toContain(s2Email);

    // 13. System Warmup Button and Status Display
    await page.getByTestId('warmup-btn').click();
    await expect(page.getByTestId('warmup-status-alert')).toBeVisible();
    await expect(page.getByTestId('db-status')).toContainText('Sẵn sàng');
    await expect(page.getByTestId('grader-status')).toContainText('Sẵn sàng');
    await page.getByRole('button', { name: 'Đóng' }).click();

    // 14. Assert 0 console errors and 0 page errors
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
