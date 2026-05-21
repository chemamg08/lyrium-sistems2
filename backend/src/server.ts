import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import routes from './routes/index.js';
import { connectDB } from './db/connection.js';
import { startJobsWorker } from './services/jobsService.js';
import { resumeAllPolling } from './services/emailProcessorService.js';
import { startCleanupWorker } from './services/cleanupService.js';
import { startAlertScheduler } from './services/alertScheduler.js';
import { startStripeReconciliationWorker } from './services/stripeReconciliationService.js';
import { startTaxRateSyncWorker } from './services/taxRateSyncService.js';
import { startCalendarSyncJob } from './jobs/calendarSyncJob.js';
import { startWhatsAppAlertScheduler } from './services/whatsappAlertScheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://lyrium.io', 'https://www.lyrium.io']
    : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'],
  credentials: true,
}));

app.use(helmet());

app.use(cookieParser());

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));
app.use('/api/whatsapp/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));

app.use('/api', routes);

connectDB().then(async () => {
  try {
    await mongoose.connection.collection('stats').dropIndex('accountId_1');
    console.info('Dropped stale accountId_1 index from stats collection');
  } catch { /* index doesn't exist — OK */ }

  startJobsWorker();
  resumeAllPolling();
  startCleanupWorker();
  startAlertScheduler();
  startStripeReconciliationWorker();
  startTaxRateSyncWorker();
  startCalendarSyncJob();
  startWhatsAppAlertScheduler();

  const server = app.listen(PORT, () => {
    console.info(`Server running on port ${PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.info(`${signal} received, shutting down...`);
    server.close(async () => {
      try {
        await mongoose.connection.close();
      } catch (_) {}
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
