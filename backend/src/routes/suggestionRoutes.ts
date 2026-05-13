import { Router } from 'express';
import { createSuggestion } from '../controllers/suggestionController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.post('/', authMiddleware as any, createSuggestion as any);
export default router;
