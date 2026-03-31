import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('FATAL: JWT_SECRET environment variable is not set.');
    process.exit(1);
  }
  return secret;
}

export interface AuthPayload {
  userId: string;
  email: string;
  type: 'main' | 'subaccount';
  role?: string;
  parentAccountId?: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

// Access token: short-lived (30 minutes)
export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '30m' });
}

// Refresh token: long-lived (7 days)
export function generateRefreshToken(payload: AuthPayload): string {
  return jwt.sign({ ...payload, tokenType: 'refresh' }, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, getJwtSecret()) as AuthPayload;
}

export function verifyRefreshToken(token: string): AuthPayload {
  const decoded = jwt.verify(token, getJwtSecret()) as AuthPayload & { tokenType?: string };
  if ((decoded as any).tokenType !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  return decoded;
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieBase = {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };

  res.cookie('authToken', accessToken, {
    ...cookieBase,
    maxAge: 30 * 60 * 1000, // 30 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieBase,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// Keep backward compatibility
export function setAuthCookie(res: Response, token: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('authToken', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 30 * 60 * 1000, // 30 minutes
    path: '/',
  });
}

export function clearAuthCookies(res: Response) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieBase = {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: 0,
    path: '/',
  };
  res.cookie('authToken', '', cookieBase);
  res.cookie('refreshToken', '', cookieBase);
}

// Keep backward compatibility
export function clearAuthCookie(res: Response) {
  clearAuthCookies(res);
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // Allow internal job requests (from jobsService polling endpoints)
  const internalSecret = process.env.INTERNAL_JOB_SECRET;
  if (internalSecret && req.headers['x-internal-job'] === internalSecret) {
    return next();
  }

  // Try cookie first, then Authorization header as fallback
  let token = req.cookies?.authToken;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;

    // Skip disabled check for admin users
    if (decoded.role === 'admin') {
      return next();
    }

    // Check if account is disabled (async, non-blocking for performance)
    checkAccountDisabled(decoded, res, next);
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

async function checkAccountDisabled(decoded: AuthPayload, res: Response, next: NextFunction) {
  try {
    const { Account } = await import('../models/Account.js');

    // Check if the user's own account is disabled
    const user = await Account.findById(decoded.userId).select('disabled').lean();
    if (user && (user as any).disabled) {
      return res.status(403).json({ error: 'Esta cuenta ha sido desactivada. Contacta con soporte.' });
    }

    // For subaccounts, also check if the parent account is disabled
    if (decoded.type === 'subaccount' && decoded.parentAccountId) {
      const parent = await Account.findById(decoded.parentAccountId).select('disabled').lean();
      if (parent && (parent as any).disabled) {
        return res.status(403).json({ error: 'La cuenta principal ha sido desactivada. Contacta con soporte.' });
      }
    }

    next();
  } catch (err) {
    // If check fails, allow through (fail open) — login check is still the primary guard
    console.error('Error checking disabled status:', err);
    next();
  }
}

export async function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  // Fast path: role already in JWT
  if (req.user.role === 'admin') {
    return next();
  }

  // Fallback: verify admin role from database
  try {
    const { Account } = await import('../models/Account.js');
    const account = await Account.findById(req.user.userId).select('role').lean();
    if (account && (account as any).role === 'admin') {
      req.user.role = 'admin';
      return next();
    }
  } catch (err) {
    console.error('Error checking admin role:', err);
  }

  return res.status(403).json({ error: 'Acceso denegado: se requiere rol de administrador' });
}

/**
 * Verify that the authenticated user has access to the given accountId.
 * Works for main accounts, subaccounts and admins.
 */
export function verifyOwnership(req: Request, accountId: string): boolean {
  // Allow internal job requests (no user context, but already authenticated via INTERNAL_JOB_SECRET)
  const internalSecret = process.env.INTERNAL_JOB_SECRET;
  if (internalSecret && req.headers['x-internal-job'] === internalSecret) return true;

  const user = (req as any).user as AuthPayload | undefined;
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.userId === accountId) return true;
  if (user.type === 'subaccount' && user.parentAccountId === accountId) return true;
  return false;
}
