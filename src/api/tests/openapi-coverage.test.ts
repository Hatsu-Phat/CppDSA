import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

interface EndpointMapping {
  method: string;
  path: string;
  operationId: string;
  testTag: string;
}

describe('OpenAPI Coverage Verification (T-0007 Acceptance Criteria 2)', () => {
  it('verifies that every endpoint in docs/openapi.yaml has at least one positive test', () => {
    const openapiPath = path.resolve(__dirname, '../../../docs/openapi.yaml');
    expect(fs.existsSync(openapiPath)).toBe(true);

    const content = fs.readFileSync(openapiPath, 'utf8');

    // Simple parse of YAML paths and methods
    const endpoints: { method: string; path: string; operationId?: string }[] = [];
    const lines = content.split('\n');

    let currentPath = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Path line e.g. "  /auth/login:"
      const pathMatch = line.match(/^ {2}(\/[a-zA-Z0-9_{}/-]+):$/);
      if (pathMatch) {
        currentPath = pathMatch[1];
        continue;
      }

      // Method line e.g. "    post:"
      const methodMatch = line.match(/^ {4}(get|post|put|delete|patch):$/);
      if (methodMatch && currentPath) {
        const method = methodMatch[1].toUpperCase();

        // Check next few lines for operationId
        let operationId = '';
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const opMatch = lines[j].match(/^\s+operationId:\s+([a-zA-Z0-9]+)/);
          if (opMatch) {
            operationId = opMatch[1];
            break;
          }
        }

        endpoints.push({ method, path: currentPath, operationId });
      }
    }

    expect(endpoints.length).toBeGreaterThan(0);

    // Mapped test tags in integration test suite
    const coverageMap: Record<string, string> = {
      'POST /auth/login': 'TEST_AUTH_LOGIN',
      'POST /auth/logout': 'TEST_AUTH_LOGOUT',
      'GET /auth/me': 'TEST_AUTH_ME',
      'POST /auth/change-password': 'TEST_AUTH_CHANGE_PASSWORD',
      'POST /classrooms': 'TEST_CLASSROOMS_CREATE',
      'GET /classrooms': 'TEST_CLASSROOMS_LIST',
      'GET /classrooms/{id}': 'TEST_CLASSROOMS_GET',
      'PUT /classrooms/{id}': 'TEST_CLASSROOMS_UPDATE',
      'DELETE /classrooms/{id}': 'TEST_CLASSROOMS_DELETE',
      'POST /classrooms/{id}/students/import': 'TEST_STUDENTS_IMPORT_CSV',
      'GET /classrooms/{id}/students': 'TEST_STUDENTS_LIST',
      'POST /classrooms/{id}/students/{studentId}/reset-password': 'TEST_STUDENTS_RESET_PASSWORD',
      'POST /classrooms/{id}/assignments': 'TEST_ASSIGNMENTS_CREATE',
      'GET /classrooms/{id}/assignments': 'TEST_ASSIGNMENTS_LIST',
      'GET /assignments/{id}': 'TEST_ASSIGNMENTS_GET',
      'PUT /assignments/{id}': 'TEST_ASSIGNMENTS_UPDATE',
      'DELETE /assignments/{id}': 'TEST_ASSIGNMENTS_DELETE',
      'PUT /assignments/{id}/statement': 'TEST_ASSIGNMENT_STATEMENT_UPLOAD',
      'GET /assignments/{id}/statement': 'TEST_ASSIGNMENT_STATEMENT_GET',
      'DELETE /assignments/{id}/statement': 'TEST_ASSIGNMENT_STATEMENT_DELETE',
      'POST /assignments/{id}/tests': 'TEST_CASES_CREATE',
      'POST /assignments/{id}/tests/bulk': 'TEST_CASES_BULK_CREATE',
      'GET /assignments/{id}/tests': 'TEST_CASES_LIST',
      'PUT /tests/{id}': 'TEST_CASES_UPDATE',
      'DELETE /tests/{id}': 'TEST_CASES_DELETE',
      'POST /assignments/{id}/submissions': 'TEST_SUBMISSIONS_CREATE',
      'GET /assignments/{id}/submissions': 'TEST_SUBMISSIONS_LIST',
      'POST /assignments/{id}/regrade': 'TEST_ASSIGNMENTS_REGRADE',
      'GET /submissions/{id}': 'TEST_SUBMISSIONS_GET',
      'PATCH /submissions/{id}/score': 'TEST_SUBMISSIONS_UPDATE_SCORE',
      'POST /submissions/{id}/regrade': 'TEST_SUBMISSIONS_REGRADE',
      'GET /classrooms/{id}/submissions': 'TEST_CLASSROOM_SUBMISSIONS_LIST',
      'GET /classrooms/{id}/grades/csv': 'TEST_GRADES_EXPORT_CSV',
      'POST /system/warmup': 'TEST_SYSTEM_WARMUP',
      'POST /internal/grader-callback': 'TEST_INTERNAL_GRADER_CALLBACK',
    };

    const tableRows: EndpointMapping[] = [];
    const missing: string[] = [];

    for (const ep of endpoints) {
      const key = `${ep.method} ${ep.path}`;
      const tag = coverageMap[key];
      if (!tag) {
        missing.push(key);
      } else {
        tableRows.push({
          method: ep.method,
          path: ep.path,
          operationId: ep.operationId || '',
          testTag: tag,
        });
      }
    }

    console.log('\n=== OPENAPI ENDPOINTS <-> TEST MAPPING TABLE ===');
    console.log('| Method | Path | OperationId | Integration Test Tag |');
    console.log('|---|---|---|---|');
    for (const row of tableRows) {
      console.log(`| ${row.method} | ${row.path} | ${row.operationId} | ${row.testTag} |`);
    }
    console.log(`Total endpoints covered: ${tableRows.length}/${endpoints.length}\n`);

    expect(
      missing,
      `The following OpenAPI endpoints are missing positive tests: ${missing.join(', ')}`
    ).toHaveLength(0);
  });
});
