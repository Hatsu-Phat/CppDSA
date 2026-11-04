import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ApiConfig } from '../config.js';

export interface StatementUploadResult {
  fileId: string;
  storage: 'local' | 'gdrive';
}

export interface GoogleDriveConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  folderId?: string;
  fetchFn?: typeof fetch;
}

export class GoogleDriveStorageDriver {
  private clientId?: string;
  private clientSecret?: string;
  private refreshToken?: string;
  private folderId?: string;
  private fetchFn: typeof fetch;

  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(options: GoogleDriveConfig) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.refreshToken = options.refreshToken;
    this.folderId = options.folderId;
    this.fetchFn = options.fetchFn || fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.refreshToken);
  }

  clearTokenCache(): void {
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
  }

  async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      const err: any = new Error('Chưa cấu hình lưu trữ đề bài PDF');
      err.statusCode = 503;
      throw err;
    }

    // Return cached token if valid for at least 60 more seconds
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedAccessToken;
    }

    const params = new URLSearchParams({
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
      refresh_token: this.refreshToken!,
      grant_type: 'refresh_token',
    });

    const res = await this.fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const status = res.status;
      let errBody = '';
      try {
        errBody = await res.text();
      } catch {
        // ignore
      }
      // Never include secret or raw token in error message or log
      throw new Error(`Google OAuth token refresh failed (${status}): ${errBody}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in?: number };
    if (!data.access_token) {
      throw new Error('Google OAuth token response missing access_token');
    }

    this.cachedAccessToken = data.access_token;
    const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 3600;
    this.tokenExpiresAt = Date.now() + expiresInSec * 1000;

    return this.cachedAccessToken;
  }

  async upload(fileName: string, buffer: Buffer): Promise<StatementUploadResult> {
    const token = await this.getAccessToken();

    const boundary = `----StatementUploadBoundary${crypto.randomBytes(16).toString('hex')}`;
    const metadata: Record<string, any> = {
      name: fileName,
      mimeType: 'application/pdf',
    };
    if (this.folderId) {
      metadata.parents = [this.folderId];
    }

    const metaString = JSON.stringify(metadata);
    const part1Header = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaString}\r\n`;
    const part2Header = `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
    const closing = `\r\n--${boundary}--`;

    const multipartBody = Buffer.concat([
      Buffer.from(part1Header, 'utf-8'),
      Buffer.from(part2Header, 'utf-8'),
      buffer,
      Buffer.from(closing, 'utf-8'),
    ]);

    const res = await this.fetchFn(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    if (!res.ok) {
      const status = res.status;
      let errBody = '';
      try {
        errBody = await res.text();
      } catch {
        // ignore
      }
      throw new Error(`Google Drive upload failed (${status}): ${errBody}`);
    }

    const json = (await res.json()) as { id: string };
    if (!json.id) {
      throw new Error('Google Drive upload response missing file id');
    }

    return {
      fileId: json.id,
      storage: 'gdrive',
    };
  }

  async download(fileId: string): Promise<Buffer> {
    const token = await this.getAccessToken();

    const res = await this.fetchFn(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      const status = res.status;
      let errBody = '';
      try {
        errBody = await res.text();
      } catch {
        // ignore
      }
      const err: any = new Error(`Google Drive download failed (${status}): ${errBody}`);
      err.statusCode = status === 404 ? 404 : 502;
      throw err;
    }

    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  async delete(fileId: string): Promise<void> {
    const token = await this.getAccessToken();

    const res = await this.fetchFn(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok && res.status !== 404) {
      const status = res.status;
      let errBody = '';
      try {
        errBody = await res.text();
      } catch {
        // ignore
      }
      throw new Error(`Google Drive delete failed (${status}): ${errBody}`);
    }
  }
}

export class LocalStorageDriver {
  private dir: string;

  constructor(dirPath?: string) {
    this.dir = dirPath ? path.resolve(dirPath) : path.resolve(process.cwd(), 'data/statements');
    if (!fs.existsSync(this.dir)) {
      try {
        fs.mkdirSync(this.dir, { recursive: true });
      } catch {
        // directory will be checked on write
      }
    }
  }

  private getFilePath(fileId: string): string {
    // Sanitize fileId to prevent directory traversal
    const safeId = path.basename(fileId);
    return path.join(this.dir, `${safeId}.pdf`);
  }

  async upload(_fileName: string, buffer: Buffer): Promise<StatementUploadResult> {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    const fileId = crypto.randomUUID();
    const filePath = this.getFilePath(fileId);
    await fs.promises.writeFile(filePath, buffer);
    return {
      fileId,
      storage: 'local',
    };
  }

  async download(fileId: string): Promise<Buffer> {
    const filePath = this.getFilePath(fileId);
    if (!fs.existsSync(filePath)) {
      const err: any = new Error('File đề bài không tồn tại trên bộ lưu trữ');
      err.statusCode = 404;
      throw err;
    }
    return await fs.promises.readFile(filePath);
  }

  async delete(fileId: string): Promise<void> {
    const filePath = this.getFilePath(fileId);
    if (fs.existsSync(filePath)) {
      try {
        await fs.promises.unlink(filePath);
      } catch {
        // ignore
      }
    }
  }
}

export type StorageDriverType = 'gdrive' | 'local' | 'unconfigured';

export function resolveStorageDriverType(config: ApiConfig): StorageDriverType {
  const hasGdrive = Boolean(
    config.gdriveClientId && config.gdriveClientSecret && config.gdriveRefreshToken
  );

  const setting = (config.statementStorage || '').toLowerCase().trim();

  if (setting === 'gdrive') {
    return hasGdrive ? 'gdrive' : 'unconfigured';
  }

  if (setting === 'local') {
    return 'local';
  }

  // Default behavior if not explicitly set:
  if (hasGdrive) {
    return 'gdrive';
  }

  if (config.nodeEnv !== 'production') {
    return 'local';
  }

  return 'unconfigured';
}

export class StatementStorageService {
  private localDriver: LocalStorageDriver;
  private gdriveDriver: GoogleDriveStorageDriver;
  private config: ApiConfig;

  constructor(config: ApiConfig, customFetch?: typeof fetch) {
    this.config = config;
    this.localDriver = new LocalStorageDriver(config.statementLocalDir);
    this.gdriveDriver = new GoogleDriveStorageDriver({
      clientId: config.gdriveClientId,
      clientSecret: config.gdriveClientSecret,
      refreshToken: config.gdriveRefreshToken,
      folderId: config.gdriveFolderId,
      fetchFn: customFetch,
    });
  }

  getActiveDriverType(): StorageDriverType {
    return resolveStorageDriverType(this.config);
  }

  getLocalDriver(): LocalStorageDriver {
    return this.localDriver;
  }

  getGDriveDriver(): GoogleDriveStorageDriver {
    return this.gdriveDriver;
  }

  async upload(fileName: string, buffer: Buffer): Promise<StatementUploadResult> {
    const activeType = this.getActiveDriverType();

    if (activeType === 'unconfigured') {
      const err: any = new Error('Chưa cấu hình lưu trữ đề bài PDF');
      err.statusCode = 503;
      throw err;
    }

    if (activeType === 'gdrive') {
      return await this.gdriveDriver.upload(fileName, buffer);
    }

    return await this.localDriver.upload(fileName, buffer);
  }

  async download(storageType: string, fileId: string): Promise<Buffer> {
    if (storageType === 'gdrive') {
      if (!this.gdriveDriver.isConfigured()) {
        const err: any = new Error('Chưa cấu hình lưu trữ đề bài PDF');
        err.statusCode = 503;
        throw err;
      }
      return await this.gdriveDriver.download(fileId);
    }

    if (storageType === 'local') {
      return await this.localDriver.download(fileId);
    }

    const err: any = new Error('Loại lưu trữ không hỗ trợ');
    err.statusCode = 500;
    throw err;
  }

  async delete(storageType: string, fileId: string): Promise<void> {
    if (storageType === 'gdrive') {
      if (this.gdriveDriver.isConfigured()) {
        await this.gdriveDriver.delete(fileId);
      }
      return;
    }

    if (storageType === 'local') {
      await this.localDriver.delete(fileId);
      return;
    }
  }
}
