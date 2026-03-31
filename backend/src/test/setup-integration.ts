// Integration test setup — loads REAL .env variables
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env') });

// JWT secret needed for login tests
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'integration-test-secret';
}
