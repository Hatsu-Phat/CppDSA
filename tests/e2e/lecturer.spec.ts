import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Lecturer End-to-End Workflow', () => {
  test.use({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });

  test('complete lecturer journey: login, classroom, import CSV, create assignments, bulk tests import, verify submissions, edit score, regrade, export CSV', async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(180000);

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

    // Ensure reports/ui directory exists
    const reportsDir = path.resolve(process.cwd(), 'reports/ui');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // 1. Lecturer Login
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Đăng nhập/i })).toBeVisible();

    await page.locator('#email').fill('lecturer@cppdsa.local');
    await page.locator('#password').fill('ChangeMe123!');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    await page.waitForURL('**/lecturer');
    await expect(page.getByRole('heading', { name: /Quản lý Lớp học/i })).toBeVisible();

    // 2. Create Classroom
    await page.getByTestId('create-classroom-btn').click();
    await page.getByTestId('classroom-name-input').fill('Lớp CTDL&GT K26 - E2E Playwright');
    await page.locator('#classroom-desc').fill('Lớp thực hành phục vụ kiểm thử E2E');
    await page.getByTestId('submit-classroom-btn').click();

    const enterClassroomLink = page.getByRole('link', { name: /Vào quản lý lớp →/i }).first();
    await expect(enterClassroomLink).toBeVisible();
    await enterClassroomLink.click();

    await page.waitForURL('**/lecturer/classrooms/*');
    await expect(page.getByTestId('classroom-title')).toContainText(
      'Lớp CTDL&GT K26 - E2E Playwright'
    );

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

    await expect(page.getByTestId('csv-success-alert')).toContainText('2 sinh viên');
    await expect(page.getByTestId('csv-errors-alert')).toContainText('1 dòng dữ liệu bị lỗi');
    await expect(page.getByTestId('csv-error-item')).toContainText('Dòng 4');

    await expect(page.getByTestId('created-passwords-table')).toBeVisible();

    const student1TempPwd = await page.getByTestId(`temp-password-${s1Code}`).innerText();
    const student2TempPwd = await page.getByTestId(`temp-password-${s2Code}`).innerText();

    expect(student1TempPwd).toBeTruthy();
    expect(student2TempPwd).toBeTruthy();
    expect(student1TempPwd.trim().length).toBeGreaterThan(5);
    expect(student2TempPwd.trim().length).toBeGreaterThan(5);

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

    // Negative TL validation
    await page.getByTestId('assignment-title-input').fill('Đảo ngược danh sách liên kết');
    await page.getByTestId('assignment-tl-input').fill('-100');
    await page.getByTestId('submit-assignment-btn').click();
    await expect(page.getByTestId('assignment-form-error')).toContainText(
      'Thời gian chạy (TL) phải là số dương'
    );

    // Valid TL
    await page.getByTestId('assignment-tl-input').fill('1000');

    // Missing STUDENT_END marker rejection
    await page
      .getByTestId('assignment-template-input')
      .fill('#include <iostream>\n// STUDENT_BEGIN reverseLinkedList\nvoid dummy() {}\n');
    await page.getByTestId('submit-assignment-btn').click();
    await expect(page.getByTestId('assignment-form-error')).toContainText('thiếu // STUDENT_END');

    // Fill valid template code
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

    await page.waitForURL(`**/lecturer/classrooms/${classroomId}`);
    await page.getByTestId('tab-assignments').click();
    await expect(
      page.getByRole('heading', { name: 'Đảo ngược danh sách liên kết', level: 4 })
    ).toBeVisible();

    // 6. Manage Hidden Tests for Assignment 1
    const card1 = page.locator('.card', { hasText: 'Đảo ngược danh sách liên kết' });
    await card1.getByRole('link', { name: /Quản lý Test ẩn/i }).click();
    await page.waitForURL('**/assignments/*/tests');

    const assign1Url = page.url();
    const assignment1Id = assign1Url.split('/assignments/')[1].split('/')[0];
    expect(assignment1Id).toBeTruthy();

    // Add Test 1
    await page.getByTestId('new-test-input').fill('4\n1 2 3 4\n');
    await page.getByTestId('new-test-expected').fill('4 3 2 1\n');
    await page.getByTestId('submit-new-test-btn').click();
    await expect(page.getByTestId('test-input-1')).toContainText('4\n1 2 3 4');

    // Add Test 2
    await page.getByTestId('new-test-input').fill('5\n10 20 30 40 50\n');
    await page.getByTestId('new-test-expected').fill('50 40 30 20 10\n');
    await page.getByTestId('submit-new-test-btn').click();
    await expect(page.getByTestId('test-input-2')).toContainText('5\n10 20 30 40 50');

    // Go back to classroom
    await page.getByRole('link', { name: /← Về chi tiết lớp học/i }).click();
    await page.waitForURL(`**/lecturer/classrooms/${classroomId}`);

    // 7. Create FREE mode assignment (NO harness field!)
    await page.getByTestId('tab-assignments').click();
    await page.getByTestId('create-assignment-btn').click();
    await page.waitForURL('**/assignments/new');

    await page.getByTestId('assignment-title-input').fill('Two Sum (Tìm hai chỉ số)');
    await page.getByTestId('assignment-desc-input').fill('Tìm hai chỉ số có tổng bằng target.');
    await page.getByTestId('assignment-mode-select').selectOption('FREE');

    // Verify notice is shown and NO harness textarea
    await expect(page.getByTestId('free-mode-section')).toContainText(
      'Sinh viên nộp chương trình đầy đủ'
    );
    await expect(page.locator('[data-testid="assignment-free-spec-input"]')).toHaveCount(0);

    await page.getByTestId('assignment-tl-input').fill('1000');
    await page.getByTestId('assignment-ml-input').fill('256');
    await page.getByTestId('assignment-deadline-input').fill('2027-12-31T23:59');
    await page.getByTestId('submit-assignment-btn').click();

    await page.waitForURL(`**/lecturer/classrooms/${classroomId}`);
    await page.getByTestId('tab-assignments').click();
    await expect(
      page.getByRole('heading', { name: 'Two Sum (Tìm hai chỉ số)', level: 4 })
    ).toBeVisible();

    // 8. Manage Tests for Assignment 2 & Bulk File Import
    const card2 = page.locator('.card', { hasText: 'Two Sum (Tìm hai chỉ số)' });
    await card2.getByRole('link', { name: /Quản lý Test ẩn/i }).click();
    await page.waitForURL('**/assignments/*/tests');

    const assign2Url = page.url();
    const assignment2Id = assign2Url.split('/assignments/')[1].split('/')[0];
    expect(assignment2Id).toBeTruthy();

    // 8.1. Bulk Import Tests from files with preview
    await page.getByTestId('bulk-file-input').setInputFiles([
      {
        name: 'test01.inp',
        mimeType: 'text/plain',
        buffer: Buffer.from('4 9\n2 7 11 15\n'),
      },
      {
        name: 'test01.out',
        mimeType: 'text/plain',
        buffer: Buffer.from('0 1\n'),
      },
      {
        name: 'test02.inp',
        mimeType: 'text/plain',
        buffer: Buffer.from('5 10\n2 3 5 7 11\n'),
      },
      {
        name: 'test02.out',
        mimeType: 'text/plain',
        buffer: Buffer.from('1 3\n'),
      },
    ]);

    // Preview table is visible
    await expect(page.getByTestId('bulk-preview-section')).toBeVisible();

    // Screenshot lecturer-tests-import.png
    await page.screenshot({ path: 'reports/ui/lecturer-tests-import.png' });

    // Upload the paired tests
    await page.getByTestId('bulk-upload-btn').click();
    await expect(page.getByTestId('bulk-success')).toBeVisible();

    // Verify imported tests in table
    await expect(page.getByTestId('test-input-1')).toContainText('4 9\n2 7 11 15');
    await expect(page.getByTestId('test-input-2')).toContainText('5 10\n2 3 5 7 11');

    // 8.2. Test "Chấm lại tất cả bài nộp" button
    page.once('dialog', async (d) => await d.accept());
    await page.getByTestId('regrade-all-btn').click();
    await expect(page.getByTestId('regrade-notice')).toBeVisible();

    await page.getByRole('link', { name: /← Về chi tiết lớp học/i }).click();
    await page.waitForURL(`**/lecturer/classrooms/${classroomId}`);

    // 9. Student Submissions via API
    // Student 1: logs in with reset temp password, changes password, submits CORRECT solution for TEMPLATE assignment
    const s1LoginRes = await request.post(`${rootUrl}/api/auth/login`, {
      data: { email: s1Email, password: student1NewTempPwd.trim() },
    });
    expect(s1LoginRes.status()).toBe(200);
    const s1Cookie = s1LoginRes.headers()['set-cookie']?.split(';')[0];
    expect(s1Cookie).toBeTruthy();

    const s1ChangePwdRes = await request.post(`${rootUrl}/api/auth/change-password`, {
      headers: { cookie: s1Cookie! },
      data: { oldPassword: student1NewTempPwd.trim(), newPassword: 'NewPassword123!' },
    });
    expect(s1ChangePwdRes.status()).toBe(200);

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

    // Student 2: logs in, changes password, submits WRONG answer for FREE assignment (full program)
    const s2LoginRes = await request.post(`${rootUrl}/api/auth/login`, {
      data: { email: s2Email, password: student2TempPwd.trim() },
    });
    expect(s2LoginRes.status()).toBe(200);
    const s2Cookie = s2LoginRes.headers()['set-cookie']?.split(';')[0];
    expect(s2Cookie).toBeTruthy();

    const s2ChangePwdRes = await request.post(`${rootUrl}/api/auth/change-password`, {
      headers: { cookie: s2Cookie! },
      data: { oldPassword: student2TempPwd.trim(), newPassword: 'NewPassword123!' },
    });
    expect(s2ChangePwdRes.status()).toBe(200);

    const student2WrongSolution = `#include <iostream>
using namespace std;
int main() {
    cout << "0 0\\n";
    return 0;
}`;

    const s2SubmitRes = await request.post(
      `${rootUrl}/api/assignments/${assignment2Id}/submissions`,
      {
        headers: { cookie: s2Cookie! },
        data: {
          studentSource: student2WrongSolution,
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

    // 11. View Submission Details Modal & Go to Lecturer Submission Detail Page
    await page.getByTestId(`view-submission-btn-${s1SubId}`).click();
    await expect(page.getByTestId('submission-detail-modal')).toBeVisible();
    await expect(page.getByTestId('detail-score')).toContainText('1.00');
    await expect(page.getByTestId('detail-submitted-code')).toContainText('reverseLinkedList');

    // Click link to open submission page /lecturer/submissions/:id
    await page.getByTestId('open-submission-page-link').click();
    await page.waitForURL(`**/lecturer/submissions/${s1SubId}`);

    // Screenshot lecturer-submission.png
    await page.screenshot({ path: 'reports/ui/lecturer-submission.png' });

    // 11.1. Test Score Editing on Lecturer Submission Page
    await page.getByTestId('edit-score-input').fill('0.85');
    await page.getByTestId('save-score-btn').click();
    await expect(page.getByTestId('score-success')).toBeVisible();
    await expect(page.getByTestId('detail-score')).toContainText('0.85');

    // 11.2. Test Regrade Single Submission
    page.once('dialog', async (d) => await d.accept());
    await page.getByTestId('regrade-sub-btn').click();
    await expect(page.getByTestId('regrade-notice')).toBeVisible();

    // Return to classroom
    await page.goto(`/lecturer/classrooms/${classroomId}`);
    await page.waitForURL(`**/lecturer/classrooms/${classroomId}`);
    await page.getByTestId('tab-submissions').click();

    // 12. Export Grades CSV
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

    expect(csvContent).toContain('student_code');
    expect(csvContent).toContain('full_name');
    expect(csvContent).toContain('email');
    expect(csvContent).toContain(s1Code);
    expect(csvContent).toContain(s2Code);
    expect(csvContent).toContain(s1Email);
    expect(csvContent).toContain(s2Email);

    // 13. Assert 0 console errors and 0 page errors
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
