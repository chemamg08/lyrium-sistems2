import { Router } from 'express';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  getStats,
  searchUsers,
  getUserDetail,
  modifySubscription,
  toggleAccountStatus,
  createAccountManually,
  verifyJunior,
  getJuniorVerifications,
  getPromoCodes,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  getRevenue,
  getInvoicesByDateRange,
} from '../controllers/adminController.js';
import { getSuggestions, deleteSuggestion } from '../controllers/suggestionController.js';

const router = Router();

// All admin routes require auth + admin role
router.use(authMiddleware as any);
router.use(adminMiddleware as any);

router.get('/stats', getStats as any);
router.get('/users', searchUsers as any);
router.get('/users/:id', getUserDetail as any);
router.put('/users/:id/subscription', modifySubscription as any);
router.put('/users/:id/status', toggleAccountStatus as any);
router.post('/users', createAccountManually as any);
router.post('/users/:id/verify-junior', verifyJunior as any);
router.get('/junior-verifications', getJuniorVerifications as any);
router.get('/suggestions', getSuggestions as any);
router.delete('/suggestions/:id', deleteSuggestion as any);
router.get('/promo-codes', getPromoCodes as any);
router.post('/promo-codes', createPromoCode as any);
router.put('/promo-codes/:id', updatePromoCode as any);
router.delete('/promo-codes/:id', deletePromoCode as any);
router.get('/revenue', getRevenue as any);
router.get('/invoices', getInvoicesByDateRange as any);

export default router;
