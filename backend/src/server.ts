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
import { startTaxRateSyncWorker } from './services/taxRateSyncService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://lyrium.io', 'https://www.lyrium.io']
    : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'],
  credentials: true,
}));

app.use(helmet());

// Cookie parser
app.use(cookieParser());

// Rate limiting global: 300 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);



// Webhook de Stripe necesita raw body para verificar la firma
app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));

// El resto usa JSON parseado
app.use(express.json({ limit: '10mb' }));

app.use('/api', routes);

// Connect to MongoDB then start server
connectDB().then(async () => {
  // Drop stale unique index on stats.accountId (field removed from schema)
  try {
    await mongoose.connection.collection('stats').dropIndex('accountId_1');
    console.info('Dropped stale accountId_1 index from stats collection');
  } catch { /* index doesn't exist — OK */ }

  startJobsWorker();
  resumeAllPolling();
  startCleanupWorker();
  startAlertScheduler();
  startTaxRateSyncWorker();

  const server = app.listen(PORT, () => {
    console.info(`Server running on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.info(`${signal} received, shutting down...`);
    server.close(async () => {
      try {
        await mongoose.connection.close();
      } catch (_) {}
      process.exit(0);
    });
    // Force exit after 30s if graceful shutdown fails
    setTimeout(() => process.exit(1), 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
