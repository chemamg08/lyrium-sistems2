import rateLimit from 'express-rate-limit';

// Rate limiting for login: 5 attempts per 15 minutes per IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in 15 minutes.' },
});

// Rate limiting for registration: 3 per hour per IP
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts, please try again later.' },
});

// Rate limiting for password reset: 5 per 15 minutes per IP
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts, please try again in 15 minutes.' },
});

// Rate limiting for 2FA setup/verify: 5 per 15 minutes per IP
export const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many 2FA attempts, please try again in 15 minutes.' },
});

// Rate limiting for email verification resend: 3 per 15 minutes per IP
export const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification email requests, please try again later.' },
});
