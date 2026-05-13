import Stripe from 'stripe';
import dotenv from 'dotenv';
import { Subscription } from '../models/Subscription.js';
import { runWithDistributedLock } from './distributedLockService.js';

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-02-25.clover',
});

type LocalPlanId = 'starter' | 'advanced' | 'individual';
type LocalInterval = 'monthly' | 'annual';

const PLANS = {
  starter: {
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_starter_monthly',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL || 'price_starter_annual',
  },
  advanced: {
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ADVANCED_MONTHLY || 'price_advanced_monthly',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ADVANCED_ANNUAL || 'price_advanced_annual',
  },
  individual: {
    stripePriceIdMonthly: process.env.STRIPE_PRICE_INDIVIDUAL_MONTHLY || 'price_individual_monthly',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_INDIVIDUAL_ANNUAL || 'price_individual_annual',
    stripePriceIdJuniorMonthly: process.env.STRIPE_PRICE_INDIVIDUAL_JUNIOR_MONTHLY || 'price_individual_junior_monthly',
    stripePriceIdJuniorAnnual: process.env.STRIPE_PRICE_INDIVIDUAL_JUNIOR_ANNUAL || 'price_individual_junior_annual',
  },
} as const;

const RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000;
const RECONCILIATION_LOCK_TTL_MS = 10 * 60 * 1000;
const MAX_SUBSCRIPTIONS_PER_RUN = 250;

function stripeTimestampToIso(timestamp?: number | null): string | null {
  return typeof timestamp === 'number'
    ? new Date(timestamp * 1000).toISOString()
    : null;
}

function getStripeSubscriptionPeriod(subscription: Stripe.Subscription): { start: number | null; end: number | null } {
  const firstItem = subscription.items?.data?.[0];
  const start = typeof firstItem?.current_period_start === 'number'
    ? firstItem.current_period_start
    : null;
  const end = typeof firstItem?.current_period_end === 'number'
    ? firstItem.current_period_end
    : null;

  return { start, end };
}

function getPlanAndIntervalFromPriceId(priceId?: string | null): { plan: LocalPlanId; interval: LocalInterval } | null {
  if (!priceId) {
    return null;
  }

  for (const [plan, config] of Object.entries(PLANS) as Array<[LocalPlanId, typeof PLANS[LocalPlanId]]>) {
    if (config.stripePriceIdMonthly === priceId) {
      return { plan, interval: 'monthly' };
    }
    if (config.stripePriceIdAnnual === priceId) {
      return { plan, interval: 'annual' };
    }
    if ('stripePriceIdJuniorMonthly' in config && config.stripePriceIdJuniorMonthly === priceId) {
      return { plan, interval: 'monthly' };
    }
    if ('stripePriceIdJuniorAnnual' in config && config.stripePriceIdJuniorAnnual === priceId) {
      return { plan, interval: 'annual' };
    }
  }

  return null;
}

function isStripeResourceMissingError(error: any): boolean {
  return error?.code === 'resource_missing'
    || error?.raw?.code === 'resource_missing'
    || error?.statusCode === 404;
}

function chooseCanonicalStripeSubscription(subscriptions: Stripe.Subscription[]): Stripe.Subscription | null {
  if (!subscriptions.length) {
    return null;
  }

  const statusPriority: Record<string, number> = {
    active: 100,
    trialing: 90,
    past_due: 80,
    unpaid: 70,
    incomplete: 60,
    paused: 50,
    canceled: 40,
    incomplete_expired: 30,
  };

  return [...subscriptions].sort((left, right) => {
    const leftPeriod = getStripeSubscriptionPeriod(left);
    const rightPeriod = getStripeSubscriptionPeriod(right);
    const byStatus = (statusPriority[right.status] || 0) - (statusPriority[left.status] || 0);
    if (byStatus !== 0) {
      return byStatus;
    }

    const byPeriodEnd = (rightPeriod.end || 0) - (leftPeriod.end || 0);
    if (byPeriodEnd !== 0) {
      return byPeriodEnd;
    }

    return (right.created || 0) - (left.created || 0);
  })[0] || null;
}

async function fetchRemoteSubscription(localSubscription: any): Promise<Stripe.Subscription | null> {
  if (localSubscription.stripeSubscriptionId) {
    try {
      return await stripe.subscriptions.retrieve(localSubscription.stripeSubscriptionId);
    } catch (error: any) {
      if (!isStripeResourceMissingError(error)) {
        throw error;
      }
    }
  }

  if (!localSubscription.stripeCustomerId) {
    return null;
  }

  const listed = await stripe.subscriptions.list({
    customer: localSubscription.stripeCustomerId,
    status: 'all',
    limit: 10,
  });

  return chooseCanonicalStripeSubscription(listed.data);
}

async function resolveStripeCardSummary(stripeSubscription: Stripe.Subscription): Promise<{ paymentMethodId: string | null; paymentMethod: { brand: string; last4: string } | null }> {
  let paymentMethodRef: string | Stripe.PaymentMethod | null = stripeSubscription.default_payment_method as string | Stripe.PaymentMethod | null;

  if (!paymentMethodRef && typeof stripeSubscription.customer === 'string') {
    const customer = await stripe.customers.retrieve(stripeSubscription.customer);
    if (!('deleted' in customer) || !customer.deleted) {
      paymentMethodRef = customer.invoice_settings.default_payment_method as string | Stripe.PaymentMethod | null;
    }
  }

  if (!paymentMethodRef) {
    return { paymentMethodId: null, paymentMethod: null };
  }

  const paymentMethod = typeof paymentMethodRef === 'string'
    ? await stripe.paymentMethods.retrieve(paymentMethodRef)
    : paymentMethodRef;

  if (paymentMethod.type !== 'card' || !paymentMethod.card) {
    return { paymentMethodId: paymentMethod.id, paymentMethod: null };
  }

  return {
    paymentMethodId: paymentMethod.id,
    paymentMethod: {
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
    },
  };
}

function mapStripeStatusToLocalStatus(remoteStatus: Stripe.Subscription.Status, remotePeriodEndIso: string | null, localStatus: string): string {
  if (remoteStatus === 'trialing') {
    return 'trial';
  }

  if (remoteStatus === 'past_due' || remoteStatus === 'unpaid' || remoteStatus === 'incomplete' || remoteStatus === 'incomplete_expired') {
    return 'past_due';
  }

  if (remoteStatus === 'canceled') {
    if (remotePeriodEndIso && new Date(remotePeriodEndIso) > new Date()) {
      return localStatus === 'trial' ? 'trial' : 'active';
    }
    return localStatus === 'trial' ? 'expired' : 'canceled';
  }

  return 'active';
}

async function reconcileSingleSubscription(localSubscription: any): Promise<{ accountId: string; updated: boolean; reason: string }> {
  const nowIso = new Date().toISOString();

  // Expiración automática de descuento junior (2 años desde appliedAt)
  if (localSubscription.juniorDiscount?.enabled && localSubscription.juniorDiscount?.appliedAt) {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    if (new Date(localSubscription.juniorDiscount.appliedAt) < twoYearsAgo) {
      const juniorUpdate: Record<string, any> = {
        'juniorDiscount.enabled': false,
        'juniorDiscount.status': 'expired',
        updatedAt: nowIso,
      };

      if (localSubscription.stripeSubscriptionId && localSubscription.interval) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(localSubscription.stripeSubscriptionId);
          const itemId = stripeSub.items?.data?.[0]?.id;
          if (itemId) {
            const basePriceId = localSubscription.interval === 'monthly'
              ? PLANS.individual.stripePriceIdMonthly
              : PLANS.individual.stripePriceIdAnnual;
            await stripe.subscriptions.update(localSubscription.stripeSubscriptionId, {
              items: [{ id: itemId, price: basePriceId }],
              proration_behavior: 'none',
            });
          }
        } catch (stripeErr: any) {
          console.error(`[stripeReconciliation] Error updating Stripe on junior expiry for account ${localSubscription.accountId}:`, stripeErr?.message);
        }
      }

      await Subscription.updateOne({ _id: localSubscription._id }, { $set: juniorUpdate });
      localSubscription.juniorDiscount.enabled = false;
      localSubscription.juniorDiscount.status = 'expired';
    }
  }

  const remoteSubscription = await fetchRemoteSubscription(localSubscription);

  if (!remoteSubscription) {
    const currentPeriodEnd = localSubscription.currentPeriodEnd ? new Date(localSubscription.currentPeriodEnd) : null;
    const localStatus = currentPeriodEnd && currentPeriodEnd <= new Date()
      ? (localSubscription.status === 'trial' ? 'expired' : 'canceled')
      : localSubscription.status;

    const update: Record<string, any> = {
      autoRenew: false,
      stripeSubscriptionId: null,
      updatedAt: nowIso,
    };

    if (localStatus !== localSubscription.status) {
      update.status = localStatus;
    }

    const hasChange = Object.entries(update).some(([key, value]) => localSubscription[key] !== value);
    if (!hasChange) {
      return { accountId: localSubscription.accountId, updated: false, reason: 'remote_subscription_missing_no_change' };
    }

    await Subscription.updateOne({ _id: localSubscription._id }, { $set: update });
    console.warn(`[stripeReconciliation] Cleared missing Stripe subscription for account ${localSubscription.accountId}`);
    return { accountId: localSubscription.accountId, updated: true, reason: 'remote_subscription_missing' };
  }

  const remotePlanInterval = getPlanAndIntervalFromPriceId(remoteSubscription.items.data[0]?.price?.id || null);
  const remotePeriod = getStripeSubscriptionPeriod(remoteSubscription);
  const remotePeriodStartIso = stripeTimestampToIso(remotePeriod.start);
  const remotePeriodEndIso = stripeTimestampToIso(remotePeriod.end);
  const remoteStatus = mapStripeStatusToLocalStatus(remoteSubscription.status, remotePeriodEndIso, localSubscription.status);
  const remoteAutoRenew = remoteSubscription.status !== 'canceled' && !remoteSubscription.cancel_at_period_end;
  const remoteStripeSubscriptionId = remoteSubscription.status === 'canceled' ? null : remoteSubscription.id;
  const remoteStripeCustomerId = typeof remoteSubscription.customer === 'string' ? remoteSubscription.customer : localSubscription.stripeCustomerId;
  const remoteCardSummary = await resolveStripeCardSummary(remoteSubscription);

  const update: Record<string, any> = {
    updatedAt: nowIso,
  };

  if (remotePlanInterval && remotePlanInterval.plan !== localSubscription.plan) {
    update.plan = remotePlanInterval.plan;
  }
  if (remotePlanInterval && remotePlanInterval.interval !== localSubscription.interval) {
    update.interval = remotePlanInterval.interval;
  }
  if (remotePeriodStartIso && remotePeriodStartIso !== localSubscription.currentPeriodStart) {
    update.currentPeriodStart = remotePeriodStartIso;
  }
  if (remotePeriodEndIso && remotePeriodEndIso !== localSubscription.currentPeriodEnd) {
    update.currentPeriodEnd = remotePeriodEndIso;
  }
  if (remoteStatus !== localSubscription.status) {
    update.status = remoteStatus;
  }
  if (remoteAutoRenew !== localSubscription.autoRenew) {
    update.autoRenew = remoteAutoRenew;
  }
  if (remoteStripeCustomerId !== localSubscription.stripeCustomerId) {
    update.stripeCustomerId = remoteStripeCustomerId;
  }
  if (remoteStripeSubscriptionId !== localSubscription.stripeSubscriptionId) {
    update.stripeSubscriptionId = remoteStripeSubscriptionId;
  }
  if (remoteCardSummary.paymentMethodId !== localSubscription.stripePaymentMethodId) {
    update.stripePaymentMethodId = remoteCardSummary.paymentMethodId;
  }

  const localPaymentMethod = JSON.stringify(localSubscription.paymentMethod || null);
  const remotePaymentMethod = JSON.stringify(remoteCardSummary.paymentMethod || null);
  if (localPaymentMethod !== remotePaymentMethod) {
    update.paymentMethod = remoteCardSummary.paymentMethod;
  }

  const changedKeys = Object.keys(update).filter((key) => key !== 'updatedAt');
  if (changedKeys.length === 0) {
    return { accountId: localSubscription.accountId, updated: false, reason: 'already_in_sync' };
  }

  await Subscription.updateOne({ _id: localSubscription._id }, { $set: update });
  console.info(`[stripeReconciliation] Corrected subscription for account ${localSubscription.accountId}: ${changedKeys.join(', ')}`);
  return { accountId: localSubscription.accountId, updated: true, reason: `updated:${changedKeys.join(',')}` };
}

export async function runStripeReconciliationOnce(): Promise<{ scanned: number; updated: number; skipped: boolean }> {
  const result = await runWithDistributedLock('stripe-reconciliation-service', RECONCILIATION_LOCK_TTL_MS, async () => {
    const localSubscriptions = await Subscription.find({
      $or: [
        { stripeCustomerId: { $ne: null } },
        { stripeSubscriptionId: { $ne: null } },
      ],
    })
      .sort({ updatedAt: 1 })
      .limit(MAX_SUBSCRIPTIONS_PER_RUN);

    let updated = 0;
    for (const localSubscription of localSubscriptions) {
      try {
        const reconciliation = await reconcileSingleSubscription(localSubscription);
        if (reconciliation.updated) {
          updated += 1;
        }
      } catch (error) {
        console.error(`[stripeReconciliation] Error reconciling account ${localSubscription.accountId}:`, error);
      }
    }

    return {
      scanned: localSubscriptions.length,
      updated,
      skipped: false,
    };
  });

  return result || { scanned: 0, updated: 0, skipped: true };
}

export function startStripeReconciliationWorker(): void {
  runStripeReconciliationOnce().catch((error) => {
    console.error('[stripeReconciliation] Error en ejecución inicial:', error);
  });

  setInterval(() => {
    runStripeReconciliationOnce().catch((error) => {
      console.error('[stripeReconciliation] Error en ejecución periódica:', error);
    });
  }, RECONCILIATION_INTERVAL_MS);
}