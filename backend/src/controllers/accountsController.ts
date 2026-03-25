import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import nodemailer from 'nodemailer';
import { Account } from '../models/Account.js';
import { Subaccount } from '../models/Subaccount.js';
import { Client } from '../models/Client.js';
import { Subscription } from '../models/Subscription.js';
import { generateToken, generateRefreshToken, setAuthCookies, clearAuthCookies, verifyRefreshToken, AuthPayload, verifyOwnership } from '../middleware/auth.js';

const SALT_ROUNDS = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

// Password validation: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) return { valid: false, error: 'Password must be at least 8 characters' };
  if (!/[A-Z]/.test(password)) return { valid: false, error: 'Password must contain at least one uppercase letter' };
  if (!/[a-z]/.test(password)) return { valid: false, error: 'Password must contain at least one lowercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, error: 'Password must contain at least one number' };
  if (!/[^A-Za-z0-9]/.test(password)) return { valid: false, error: 'Password must contain at least one special character' };
  return { valid: true };
}

// System email transporter for password reset and email verification
function getSystemTransporter() {
  return nodemailer.createTransport({
    host: process.env.SYSTEM_EMAIL_HOST || 'smtp.hostinger.com',
    port: Number(process.env.SYSTEM_EMAIL_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.SYSTEM_EMAIL_USER,
      pass: process.env.SYSTEM_EMAIL_PASS,
    },
  });
}

// Generate recovery codes
function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

// Check if account is locked
function isLocked(lockUntil: string | null | undefined): boolean {
  if (!lockUntil) return false;
  return new Date(lockUntil) > new Date();
}

// Handle failed login attempt
async function handleFailedLogin(user: any) {
  const attempts = (user.failedLoginAttempts || 0) + 1;
  const update: any = { failedLoginAttempts: attempts };
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    update.lockUntil = new Date(Date.now() + LOCK_TIME_MS).toISOString();
  }
  await user.updateOne({ $set: update });
}

// Reset failed login attempts
async function resetFailedAttempts(user: any) {
  if (user.failedLoginAttempts > 0 || user.lockUntil) {
    await user.updateOne({ $set: { failedLoginAttempts: 0, lockUntil: null } });
  }
}

// Cuentas principales
export const createAccount = async (req: Request, res: Response) => {
  try {
    const { name, email, password, country } = req.body;

    // Validate password strength
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.error });
    }

    // Verificar si el email ya existe
    const existsInAccounts = await Account.findOne({ email });
    const existsInSubs = await Subaccount.findOne({ email });

    if (existsInAccounts || existsInSubs) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const id = Date.now().toString();

    // Generate email verification token (expires in 24 hours)
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const newAccount = await Account.create({
      _id: id,
      name,
      email,
      password: hashedPassword,
      country: (country || 'ES').toUpperCase(),
      type: 'main',
      createdAt: new Date().toISOString(),
      emailVerified: false,
      emailVerificationToken,
      emailVerificationExpires,
    });

    // Crear suscripción de prueba automáticamente
    try {
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 14);

      await Subscription.create({
        _id: Date.now().toString(),
        accountId: id,
        plan: 'starter',
        interval: 'monthly',
        status: 'trial',
        trialEndDate: trialEndDate.toISOString(),
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: trialEndDate.toISOString(),
        autoRenew: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePaymentMethodId: null,
        paymentMethod: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error al crear suscripción de prueba:', error);
    }

    // Send verification email
    try {
      const frontendUrl = process.env.FRONTEND_URL;
      const verifyUrl = `${frontendUrl}/verify-email?token=${emailVerificationToken}`;
      const transporter = getSystemTransporter();
      try {
        await transporter.sendMail({
          from: `"Lyrium Systems" <${process.env.SYSTEM_EMAIL_USER}>`,
          to: email,
          subject: 'Verify your email - Lyrium Systems',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #333;">Welcome to Lyrium Systems</h2>
              <p>Hi ${name},</p>
              <p>Please verify your email address by clicking the button below:</p>
              <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #18181b; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">Verify Email</a>
              <p style="color: #666; font-size: 12px; margin-top: 24px;">If the button doesn't work, copy and paste this link: ${verifyUrl}</p>
              <p style="color: #666; font-size: 12px;">This link expires in 24 hours.</p>
            </div>
          `,
        });
      } finally {
        transporter.close();
      }
    } catch (emailErr) {
      console.error('Error sending verification email:', emailErr);
    }

    const accountObj = newAccount.toJSON();
    res.json({ success: true, account: { ...accountObj, password: undefined }, needsSetup2FA: true });
  } catch (error) {
    console.error('Error al crear cuenta:', error);
    res.status(500).json({ error: 'Error al crear cuenta' });
  }
};

// Setup 2FA - generate secret and QR URL
export const setup2FA = async (req: Request, res: Response) => {
  try {
    const { userId, userType } = req.body;

    const Model: any = userType === 'subaccount' ? Subaccount : Account;
    const user = await Model.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const secret = speakeasy.generateSecret({
      name: `Lyrium Systems (${user.email})`,
      issuer: 'Lyrium Systems',
      length: 32,
    });

    // Store the secret temporarily (not enabled yet until verified)
    await user.updateOne({ $set: { twoFactorSecret: secret.base32 } });

    res.json({
      success: true,
      otpauthUrl: secret.otpauth_url,
      secret: secret.base32,
    });
  } catch (error) {
    console.error('Error setting up 2FA:', error);
    res.status(500).json({ error: 'Error setting up 2FA' });
  }
};

// Verify 2FA setup - user enters code to confirm
export const verify2FASetup = async (req: Request, res: Response) => {
  try {
    const { userId, userType, token: totpToken } = req.body;

    const Model: any = userType === 'subaccount' ? Subaccount : Account;
    const user = await Model.findById(userId);
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ error: '2FA not initiated' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: totpToken,
      window: 1,
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid 2FA code' });
    }

    // Generate recovery codes
    const plainCodes = generateRecoveryCodes();
    const hashedCodes = await Promise.all(plainCodes.map(c => bcrypt.hash(c, SALT_ROUNDS)));

    await user.updateOne({
      $set: {
        twoFactorEnabled: true,
        recoveryCodes: hashedCodes,
      },
    });

    res.json({ success: true, recoveryCodes: plainCodes });
  } catch (error) {
    console.error('Error verifying 2FA setup:', error);
    res.status(500).json({ error: 'Error verifying 2FA' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password, totpCode, recoveryCode } = req.body;

    // Find user in both collections
    let user: any = await Account.findOne({ email });
    let userType: 'main' | 'subaccount' = 'main';

    if (!user) {
      user = await Subaccount.findOne({ email });
      userType = 'subaccount';
    }

    if (!user) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Check account lock
    if (isLocked(user.lockUntil)) {
      const lockEnd = new Date(user.lockUntil!);
      const minutesLeft = Math.ceil((lockEnd.getTime() - Date.now()) / 60000);
      return res.status(423).json({
        error: `Account locked. Try again in ${minutesLeft} minutes.`,
        locked: true,
        minutesLeft,
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await handleFailedLogin(user);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Check if account is disabled
    if (user.disabled) {
      return res.status(403).json({ error: 'Esta cuenta ha sido desactivada. Contacta con soporte.' });
    }

    if (userType === 'main' && !user.emailVerified && user.role !== 'admin') {
      return res.status(403).json({ error: 'Email not verified. Please check your inbox.', emailNotVerified: true });
    }

    // Admin accounts skip 2FA and subscription validation
    if (user.role === 'admin') {
      await resetFailedAttempts(user);

      const tokenPayload: any = {
        userId: user._id,
        email: user.email,
        type: 'main',
        role: 'admin',
      };

      const token = generateToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);
      setAuthCookies(res, token, refreshToken);

      return res.json({
        success: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          country: user.country || 'ES',
          type: 'main',
          role: 'admin',
        },
      });
    }

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!totpCode && !recoveryCode) {
        return res.status(403).json({ error: '2FA code required', requires2FA: true });
      }

      if (recoveryCode) {
        // Check recovery code
        let codeValid = false;
        let usedIndex = -1;
        for (let i = 0; i < (user.recoveryCodes || []).length; i++) {
          const match = await bcrypt.compare(recoveryCode.toUpperCase(), user.recoveryCodes[i]);
          if (match) {
            codeValid = true;
            usedIndex = i;
            break;
          }
        }
        if (!codeValid) {
          await handleFailedLogin(user);
          return res.status(401).json({ error: 'Invalid recovery code' });
        }
        // Remove used recovery code
        const updatedCodes = [...user.recoveryCodes];
        updatedCodes.splice(usedIndex, 1);
        await user.updateOne({ $set: { recoveryCodes: updatedCodes } });
      } else {
        // Verify TOTP
        const verified = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: totpCode,
          window: 1,
        });
        if (!verified) {
          await handleFailedLogin(user);
          return res.status(401).json({ error: 'Invalid 2FA code' });
        }
      }
    } else if (!user.twoFactorEnabled) {
      // 2FA not set up yet -> redirect to setup
      await resetFailedAttempts(user);
      return res.json({
        success: false,
        needs2FASetup: true,
        userId: user._id,
        userType,
      });
    }

    // Validate subscription
    const subscriptionAccountId = userType === 'subaccount' ? user.parentAccountId : user._id;
    const subscription = await Subscription.findOne({ accountId: subscriptionAccountId });
    if (!subscription) {
      return res.status(403).json({
        error: 'No se encontró suscripción',
        type: userType,
        needsPayment: userType === 'main',
        accountId: userType === 'main' ? user._id : undefined,
        email: user.email,
      });
    }

    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);
    if (periodEnd < now) {
      return res.status(403).json({
        error: userType === 'main'
          ? 'Tu suscripción ha caducado. Renueva tu plan para continuar.'
          : 'La suscripción de la cuenta principal ha caducado',
        type: userType,
        needsPayment: userType === 'main',
        accountId: userType === 'main' ? user._id : undefined,
        email: user.email,
      });
    }

    // Reset failed attempts on successful login
    await resetFailedAttempts(user);

    const tokenPayload: any = {
      userId: user._id,
      email: user.email,
      type: userType,
    };
    if (userType === 'subaccount') {
      tokenPayload.parentAccountId = user.parentAccountId;
    }

    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Set httpOnly cookies
    setAuthCookies(res, token, refreshToken);

    const parentAccount = userType === 'subaccount'
      ? await Account.findById(user.parentAccountId)
      : null;

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        country: userType === 'subaccount' ? (parentAccount?.country || 'ES') : (user.country || 'ES'),
        type: userType,
        parentAccountId: userType === 'subaccount' ? user.parentAccountId : undefined,
      },
    });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// Logout - clear cookies
export const logoutHandler = async (_req: Request, res: Response) => {
  clearAuthCookies(res);
  res.json({ success: true });
};

// Refresh access token using refresh token
export const refreshAccessToken = async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const decoded = verifyRefreshToken(token);
    const payload: AuthPayload = {
      userId: decoded.userId,
      email: decoded.email,
      type: decoded.type,
      ...(decoded.role && { role: decoded.role }),
      ...(decoded.parentAccountId && { parentAccountId: decoded.parentAccountId }),
    };

    const newAccessToken = generateToken(payload);
    // Set only the new access token cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('authToken', newAccessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 30 * 60 * 1000,
      path: '/',
    });

    res.json({ success: true });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
};

// Verify email
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const account = await Account.findOne({ emailVerificationToken: token });
    if (!account) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    if (account.emailVerificationExpires && new Date(account.emailVerificationExpires) < new Date()) {
      return res.status(400).json({ error: 'Verification token has expired. Please request a new one.' });
    }

    await account.updateOne({
      $set: { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).json({ error: 'Error verifying email' });
  }
};

// Resend verification email
export const resendVerificationEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const account = await Account.findOne({ email });
    if (!account || account.emailVerified) {
      // Always return success to avoid email enumeration
      return res.json({ success: true });
    }

    // Generate new token with 24h expiry
    const newToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await account.updateOne({ $set: { emailVerificationToken: newToken, emailVerificationExpires } });

    const frontendUrl = process.env.FRONTEND_URL;
    const verifyUrl = `${frontendUrl}/verify-email?token=${newToken}`;
    const transporter = getSystemTransporter();
    try {
      await transporter.sendMail({
        from: `"Lyrium Systems" <${process.env.SYSTEM_EMAIL_USER}>`,
        to: email,
        subject: 'Verify your email - Lyrium Systems',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Lyrium Systems</h2>
            <p>Please verify your email address by clicking the button below:</p>
            <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #18181b; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">Verify Email</a>
            <p style="color: #666; font-size: 12px; margin-top: 24px;">If the button doesn't work, copy and paste this link: ${verifyUrl}</p>
          </div>
        `,
      });
    } finally {
      transporter.close();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error resending verification email:', error);
    res.status(500).json({ error: 'Error resending verification email' });
  }
};

// Forgot password - send reset email
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Always respond success to avoid email enumeration
    const genericResponse = { success: true, message: 'If the email exists, a reset link has been sent.' };

    const user = (await Account.findOne({ email })) || (await Subaccount.findOne({ email }));
    if (!user) {
      return res.json(genericResponse);
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

    await user.updateOne({
      $set: { resetPasswordToken: resetTokenHash, resetPasswordExpires: expires },
    });

    // Send reset email
    const frontendUrl = process.env.FRONTEND_URL;
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    const transporter = getSystemTransporter();
    try {
      await transporter.sendMail({
        from: `"Lyrium Systems" <${process.env.SYSTEM_EMAIL_USER}>`,
        to: email,
        subject: 'Reset your password - Lyrium Systems',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Password Reset</h2>
            <p>Hi ${user.name},</p>
            <p>You requested a password reset. Click the button below to set a new password:</p>
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #18181b; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">Reset Password</a>
            <p style="color: #666; font-size: 12px; margin-top: 24px;">If the button doesn't work, copy and paste this link: ${resetUrl}</p>
            <p style="color: #666; font-size: 12px;">This link expires in 15 minutes.</p>
            <p style="color: #666; font-size: 12px;">If you didn't request this, ignore this email.</p>
          </div>
        `,
      });
    } finally {
      transporter.close();
    }

    res.json(genericResponse);
  } catch (error) {
    console.error('Error in forgot password:', error);
    res.status(500).json({ error: 'Error sending reset email' });
  }
};

// Reset password - set new password with token
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    // Validate new password
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.error });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Search in both collections
    let user: any = await Account.findOne({
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: new Date().toISOString() },
    });

    if (!user) {
      user = await Subaccount.findOne({
        resetPasswordToken: tokenHash,
        resetPasswordExpires: { $gt: new Date().toISOString() },
      });
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await user.updateOne({
      $set: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        failedLoginAttempts: 0,
        lockUntil: null,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Error resetting password' });
  }
};

// Subcuentas
export const createSubaccount = async (req: Request, res: Response) => {
  try {
    const { name, email, password, parentAccountId } = req.body;

    if (!parentAccountId) {
      return res.status(400).json({ error: 'parentAccountId es requerido' });
    }

    if (!verifyOwnership(req, parentAccountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    // Validate password strength
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.error });
    }

    // Verificar si el email ya existe
    const existsInAccounts = await Account.findOne({ email });
    const existsInSubs = await Subaccount.findOne({ email });

    if (existsInAccounts || existsInSubs) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const newSubaccount = await Subaccount.create({
      _id: Date.now().toString(),
      name,
      email,
      password: hashedPassword,
      type: 'subaccount',
      parentAccountId,
      createdAt: new Date().toISOString(),
    });

    const subObj = newSubaccount.toJSON();
    res.json({ success: true, subaccount: { ...subObj, password: undefined } });
  } catch (error) {
    console.error('Error al crear subcuenta:', error);
    res.status(500).json({ error: 'Error al crear subcuenta' });
  }
};

export const getSubaccounts = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }

    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const subaccounts = await Subaccount.find({ parentAccountId: accountId as string });

    const safeSubaccounts = subaccounts.map((acc) => ({
      id: acc._id,
      name: acc.name,
      email: acc.email,
      createdAt: acc.createdAt,
    }));

    res.json(safeSubaccounts);
  } catch (error) {
    console.error('Error al obtener subcuentas:', error);
    res.status(500).json({ error: 'Error al obtener subcuentas' });
  }
};

export const deleteSubaccount = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const sub = await Subaccount.findById(id);
    if (!sub) {
      return res.status(404).json({ error: 'Subcuenta no encontrada' });
    }
    if (!verifyOwnership(req, sub.parentAccountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    await Subaccount.findByIdAndDelete(id);

    // Remover la asignación de clientes
    await Client.updateMany(
      { assignedSubaccountId: id },
      { $unset: { assignedSubaccountId: '' } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error al eliminar subcuenta:', error);
    res.status(500).json({ error: 'Error al eliminar subcuenta' });
  }
};

export const assignClientToSubaccount = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    const { subaccountId } = req.body;

    const client = await Client.findById(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    if (!verifyOwnership(req, client.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    if (subaccountId) {
      client.assignedSubaccountId = subaccountId;
    } else {
      client.assignedSubaccountId = undefined as any;
    }

    await client.save();

    res.json({ success: true, client: client.toJSON() });
  } catch (error) {
    console.error('Error al asignar cliente:', error);
    res.status(500).json({ error: 'Error al asignar cliente' });
  }
};

export const getClientsBySubaccount = async (req: Request, res: Response) => {
  try {
    const { subaccountId } = req.params;

    const sub = await Subaccount.findById(subaccountId);
    if (sub && !verifyOwnership(req, sub.parentAccountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const clients = await Client.find({ assignedSubaccountId: subaccountId });

    res.json(clients.map(c => c.toJSON()));
  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
};

// Helper: verify 2FA code or recovery code, returns { valid, error?, usedRecoveryIndex? }
async function verify2FAOrRecovery(user: any, totpCode?: string, recoveryCode?: string): Promise<{ valid: boolean; error?: string; usedRecoveryIndex?: number }> {
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    return { valid: false, error: '2FA is not enabled on this account' };
  }

  if (!totpCode && !recoveryCode) {
    return { valid: false, error: '2FA code or recovery code required' };
  }

  if (totpCode) {
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1,
    });
    if (!verified) return { valid: false, error: 'Invalid 2FA code' };
    return { valid: true };
  }

  // Recovery code
  for (let i = 0; i < (user.recoveryCodes || []).length; i++) {
    const match = await bcrypt.compare(recoveryCode!.toUpperCase(), user.recoveryCodes[i]);
    if (match) {
      return { valid: true, usedRecoveryIndex: i };
    }
  }
  return { valid: false, error: 'Invalid recovery code' };
}

// Change email (requires: password + 2FA/recovery code)
export const changeEmail = async (req: Request, res: Response) => {
  try {
    const { accountId, newEmail, password, totpCode, recoveryCode } = req.body;

    if (!accountId || !newEmail || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const account = await Account.findById(accountId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // Verify password
    const passwordMatch = await bcrypt.compare(password, account.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // Verify 2FA or recovery code
    const verification = await verify2FAOrRecovery(account, totpCode, recoveryCode);
    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    // Check new email isn't already used
    const existsInAccounts = await Account.findOne({ email: newEmail });
    const existsInSubs = await Subaccount.findOne({ email: newEmail });
    if (existsInAccounts || existsInSubs) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // If recovery code was used, consume it
    if (verification.usedRecoveryIndex !== undefined) {
      const updatedCodes = [...(account.recoveryCodes || [])];
      updatedCodes.splice(verification.usedRecoveryIndex, 1);
      await account.updateOne({ $set: { recoveryCodes: updatedCodes } });
    }

    // Generate new verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');

    // Update email
    await account.updateOne({
      $set: {
        email: newEmail,
        emailVerified: false,
        emailVerificationToken,
      },
    });

    // Send verification email to new address
    try {
      const frontendUrl = process.env.FRONTEND_URL;
      const verifyUrl = `${frontendUrl}/verify-email?token=${emailVerificationToken}`;
      const transporter = getSystemTransporter();
      try {
        await transporter.sendMail({
          from: `"Lyrium Systems" <${process.env.SYSTEM_EMAIL_USER}>`,
          to: newEmail,
          subject: 'Verify your new email - Lyrium Systems',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #333;">Email Changed</h2>
              <p>Hi ${account.name},</p>
              <p>Your email has been changed. Please verify your new email address:</p>
              <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #18181b; color: #fff; text-decoration: none; border-radius: 6px; margin: 16px 0;">Verify Email</a>
              <p style="color: #666; font-size: 12px; margin-top: 24px;">If the button doesn't work, copy and paste this link: ${verifyUrl}</p>
            </div>
          `,
        });
      } finally {
        transporter.close();
      }
    } catch (emailErr) {
      console.error('Error sending verification email:', emailErr);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error changing email:', error);
    res.status(500).json({ error: 'Error changing email' });
  }
};

// Change password (requires: 2FA/recovery code only)
export const changePassword = async (req: Request, res: Response) => {
  try {
    const { accountId, newPassword, totpCode, recoveryCode } = req.body;

    if (!accountId || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate new password strength
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ error: pwCheck.error });
    }

    const account = await Account.findById(accountId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // Verify 2FA or recovery code
    const verification = await verify2FAOrRecovery(account, totpCode, recoveryCode);
    if (!verification.valid) {
      return res.status(401).json({ error: verification.error });
    }

    // If recovery code was used, consume it
    if (verification.usedRecoveryIndex !== undefined) {
      const updatedCodes = [...(account.recoveryCodes || [])];
      updatedCodes.splice(verification.usedRecoveryIndex, 1);
      await account.updateOne({ $set: { recoveryCodes: updatedCodes } });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await account.updateOne({
      $set: {
        password: hashedPassword,
        failedLoginAttempts: 0,
        lockUntil: null,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Error changing password' });
  }
};
