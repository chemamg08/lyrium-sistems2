import { Router } from 'express';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  getStats,
  searchUsers,
  getUserDetail,
  modifySubscription,
  toggleAccountStatus,
  createAccountManually,
} from '../controllers/adminController.js';

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

export default router;
