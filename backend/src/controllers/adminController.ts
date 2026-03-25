import { Response } from 'express';
import bcrypt from 'bcrypt';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { Account } from '../models/Account.js';
import { Subaccount } from '../models/Subaccount.js';
import { Subscription } from '../models/Subscription.js';
import { AuthRequest } from '../middleware/auth.js';

dotenv.config();

const SALT_ROUNDS = 10;

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-02-25.clover',
});

// ============= DASHBOARD STATS =============

export const getStats = async (_req: AuthRequest, res: Response) => {
  try {
    const totalUsers = await Account.countDocuments({ role: { $ne: 'admin' } });
    const allSubscriptions = await Subscription.find({});

    let active = 0;
    let trial = 0;
    let cancelled = 0;
    let expired = 0;
    let starterCount = 0;
    let advancedCount = 0;
    let monthlyCount = 0;
    let annualCount = 0;

    const now = new Date();

    for (const sub of allSubscriptions) {
      const periodEnd = new Date(sub.currentPeriodEnd);
      if (sub.status === 'trial') {
        if (periodEnd < now) expired++;
        else trial++;
      } else if (sub.status === 'active') {
        if (periodEnd < now) expired++;
        else active++;
      } else if (sub.status === 'canceled' || sub.status === 'cancelled') {
        cancelled++;
      } else {
        expired++;
      }

      if (sub.plan === 'starter') starterCount++;
      else if (sub.plan === 'advanced') advancedCount++;

      if (sub.interval === 'monthly') monthlyCount++;
      else if (sub.interval === 'annual') annualCount++;
    }

    // Fetch monthly revenue from Stripe
    let monthlyRevenue = 0;
    try {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const charges = await stripe.charges.list({
        created: { gte: Math.floor(startOfMonth.getTime() / 1000) },
        limit: 100,
      });
      for (const charge of charges.data) {
        if (charge.status === 'succeeded') {
          monthlyRevenue += charge.amount / 100; // cents to euros
        }
      }
    } catch (stripeErr) {
      console.error('Error fetching Stripe revenue:', stripeErr);
    }

    res.json({
      totalUsers,
      active,
      trial,
      cancelled,
      expired,
      starterCount,
      advancedCount,
      monthlyCount,
      annualCount,
      monthlyRevenue,
    });
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

// ============= USER SEARCH =============

export const searchUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { search = '', page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const filter: any = { role: { $ne: 'admin' } };
    if (search) {
      const searchStr = search as string;
      filter.$or = [
        { name: { $regex: searchStr, $options: 'i' } },
        { email: { $regex: searchStr, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      Account.find(filter)
        .select('-password -twoFactorSecret -recoveryCodes -emailVerificationToken -resetPasswordToken -resetPasswordExpires -googleAccessToken -googleRefreshToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Account.countDocuments(filter),
    ]);

    // Fetch subscriptions for these users
    const userIds = users.map((u: any) => u._id);
    const subscriptions = await Subscription.find({ accountId: { $in: userIds } }).lean();
    const subMap: Record<string, any> = {};
    for (const sub of subscriptions) {
      subMap[sub.accountId] = sub;
    }

    const results = users.map((u: any) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      country: u.country,
      createdAt: u.createdAt,
      emailVerified: u.emailVerified,
      twoFactorEnabled: u.twoFactorEnabled,
      disabled: u.disabled || false,
      subscription: subMap[u._id] ? {
        id: subMap[u._id]._id,
        plan: subMap[u._id].plan,
        interval: subMap[u._id].interval,
        status: subMap[u._id].status,
        currentPeriodStart: subMap[u._id].currentPeriodStart,
        currentPeriodEnd: subMap[u._id].currentPeriodEnd,
        trialEndDate: subMap[u._id].trialEndDate,
        autoRenew: subMap[u._id].autoRenew,
        stripeCustomerId: subMap[u._id].stripeCustomerId,
        stripeSubscriptionId: subMap[u._id].stripeSubscriptionId,
      } : null,
    }));

    res.json({ users: results, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Error al buscar usuarios' });
  }
};

// ============= USER DETAIL =============

export const getUserDetail = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await Account.findById(id)
      .select('-password -twoFactorSecret -recoveryCodes -emailVerificationToken -resetPasswordToken -resetPasswordExpires -googleAccessToken -googleRefreshToken')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const subscription = await Subscription.findOne({ accountId: id }).lean();
    const subaccounts = await Subaccount.find({ parentAccountId: id })
      .select('-password -twoFactorSecret -recoveryCodes -resetPasswordToken -resetPasswordExpires')
      .lean();

    res.json({
      user: {
        id: (user as any)._id,
        name: user.name,
        email: user.email,
        country: user.country,
        createdAt: user.createdAt,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        googleCalendarConnected: user.googleCalendarConnected,
        disabled: (user as any).disabled || false,
      },
      subscription: subscription ? subscription : null,
      subaccounts: subaccounts.map((s: any) => ({
        id: s._id,
        name: s.name,
        email: s.email,
        createdAt: s.createdAt,
        twoFactorEnabled: s.twoFactorEnabled,
      })),
    });
  } catch (error) {
    console.error('Error getting user detail:', error);
    res.status(500).json({ error: 'Error al obtener detalle del usuario' });
  }
};

// ============= MODIFY SUBSCRIPTION (via Stripe API + MongoDB) =============

export const modifySubscription = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { plan, interval, status, currentPeriodEnd } = req.body;

    const subscription = await Subscription.findOne({ accountId: id });
    if (!subscription) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }

    const now = new Date().toISOString();
    const warnings: string[] = [];

    // If changing plan/interval and has Stripe subscription, update in Stripe
    if ((plan || interval) && subscription.stripeSubscriptionId) {
      try {
        const PLANS: Record<string, { monthlyId: string; annualId: string }> = {
          starter: {
            monthlyId: process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_starter_monthly',
            annualId: process.env.STRIPE_PRICE_STARTER_ANNUAL || 'price_starter_annual',
          },
          advanced: {
            monthlyId: process.env.STRIPE_PRICE_ADVANCED_MONTHLY || 'price_advanced_monthly',
            annualId: process.env.STRIPE_PRICE_ADVANCED_ANNUAL || 'price_advanced_annual',
          },
        };

        const targetPlan = plan || subscription.plan;
        const targetInterval = interval || subscription.interval;
        const planConfig = PLANS[targetPlan];

        if (planConfig) {
          const newPriceId = targetInterval === 'monthly' ? planConfig.monthlyId : planConfig.annualId;
          const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
          const itemId = stripeSub.items.data[0]?.id;

          if (itemId) {
            await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
              items: [{ id: itemId, price: newPriceId }],
              proration_behavior: 'none',
            });
          }
        }
      } catch (stripeErr: any) {
        console.error('Error updating Stripe subscription:', stripeErr);
        warnings.push(`Stripe no actualizado (plan/intervalo): ${stripeErr?.message || 'Error desconocido'}. MongoDB sí fue actualizado.`);
      }
    }

    // If extending period and has Stripe subscription, update trial_end or cancel and recreate
    if (currentPeriodEnd && subscription.stripeSubscriptionId) {
      try {
        const newEnd = Math.floor(new Date(currentPeriodEnd).getTime() / 1000);
        // Use trial_end to extend the period without charging
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          trial_end: newEnd,
          proration_behavior: 'none',
        });
      } catch (stripeErr: any) {
        console.error('Error extending Stripe subscription period:', stripeErr);
        warnings.push(`Stripe no actualizado (periodo): ${stripeErr?.message || 'Error desconocido'}. MongoDB sí fue actualizado.`);
      }
    }

    // Update MongoDB
    if (plan) subscription.plan = plan;
    if (interval) subscription.interval = interval;
    if (status) subscription.status = status;
    if (currentPeriodEnd) {
      subscription.currentPeriodEnd = new Date(currentPeriodEnd).toISOString();
      // If period is set to the past, auto-expire and clear trial data
      if (new Date(currentPeriodEnd) < new Date()) {
        if (!status) subscription.status = 'expired';
        subscription.trialEndDate = null;
      }
    }
    subscription.updatedAt = now;

    await subscription.save();

    res.json({
      success: true,
      subscription: subscription.toJSON(),
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error) {
    console.error('Error modifying subscription:', error);
    res.status(500).json({ error: 'Error al modificar suscripción' });
  }
};

// ============= TOGGLE ACCOUNT STATUS =============

export const toggleAccountStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { disabled } = req.body;

    const user = await Account.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await user.updateOne({ $set: { disabled: !!disabled } });

    // If disabling account, cancel Stripe subscription immediately
    if (disabled) {
      const subscription = await Subscription.findOne({ accountId: id });
      if (subscription) {
        // Cancel in Stripe if active subscription exists
        if (subscription.stripeSubscriptionId) {
          try {
            await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
          } catch (stripeErr: any) {
            console.error('Error cancelling Stripe subscription on disable:', stripeErr?.message);
          }
        }

        // Detach payment method if exists
        if (subscription.stripePaymentMethodId) {
          try {
            await stripe.paymentMethods.detach(subscription.stripePaymentMethodId);
          } catch (pmErr: any) {
            console.error('Error detaching payment method on disable:', pmErr?.message);
          }
        }

        // Update MongoDB subscription — preserve currentPeriodEnd so remaining time
        // is kept in case the account is reactivated later
        subscription.status = 'canceled';
        subscription.autoRenew = false;
        subscription.stripeSubscriptionId = null;
        subscription.stripePaymentMethodId = null;
        subscription.paymentMethod = null;
        subscription.updatedAt = new Date().toISOString();
        await subscription.save();
      }
    }

    res.json({ success: true, disabled: !!disabled });
  } catch (error) {
    console.error('Error toggling account status:', error);
    res.status(500).json({ error: 'Error al cambiar estado de la cuenta' });
  }
};

// ============= CREATE ACCOUNT MANUALLY =============

export const createAccountManually = async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, country, plan, interval } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
    }

    // Check if email exists
    const existsInAccounts = await Account.findOne({ email });
    const existsInSubs = await Subaccount.findOne({ email });
    if (existsInAccounts || existsInSubs) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const id = Date.now().toString();
    const now = new Date().toISOString();

    await Account.create({
      _id: id,
      name,
      email,
      password: hashedPassword,
      country: country || 'ES',
      type: 'main',
      role: 'user',
      emailVerified: true, // Skip email verification for admin-created accounts
      createdAt: now,
    });

    // Create trial subscription
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    await Subscription.create({
      _id: (Date.now() + 1).toString(),
      accountId: id,
      plan: plan || 'starter',
      interval: interval || 'monthly',
      status: 'trial',
      trialEndDate: trialEnd.toISOString(),
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd.toISOString(),
      autoRenew: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePaymentMethodId: null,
      paymentMethod: null,
      createdAt: now,
      updatedAt: now,
    });

    res.json({ success: true, userId: id });
  } catch (error) {
    console.error('Error creating account manually:', error);
    res.status(500).json({ error: 'Error al crear cuenta' });
  }
};
