import { Router } from 'express';
import { healthCheck } from '../controllers/healthController.js';
import { authMiddleware } from '../middleware/auth.js';
import { handleCallback } from '../controllers/calendarController.js';
import calendarRoutes from './calendarRoutes.js';
import contractsRoutes from './contractsRoutes.js';
import clientsRoutes from './clientsRoutes.js';
import defenseChatRoutes from './defenseChatRoutes.js';
import chatsRoutes from './chatsRoutes.js';
import contractsChatRoutes from './contractsChatRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import documentSummariesRoutes from './documentSummariesRoutes.js';
import accountsRoutes from './accountsRoutes.js';
import writingRoutes from './writingRoutes.js';
import fiscalRoutes from './fiscalRoutes.js';
import jobsRoutes from './jobsRoutes.js';
import assistantRoutes from './assistantRoutes.js';
import calculosRoutes from './calculosRoutes.js';
import automatizacionesRoutes from './automatizacionesRoutes.js';
import subscriptionsRoutes from '../subscriptions.js';
import sharedFilesRoutes from './sharedFilesRoutes.js';
import { getStats, incrementStat } from '../controllers/statsController.js';

const router = Router();

// Public routes (no auth required)
router.get('/health', healthCheck);
router.use('/accounts', accountsRoutes);        // login/register are public
router.use('/subscriptions', subscriptionsRoutes); // webhook needs to be public
router.get('/calendar/callback', handleCallback); // Google OAuth callback (no JWT)

// Protected routes (auth required)
router.use(authMiddleware as any);
router.use('/', contractsRoutes);
router.use('/', clientsRoutes);
router.use('/defense-chat', defenseChatRoutes);
router.use('/chats', chatsRoutes);
router.use('/contracts/chat', contractsChatRoutes);
router.use('/summaries/chat', documentSummariesRoutes);
router.use('/settings', settingsRoutes);
router.use('/writing-texts', writingRoutes);
router.use('/assistant', assistantRoutes);
router.use('/calculos', calculosRoutes);
router.use('/fiscal', fiscalRoutes);
router.use('/jobs', jobsRoutes);
router.use('/automatizaciones', automatizacionesRoutes);
router.use('/shared-files', sharedFilesRoutes);
router.use('/calendar', calendarRoutes);
router.get('/stats', getStats);
router.post('/stats/increment', incrementStat);

export default router;


