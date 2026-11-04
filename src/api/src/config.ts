import dotenv from 'dotenv';

dotenv.config();

export interface ApiConfig {
  port: number;
  host: string;
  databaseUrl: string;
  graderUrl: string;
  graderSecret: string;
  apiBaseUrl: string;
  cookieSecret: string;
  nodeEnv: string;
  trustProxy: boolean | number | string;
  loginRateLimitMax: number;
  loginIpRateLimitMax: number;
  globalRateLimitMax: number;
  maxStudentCodeBytes: number;
  maxTemplateBytes: number;
  maxTestCaseBytes: number;
  maxTestCasesPerAssignment: number;
  maxCsvRows: number;
  statementStorage?: string;
  statementLocalDir?: string;
  gdriveClientId?: string;
  gdriveClientSecret?: string;
  gdriveRefreshToken?: string;
  gdriveFolderId?: string;
  maxStatementPdfBytes: number;
  now?: () => Date;
}

export function parseTrustProxy(val?: string | boolean | number): boolean | number | string {
  if (val === undefined || val === null || val === '' || val === 'false' || val === false) {
    return false;
  }
  if (val === 'true' || val === true) {
    return true;
  }
  const num = Number(val);
  if (!isNaN(num) && Number.isInteger(num) && num >= 0) {
    return num;
  }
  return String(val);
}

export function validateProductionConfig(cfg: ApiConfig): void {
  if (cfg.nodeEnv !== 'production') {
    return;
  }

  if (!cfg.graderSecret || cfg.graderSecret.trim().length === 0) {
    throw new Error('GRADER_SECRET không được để trống khi NODE_ENV=production');
  }

  if (
    !cfg.cookieSecret ||
    cfg.cookieSecret.trim().length === 0 ||
    cfg.cookieSecret === 'dev-cookie-secret-32-characters-minimum-key!'
  ) {
    throw new Error(
      'COOKIE_SECRET không được để trống hoặc dùng giá trị mặc định dev khi NODE_ENV=production'
    );
  }

  if (
    !cfg.databaseUrl ||
    cfg.databaseUrl.includes('localhost') ||
    cfg.databaseUrl.includes('127.0.0.1')
  ) {
    throw new Error('DATABASE_URL không được trỏ về localhost khi NODE_ENV=production');
  }
}

export function buildConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  const nodeEnv = overrides.nodeEnv || process.env.NODE_ENV || 'development';
  const cookieSecret =
    overrides.cookieSecret !== undefined
      ? overrides.cookieSecret
      : process.env.COOKIE_SECRET || 'dev-cookie-secret-32-characters-minimum-key!';
  const graderSecret =
    overrides.graderSecret !== undefined ? overrides.graderSecret : process.env.GRADER_SECRET || '';
  const databaseUrl =
    overrides.databaseUrl !== undefined
      ? overrides.databaseUrl
      : process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/cppdsa';

  const trustProxy =
    overrides.trustProxy !== undefined
      ? overrides.trustProxy
      : parseTrustProxy(process.env.TRUST_PROXY);

  const cfg: ApiConfig = {
    port: overrides.port ?? Number(process.env.PORT || process.env.API_PORT || 4000),
    host: overrides.host ?? (process.env.HOST || process.env.API_HOST || '0.0.0.0'),
    databaseUrl,
    graderUrl: overrides.graderUrl ?? (process.env.GRADER_URL || 'http://localhost:4100'),
    graderSecret,
    apiBaseUrl: overrides.apiBaseUrl ?? (process.env.API_BASE_URL || 'http://localhost:4000'),
    cookieSecret,
    nodeEnv,
    trustProxy,
    loginRateLimitMax:
      overrides.loginRateLimitMax ?? Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
    loginIpRateLimitMax:
      overrides.loginIpRateLimitMax ?? Number(process.env.LOGIN_IP_RATE_LIMIT_MAX || 100),
    globalRateLimitMax:
      overrides.globalRateLimitMax ?? Number(process.env.GLOBAL_RATE_LIMIT_MAX || 300),
    maxStudentCodeBytes:
      overrides.maxStudentCodeBytes ?? Number(process.env.MAX_STUDENT_CODE_BYTES || 65536),
    maxTemplateBytes: overrides.maxTemplateBytes ?? Number(process.env.MAX_TEMPLATE_BYTES || 65536),
    maxTestCaseBytes:
      overrides.maxTestCaseBytes ?? Number(process.env.MAX_TEST_CASE_BYTES || 1048576),
    maxTestCasesPerAssignment:
      overrides.maxTestCasesPerAssignment ??
      Number(process.env.MAX_TEST_CASES_PER_ASSIGNMENT || 50),
    maxCsvRows: overrides.maxCsvRows ?? Number(process.env.MAX_CSV_ROWS || 500),
    statementStorage:
      overrides.statementStorage !== undefined
        ? overrides.statementStorage
        : process.env.STATEMENT_STORAGE,
    statementLocalDir:
      overrides.statementLocalDir !== undefined
        ? overrides.statementLocalDir
        : process.env.STATEMENT_LOCAL_DIR || './data/statements',
    gdriveClientId:
      overrides.gdriveClientId !== undefined
        ? overrides.gdriveClientId
        : process.env.GDRIVE_CLIENT_ID,
    gdriveClientSecret:
      overrides.gdriveClientSecret !== undefined
        ? overrides.gdriveClientSecret
        : process.env.GDRIVE_CLIENT_SECRET,
    gdriveRefreshToken:
      overrides.gdriveRefreshToken !== undefined
        ? overrides.gdriveRefreshToken
        : process.env.GDRIVE_REFRESH_TOKEN,
    gdriveFolderId:
      overrides.gdriveFolderId !== undefined
        ? overrides.gdriveFolderId
        : process.env.GDRIVE_FOLDER_ID,
    maxStatementPdfBytes:
      overrides.maxStatementPdfBytes ??
      Number(process.env.MAX_STATEMENT_PDF_BYTES || 10 * 1024 * 1024),
    now: overrides.now || (() => new Date()),
  };

  validateProductionConfig(cfg);
  return cfg;
}

export const config: ApiConfig = buildConfig();
