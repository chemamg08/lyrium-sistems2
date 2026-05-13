// Integration test setup — loads REAL .env variables
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach } from 'vitest';

dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env') });

// JWT secret needed for login tests
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'integration-test-secret';
}

const mongoUri = process.env.MONGODB_URI;
const testDbName = `lyrium_vitest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

if (mongoUri) {
  process.env.VITEST_REAL_MONGO = '1';
  process.env.VITEST_MONGO_DB_NAME = testDbName;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri, { dbName: testDbName });
    }
  });

  afterEach(async () => {
    if (mongoose.connection.readyState !== 1) {
      return;
    }

    const collections = Object.values(mongoose.connection.collections);
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });
} else {
  process.env.VITEST_REAL_MONGO = '0';
  console.warn('[vitest integration] MONGODB_URI no configurada; la capa Mongo real de los tests Stripe quedará desactivada.');
}
