import express from 'express';
import { 
  createAccount, 
  login, 
  logoutHandler,
  refreshAccessToken,
  setup2FA,
  verify2FASetup,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  createSubaccount, 
  getSubaccounts, 
  deleteSubaccount,
  assignClientToSubaccount,
  getClientsBySubaccount,
  changeEmail,
  changePassword,
  getBillingProfile,
  updateBillingProfile
} from '../controllers/accountsController.js';
import { authMiddleware } from '../middleware/auth.js';
import { loginLimiter, registerLimiter, passwordResetLimiter, twoFactorLimiter, resendVerificationLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Cuentas principales
router.post('/register', registerLimiter, createAccount);
router.post('/login', loginLimiter, login);
router.post('/logout', logoutHandler);
router.post('/refresh', refreshAccessToken);

// 2FA setup (public - called right after registration)
router.post('/setup-2fa', twoFactorLimiter, setup2FA);
router.post('/verify-2fa-setup', twoFactorLimiter, verify2FASetup);

// Email verification
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', resendVerificationLimiter, resendVerificationEmail);

// Password reset
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);

// Subcuentas (auth required)
router.post('/subaccounts', authMiddleware as any, createSubaccount);
router.get('/subaccounts', authMiddleware as any, getSubaccounts);
router.delete('/subaccounts/:id', authMiddleware as any, deleteSubaccount);

// Asignación de clientes (auth required)
router.post('/clients/:clientId/assign', authMiddleware as any, assignClientToSubaccount);
router.get('/subaccounts/:subaccountId/clients', authMiddleware as any, getClientsBySubaccount);

// Account information changes (auth required)
router.post('/change-email', authMiddleware as any, changeEmail);
router.post('/change-password', authMiddleware as any, changePassword);

// Billing profile (auth required)
router.get('/billing-profile', authMiddleware as any, getBillingProfile);
router.put('/billing-profile', authMiddleware as any, updateBillingProfile);

export default router;
