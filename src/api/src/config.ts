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
  maxStudentCodeBytes: number;
  maxTemplateBytes: number;
  maxTestCaseBytes: number;
  maxTestCasesPerAssignment: number;
  maxCsvRows: number;
}

export const config: ApiConfig = {
  port: Number(process.env.PORT || process.env.API_PORT || 4000),
  host: process.env.HOST || process.env.API_HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/cppdsa',
  graderUrl: process.env.GRADER_URL || 'http://localhost:4100',
  graderSecret: process.env.GRADER_SECRET || '',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:4000',
  cookieSecret: process.env.COOKIE_SECRET || 'dev-cookie-secret-32-characters-minimum-key!',
  nodeEnv: process.env.NODE_ENV || 'development',
  maxStudentCodeBytes: Number(process.env.MAX_STUDENT_CODE_BYTES || 65536),
  maxTemplateBytes: Number(process.env.MAX_TEMPLATE_BYTES || 65536),
  maxTestCaseBytes: Number(process.env.MAX_TEST_CASE_BYTES || 1048576),
  maxTestCasesPerAssignment: Number(process.env.MAX_TEST_CASES_PER_ASSIGNMENT || 50),
  maxCsvRows: Number(process.env.MAX_CSV_ROWS || 500),
};
