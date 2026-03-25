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
import improveAIRoutes from './improveAIRoutes.js';
import adminRoutes from './adminRoutes.js';
import signatureRoutes from './signatureRoutes.js';
import signPublicRoutes from './signPublicRoutes.js';
import apiKeyRoutes from './apiKeyRoutes.js';
import webhookRoutes from './webhookRoutes.js';
import publicApiRoutes from './publicApiRoutes.js';
import taxComplianceRoutes from './taxComplianceRoutes.js';
import { getStats, incrementStat } from '../controllers/statsController.js';

const router = Router();

// Public routes (no auth required)
router.get('/health', healthCheck);
router.use('/accounts', accountsRoutes);        // login/register are public
router.use('/subscriptions', subscriptionsRoutes); // webhook needs to be public
router.get('/calendar/callback', handleCallback); // Google OAuth callback (no JWT)
router.use('/sign', signPublicRoutes); // Public signing page API
router.use('/v1', publicApiRoutes); // Public API (API key auth inside)

// Admin routes (auth + admin middleware inside)
router.use('/admin', adminRoutes);

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
router.use('/tax-compliance', taxComplianceRoutes);
router.use('/jobs', jobsRoutes);
router.use('/automatizaciones', automatizacionesRoutes);
router.use('/shared-files', sharedFilesRoutes);
router.use('/improve-ai', improveAIRoutes);
router.use('/signatures', signatureRoutes);
router.use('/integrations/keys', apiKeyRoutes);
router.use('/integrations/webhooks', webhookRoutes);
router.use('/calendar', calendarRoutes);
router.get('/stats', getStats);
router.post('/stats/increment', incrementStat);

export default router;


