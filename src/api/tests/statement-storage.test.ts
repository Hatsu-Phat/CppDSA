import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  GoogleDriveStorageDriver,
  LocalStorageDriver,
  StatementStorageService,
  resolveStorageDriverType,
} from '../src/services/statement-storage.js';
import { buildConfig } from '../src/config.js';

describe('GoogleDriveStorageDriver Unit Tests (Mocked Fetch)', () => {
  const fakeClientId = 'test-client-id.apps.googleusercontent.com';
  const fakeClientSecret = 'test-client-secret-xyz';
  const fakeRefreshToken = 'test-refresh-token-abc';
  const fakeFolderId = 'folder-12345';
  const fakeAccessToken = 'ya29.fake-access-token-987';

  it('refreshes token with correct parameters, caches it until near expiration', async () => {
    let tokenFetchCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        tokenFetchCount++;
        const bodyStr = opts?.body || '';
        expect(bodyStr).toContain(`client_id=${encodeURIComponent(fakeClientId)}`);
        expect(bodyStr).toContain(`client_secret=${encodeURIComponent(fakeClientSecret)}`);
        expect(bodyStr).toContain(`refresh_token=${encodeURIComponent(fakeRefreshToken)}`);
        expect(bodyStr).toContain('grant_type=refresh_token');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: fakeAccessToken,
            expires_in: 3600,
            token_type: 'Bearer',
          }),
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const driver = new GoogleDriveStorageDriver({
      clientId: fakeClientId,
      clientSecret: fakeClientSecret,
      refreshToken: fakeRefreshToken,
      folderId: fakeFolderId,
      fetchFn: mockFetch as any,
    });

    // 1st call: fetches token
    const token1 = await driver.getAccessToken();
    expect(token1).toBe(fakeAccessToken);
    expect(tokenFetchCount).toBe(1);

    // 2nd immediate call: should use cached token without calling fetch again
    const token2 = await driver.getAccessToken();
    expect(token2).toBe(fakeAccessToken);
    expect(tokenFetchCount).toBe(1);
  });

  it('throws clear error when token refresh returns 401 without leaking secrets or tokens', async () => {
    const mockFetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 401,
        text: async () => '{"error":"invalid_client","error_description":"Unauthorized"}',
      };
    });

    const driver = new GoogleDriveStorageDriver({
      clientId: fakeClientId,
      clientSecret: fakeClientSecret,
      refreshToken: fakeRefreshToken,
      fetchFn: mockFetch as any,
    });

    await expect(driver.getAccessToken()).rejects.toThrow(
      /Google OAuth token refresh failed \(401\)/
    );
  });

  it('uploads file with multipart/related structure, headers, boundary, and parents metadata', async () => {
    let uploadCaptured = false;
    const mockFetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: fakeAccessToken, expires_in: 3600 }),
        };
      }

      if (url === 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart') {
        uploadCaptured = true;
        expect(opts?.method).toBe('POST');
        expect(opts?.headers?.Authorization).toBe(`Bearer ${fakeAccessToken}`);

        const contentType = opts?.headers?.['Content-Type'] || '';
        expect(contentType).toContain('multipart/related; boundary=');
        const boundary = contentType.split('boundary=')[1];
        expect(boundary).toBeTruthy();

        const bodyBuf = opts?.body as Buffer;
        expect(Buffer.isBuffer(bodyBuf)).toBe(true);
        const bodyStr = bodyBuf.toString('utf-8');

        // Verify JSON metadata part
        expect(bodyStr).toContain(`--${boundary}`);
        expect(bodyStr).toContain('Content-Type: application/json; charset=UTF-8');
        expect(bodyStr).toContain('"name":"assignment-problem.pdf"');
        expect(bodyStr).toContain(`"parents":["${fakeFolderId}"]`);

        // Verify PDF binary part
        expect(bodyStr).toContain('Content-Type: application/pdf');
        expect(bodyStr).toContain('%PDF-1.4 test binary data');
        expect(bodyStr).toContain(`--${boundary}--`);

        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'gdrive-file-id-456', name: 'assignment-problem.pdf' }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const driver = new GoogleDriveStorageDriver({
      clientId: fakeClientId,
      clientSecret: fakeClientSecret,
      refreshToken: fakeRefreshToken,
      folderId: fakeFolderId,
      fetchFn: mockFetch as any,
    });

    const dummyPdf = Buffer.from('%PDF-1.4 test binary data');
    const result = await driver.upload('assignment-problem.pdf', dummyPdf);

    expect(uploadCaptured).toBe(true);
    expect(result.fileId).toBe('gdrive-file-id-456');
    expect(result.storage).toBe('gdrive');
  });

  it('downloads file stream/buffer using Bearer token', async () => {
    const fileBytes = Buffer.from('%PDF-1.4 downloaded pdf content');
    const mockFetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: fakeAccessToken, expires_in: 3600 }),
        };
      }

      if (url === 'https://www.googleapis.com/drive/v3/files/gdrive-file-id-456?alt=media') {
        expect(opts?.method).toBe('GET');
        expect(opts?.headers?.Authorization).toBe(`Bearer ${fakeAccessToken}`);
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            fileBytes.buffer.slice(
              fileBytes.byteOffset,
              fileBytes.byteOffset + fileBytes.byteLength
            ),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const driver = new GoogleDriveStorageDriver({
      clientId: fakeClientId,
      clientSecret: fakeClientSecret,
      refreshToken: fakeRefreshToken,
      fetchFn: mockFetch as any,
    });

    const downloaded = await driver.download('gdrive-file-id-456');
    expect(downloaded.toString('utf-8')).toBe(fileBytes.toString('utf-8'));
  });

  it('deletes file using Bearer token', async () => {
    let deleted = false;
    const mockFetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: fakeAccessToken, expires_in: 3600 }),
        };
      }

      if (url === 'https://www.googleapis.com/drive/v3/files/gdrive-file-id-456') {
        expect(opts?.method).toBe('DELETE');
        expect(opts?.headers?.Authorization).toBe(`Bearer ${fakeAccessToken}`);
        deleted = true;
        return { ok: true, status: 204 };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const driver = new GoogleDriveStorageDriver({
      clientId: fakeClientId,
      clientSecret: fakeClientSecret,
      refreshToken: fakeRefreshToken,
      fetchFn: mockFetch as any,
    });

    await driver.delete('gdrive-file-id-456');
    expect(deleted).toBe(true);
  });

  it('handles Google API 401 or 403 errors during download/upload with clear error message', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'https://oauth2.googleapis.com/token') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: fakeAccessToken, expires_in: 3600 }),
        };
      }

      return {
        ok: false,
        status: 401,
        text: async () => '{"error":{"message":"Invalid Credentials","status":"UNAUTHENTICATED"}}',
      };
    });

    const driver = new GoogleDriveStorageDriver({
      clientId: fakeClientId,
      clientSecret: fakeClientSecret,
      refreshToken: fakeRefreshToken,
      fetchFn: mockFetch as any,
    });

    await expect(driver.upload('test.pdf', Buffer.from('%PDF-1.4'))).rejects.toThrow(
      /Google Drive upload failed \(401\)/
    );
  });
});

describe('LocalStorageDriver Unit Tests', () => {
  let tempDir: string;
  let localDriver: LocalStorageDriver;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cppdsa-test-statements-'));
    localDriver = new LocalStorageDriver(tempDir);
  });

  it('saves file to disk, downloads exact buffer, and deletes file', async () => {
    const originalPdf = Buffer.from('%PDF-1.4 Hello World PDF Content');
    const uploadRes = await localDriver.upload('hello.pdf', originalPdf);

    expect(uploadRes.storage).toBe('local');
    expect(uploadRes.fileId).toBeTruthy();

    const filePath = path.join(tempDir, `${uploadRes.fileId}.pdf`);
    expect(fs.existsSync(filePath)).toBe(true);

    const downloaded = await localDriver.download(uploadRes.fileId);
    expect(downloaded.equals(originalPdf)).toBe(true);

    await localDriver.delete(uploadRes.fileId);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('throws 404 when downloading non-existent file', async () => {
    await expect(localDriver.download('non-existent-uuid')).rejects.toThrow();
  });
});

describe('resolveStorageDriverType & StatementStorageService Guard Tests', () => {
  const dummyProdVars = {
    graderSecret: 'prod-grader-secret',
    cookieSecret: 'prod-cookie-secret-key-32-chars-long!',
    databaseUrl: 'postgres://user:pass@remote-azure-pg.postgres.database.azure.com:5432/db',
  };

  it('resolves active driver based on environment variables and NODE_ENV', () => {
    // 1. Explicit local
    const cfgLocal = buildConfig({
      ...dummyProdVars,
      statementStorage: 'local',
      nodeEnv: 'production',
    });
    expect(resolveStorageDriverType(cfgLocal)).toBe('local');

    // 2. Explicit gdrive with credentials
    const cfgGdrive = buildConfig({
      ...dummyProdVars,
      statementStorage: 'gdrive',
      gdriveClientId: 'client-id',
      gdriveClientSecret: 'secret',
      gdriveRefreshToken: 'token',
      nodeEnv: 'production',
    });
    expect(resolveStorageDriverType(cfgGdrive)).toBe('gdrive');

    // 3. Explicit gdrive missing credentials -> unconfigured
    const cfgGdriveMissing = buildConfig({
      ...dummyProdVars,
      statementStorage: 'gdrive',
      gdriveClientId: '',
      nodeEnv: 'production',
    });
    expect(resolveStorageDriverType(cfgGdriveMissing)).toBe('unconfigured');

    // 4. Default in development without gdrive vars -> local
    const cfgDevDefault = buildConfig({
      statementStorage: undefined,
      gdriveClientId: undefined,
      nodeEnv: 'development',
    });
    expect(resolveStorageDriverType(cfgDevDefault)).toBe('local');

    // 5. Default in production without gdrive vars -> unconfigured
    const cfgProdMissing = buildConfig({
      ...dummyProdVars,
      statementStorage: undefined,
      gdriveClientId: undefined,
      nodeEnv: 'production',
    });
    expect(resolveStorageDriverType(cfgProdMissing)).toBe('unconfigured');
  });

  it('StatementStorageService upload throws 503 "Chưa cấu hình lưu trữ đề bài PDF" when unconfigured', async () => {
    const unconfiguredConfig = buildConfig({
      ...dummyProdVars,
      statementStorage: 'gdrive',
      gdriveClientId: '',
      nodeEnv: 'production',
    });

    const service = new StatementStorageService(unconfiguredConfig);
    expect(service.getActiveDriverType()).toBe('unconfigured');

    try {
      await service.upload('test.pdf', Buffer.from('%PDF-1.4'));
      expect.fail('Should have thrown 503');
    } catch (err: any) {
      expect(err.statusCode).toBe(503);
      expect(err.message).toBe('Chưa cấu hình lưu trữ đề bài PDF');
    }
  });

  it('verifies migration 0003 up and down functions match expected columns', async () => {
    const migration = await import('../migrations/0003_assignment_statement_pdf.cjs');
    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');

    let addedTable = '';
    let addedColumns: any = {};
    const mockPgmUp: any = {
      addColumns: (table: string, cols: any) => {
        addedTable = table;
        addedColumns = cols;
      },
    };

    migration.up(mockPgmUp);
    expect(addedTable).toBe('assignments');
    expect(addedColumns.statement_storage).toBeDefined();
    expect(addedColumns.statement_file_id).toBeDefined();
    expect(addedColumns.statement_file_name).toBeDefined();
    expect(addedColumns.statement_file_size).toBeDefined();

    let droppedTable = '';
    let droppedColumns: string[] = [];
    const mockPgmDown: any = {
      dropColumns: (table: string, cols: string[]) => {
        droppedTable = table;
        droppedColumns = cols;
      },
    };

    migration.down(mockPgmDown);
    expect(droppedTable).toBe('assignments');
    expect(droppedColumns).toEqual([
      'statement_storage',
      'statement_file_id',
      'statement_file_name',
      'statement_file_size',
    ]);
  });
});
