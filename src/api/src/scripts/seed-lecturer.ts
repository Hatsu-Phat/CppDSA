import pg from 'pg';
import dotenv from 'dotenv';
import { hashPassword } from '../utils/security.js';

dotenv.config();

async function main() {
  const email = process.env.SEED_LECTURER_EMAIL || 'lecturer@cppdsa.local';
  const password = process.env.SEED_LECTURER_PASSWORD || 'ChangeMe123!';
  const databaseUrl =
    process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/cppdsa';

  console.log(`Seeding lecturer account for: ${email}`);

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, must_change_password)
       VALUES ($1, $2, 'Giảng viên', 'LECTURER', false)
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
       RETURNING id, email, full_name, role`,
      [email, passwordHash]
    );

    console.log('Lecturer account seeded successfully:', result.rows[0]);
  } catch (err) {
    console.error('Failed to seed lecturer account:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
