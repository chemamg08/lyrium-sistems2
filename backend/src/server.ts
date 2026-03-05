import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes/index.js';
import { connectDB } from './db/connection.js';
import { startJobsWorker } from './services/jobsService.js';
import { resumeAllPolling } from './services/emailProcessorService.js';
import { startCleanupWorker } from './services/cleanupService.js';
import { startAlertScheduler } from './services/alertScheduler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://lyrium.io', 'https://www.lyrium.io']
    : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'],
  credentials: true,
}));

// Webhook de Stripe necesita raw body para verificar la firma
app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));

// El resto usa JSON parseado
app.use(express.json());

app.use('/api', routes);

// Connect to MongoDB then start server
connectDB().then(() => {
  startJobsWorker();
  resumeAllPolling();
  startCleanupWorker();
  startAlertScheduler();

  app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('❌ No se pudo conectar a MongoDB:', err);
  process.exit(1);
});
