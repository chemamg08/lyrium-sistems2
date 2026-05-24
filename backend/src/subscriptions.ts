import { Request, Response, Router } from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Subscription } from './models/Subscription.js';
import { Account } from './models/Account.js';
import { PromoCode } from './models/PromoCode.js';
import { Invoice, generateInvoicePublicId } from './models/Invoice.js';
import { StripeWebhookEvent } from './models/StripeWebhookEvent.js';
import { authMiddleware, verifyOwnership, type AuthRequest } from './middleware/auth.js';
import {
  generateInvoicePDF,
  sendInvoiceEmail,
  buildInvoiceNumber,
  buildConcept,
  formatShortDate,
  type InvoiceData,
} from './services/invoiceService.js';

// Cargar variables de entorno
dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-02-25.clover',
});

type LocalPlanId = 'starter' | 'advanced' | 'individual';
type LocalInterval = 'monthly' | 'annual';

interface StripeWebhookContext {
  accountId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  objectId: string | null;
}

interface PlanConfig {
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  stripePriceIdMonthly: string;
  stripePriceIdAnnual: string;
  stripePriceIdJuniorMonthly?: string;
  stripePriceIdJuniorAnnual?: string;
  maxSubaccounts: number;
}

// Configuración de planes
const PLANS: Record<LocalPlanId, PlanConfig> = {
  starter: {
    name: 'Starter',
    monthlyPrice: 197,
    annualPrice: 2100,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_starter_monthly',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL || 'price_starter_annual',
    maxSubaccounts: 4,
  },
  advanced: {
    name: 'Avanzado',
    monthlyPrice: 350,
    annualPrice: 3700,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ADVANCED_MONTHLY || 'price_advanced_monthly',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ADVANCED_ANNUAL || 'price_advanced_annual',
    maxSubaccounts: 10,
  },
  individual: {
    name: 'Individual',
    monthlyPrice: 50,
    annualPrice: 500,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_INDIVIDUAL_MONTHLY || 'price_individual_monthly',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_INDIVIDUAL_ANNUAL || 'price_individual_annual',
    stripePriceIdJuniorMonthly: process.env.STRIPE_PRICE_INDIVIDUAL_JUNIOR_MONTHLY || 'price_individual_junior_monthly',
    stripePriceIdJuniorAnnual: process.env.STRIPE_PRICE_INDIVIDUAL_JUNIOR_ANNUAL || 'price_individual_junior_annual',
    maxSubaccounts: 0,
  },
};

const STRIPE_WEBHOOK_PROCESSING_STALE_MS = 10 * 60 * 1000;

function stripeTimestampToIso(timestamp?: number | null): string | null {
  return typeof timestamp === 'number'
    ? new Date(timestamp * 1000).toISOString()
    : null;
}

function getPlanAndIntervalFromPriceId(priceId?: string | null): { plan: LocalPlanId; interval: LocalInterval } | null {
  if (!priceId) {
    return null;
  }

  for (const [plan, config] of Object.entries(PLANS) as Array<[LocalPlanId, PlanConfig]>) {
    if (config.stripePriceIdMonthly === priceId) {
      return { plan, interval: 'monthly' };
    }
    if (config.stripePriceIdAnnual === priceId) {
      return { plan, interval: 'annual' };
    }
    if (config.stripePriceIdJuniorMonthly === priceId) {
      return { plan, interval: 'monthly' };
    }
    if (config.stripePriceIdJuniorAnnual === priceId) {
      return { plan, interval: 'annual' };
    }
  }

  return null;
}

function extractWebhookContext(event: Stripe.Event): StripeWebhookContext {
  const object = event.data.object as any;
  const baseContext: StripeWebhookContext = {
    accountId: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    objectId: typeof object?.id === 'string' ? object.id : null,
  };

  switch (event.type) {
    case 'checkout.session.completed':
      return {
        ...baseContext,
        accountId: typeof object?.metadata?.accountId === 'string' ? object.metadata.accountId : null,
        stripeCustomerId: typeof object?.customer === 'string' ? object.customer : null,
        stripeSubscriptionId: typeof object?.subscription === 'string' ? object.subscription : null,
      };
    case 'payment_intent.succeeded':
      return {
        ...baseContext,
        accountId: typeof object?.metadata?.accountId === 'string' ? object.metadata.accountId : null,
        stripeCustomerId: typeof object?.customer === 'string' ? object.customer : null,
      };
    case 'payment_method.attached':
      return {
        ...baseContext,
        stripeCustomerId: typeof object?.customer === 'string' ? object.customer : null,
      };
    case 'invoice.paid':
    case 'invoice.payment_failed':
      return {
        ...baseContext,
        stripeCustomerId: typeof object?.customer === 'string' ? object.customer : null,
        stripeSubscriptionId: typeof object?.subscription === 'string' ? object.subscription : null,
      };
    case 'customer.subscription.deleted':
      return {
        ...baseContext,
        stripeCustomerId: typeof object?.customer === 'string' ? object.customer : null,
        stripeSubscriptionId: typeof object?.id === 'string' ? object.id : null,
      };
    default:
      return baseContext;
  }
}

function getInvoiceLinePeriod(invoice: Stripe.Invoice): { start: Date | null; end: Date | null } {
  const lines = ((invoice as any)?.lines?.data || []) as Array<any>;
  const withPeriod = lines.find((line) => typeof line?.period?.end === 'number') || lines[0];

  const startSeconds = typeof withPeriod?.period?.start === 'number'
    ? withPeriod.period.start
    : typeof (invoice as any)?.period_start === 'number'
      ? (invoice as any).period_start
      : null;
  const endSeconds = typeof withPeriod?.period?.end === 'number'
    ? withPeriod.period.end
    : typeof (invoice as any)?.period_end === 'number'
      ? (invoice as any).period_end
      : null;

  return {
    start: startSeconds ? new Date(startSeconds * 1000) : null,
    end: endSeconds ? new Date(endSeconds * 1000) : null,
  };
}

function getStripeSubscriptionPeriod(subscription: Stripe.Subscription): { start: Date | null; end: Date | null } {
  const firstItem = subscription.items?.data?.[0];
  const startSeconds = typeof (subscription as any).current_period_start === 'number'
    ? (subscription as any).current_period_start
    : typeof firstItem?.current_period_start === 'number'
      ? firstItem.current_period_start
      : null;
  const endSeconds = typeof (subscription as any).current_period_end === 'number'
    ? (subscription as any).current_period_end
    : typeof firstItem?.current_period_end === 'number'
      ? firstItem.current_period_end
      : null;

  return {
    start: startSeconds ? new Date(startSeconds * 1000) : null,
    end: endSeconds ? new Date(endSeconds * 1000) : null,
  };
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  if (!subscriptionRef) {
    return null;
  }

  return typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id;
}

function hasLocalStateMovedPastEvent(subscription: any, candidatePeriodEnd: Date | null, eventCreatedAtIso: string | null): boolean {
  const localPeriodEnd = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;

  if (subscription?.status === 'canceled' || subscription?.status === 'expired') {
    if (!candidatePeriodEnd) {
      return true;
    }

    if (localPeriodEnd && !Number.isNaN(localPeriodEnd.getTime()) && localPeriodEnd.getTime() >= candidatePeriodEnd.getTime()) {
      return true;
    }
  }

  if (
    localPeriodEnd
    && candidatePeriodEnd
    && !Number.isNaN(localPeriodEnd.getTime())
    && localPeriodEnd.getTime() > candidatePeriodEnd.getTime()
  ) {
    return true;
  }

  if (
    localPeriodEnd
    && candidatePeriodEnd
    && !Number.isNaN(localPeriodEnd.getTime())
    && localPeriodEnd.getTime() === candidatePeriodEnd.getTime()
    && subscription?.updatedAt
    && eventCreatedAtIso
  ) {
    const localUpdatedAt = new Date(subscription.updatedAt);
    const eventCreatedAt = new Date(eventCreatedAtIso);
    if (!Number.isNaN(localUpdatedAt.getTime()) && !Number.isNaN(eventCreatedAt.getTime()) && localUpdatedAt.getTime() > eventCreatedAt.getTime()) {
      return true;
    }
  }

  return false;
}

function isStripeResourceMissingError(error: any): boolean {
  return error?.code === 'resource_missing'
    || error?.raw?.code === 'resource_missing'
    || error?.statusCode === 404;
}

async function claimStripeWebhookEvent(event: Stripe.Event, context: StripeWebhookContext) {
  const nowIso = new Date().toISOString();
  const stripeCreatedAt = stripeTimestampToIso(event.created);

  let record = await StripeWebhookEvent.findById(event.id);

  if (!record) {
    try {
      record = await StripeWebhookEvent.create({
        _id: event.id,
        type: event.type,
        status: 'processing',
        attempts: 1,
        accountId: context.accountId,
        stripeCustomerId: context.stripeCustomerId,
        stripeSubscriptionId: context.stripeSubscriptionId,
        objectId: context.objectId,
        stripeCreatedAt,
        processingStartedAt: nowIso,
        processedAt: null,
        ignoredReason: null,
        lastError: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      return { state: 'claimed' as const, record };
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }

      record = await StripeWebhookEvent.findById(event.id);
    }
  }

  if (!record) {
    throw new Error(`Stripe webhook event ${event.id} could not be claimed`);
  }

  if (record.status === 'processed' || record.status === 'ignored') {
    return { state: 'duplicate' as const, record };
  }

  const processingStartedAt = record.processingStartedAt ? new Date(record.processingStartedAt).getTime() : 0;
  const isStaleProcessing = record.status === 'processing'
    && (processingStartedAt <= 0 || Date.now() - processingStartedAt > STRIPE_WEBHOOK_PROCESSING_STALE_MS);

  if (record.status === 'processing' && !isStaleProcessing) {
    return { state: 'processing' as const, record };
  }

  record.type = event.type;
  record.status = 'processing';
  record.attempts = (record.attempts || 0) + 1;
  record.accountId = context.accountId;
  record.stripeCustomerId = context.stripeCustomerId;
  record.stripeSubscriptionId = context.stripeSubscriptionId;
  record.objectId = context.objectId;
  record.stripeCreatedAt = stripeCreatedAt;
  record.processingStartedAt = nowIso;
  record.processedAt = null;
  record.ignoredReason = null;
  record.lastError = null;
  record.updatedAt = nowIso;
  await record.save();

  return { state: 'reclaimed' as const, record };
}

async function finalizeStripeWebhookEvent(
  record: any,
  status: 'processed' | 'ignored' | 'failed',
  context: StripeWebhookContext,
  extra: { ignoredReason?: string | null; lastError?: string | null } = {}
): Promise<void> {
  record.status = status;
  record.accountId = context.accountId;
  record.stripeCustomerId = context.stripeCustomerId;
  record.stripeSubscriptionId = context.stripeSubscriptionId;
  record.objectId = context.objectId;
  record.processingStartedAt = null;
  record.processedAt = new Date().toISOString();
  record.ignoredReason = extra.ignoredReason || null;
  record.lastError = extra.lastError || null;
  record.updatedAt = new Date().toISOString();
  await record.save();
}

const calculateTrialEndDate = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 14); // 14 días de prueba
  return date.toISOString();
};

function requireMainAccountAccess(req: Request, res: Response, accountId?: string): accountId is string {
  if (!accountId) {
    res.status(400).json({ error: 'accountId es requerido' });
    return false;
  }

  if (!verifyOwnership(req, accountId)) {
    res.status(403).json({ error: 'Acceso denegado' });
    return false;
  }

  const user = (req as AuthRequest).user;
  if (!user) {
    res.status(401).json({ error: 'Token de autenticación requerido' });
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  if (user.type !== 'main' || user.userId !== accountId) {
    res.status(403).json({ error: 'Solo la cuenta principal puede gestionar la suscripción y las subcuentas' });
    return false;
  }

  return true;
}

function calcularHuella(firmNIF: string, invoiceNumber: string, date: string, totalAmount: number, huellaAnterior: string): string {
  const input = `${firmNIF}|${invoiceNumber}|${date}|${totalAmount.toFixed(2)}|${huellaAnterior}`;
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex').toUpperCase();
}

/**
 * Generate a PDF invoice and email it to the account holder.
 * Called after a successful payment (first or renewal).
 * Runs asynchronously — errors are logged but don't block payment flow.
 */
async function generateAndSendInvoice(
  accountId: string,
  plan: string,
  interval: string,
  totalAmount: number,
  periodStart: Date,
  periodEnd: Date,
  cardBrand: string,
  cardLast4: string,
): Promise<void> {
  try {
    const account = await Account.findByIdAndUpdate(
      accountId,
      { $inc: { nextInvoiceNumber: 1 } },
      { returnDocument: 'before' }
    );

    if (!account) {
      console.error(`[Invoice] Account ${accountId} not found, skipping invoice`);
      return;
    }

    const currentNumber = account.nextInvoiceNumber || 1;
    const invoiceNumber = buildInvoiceNumber(currentNumber);
    const invoiceId = Date.now().toString();
    const publicInvoiceId = generateInvoicePublicId();
    const dateStr = new Date().toISOString().split('T')[0];
    const ownerNIF = process.env.INVOICE_OWNER_NIF || '';

    // Calculate chained hash
    const lastInvoice = await Invoice.findOne({ huella: { $ne: '' } }).sort({ verifactuTimestamp: -1 });
    const huellaAnterior = lastInvoice?.huella || '';
    const huella = ownerNIF ? calcularHuella(ownerNIF, invoiceNumber, dateStr, totalAmount, huellaAnterior) : '';
    const verifactuTimestamp = huella ? new Date().toISOString() : '';

    // Save to MongoDB first
    await Invoice.create({
      _id: invoiceId,
      clientId: 'subscription',
      accountId,
      invoiceNumber,
      publicId: publicInvoiceId,
      date: dateStr,
      firmName: process.env.INVOICE_OWNER_NAME || '',
      firmAddress: process.env.INVOICE_OWNER_ADDRESS || '',
      firmPhone: '',
      firmNIF: ownerNIF,
      firmInfo: '',
      paymentMethod: `${cardBrand} •••• ${cardLast4}`,
      clientName: account.companyName || account.name || '',
      clientEmail: account.companyEmail || account.email,
      clientPhone: account.companyPhone || '',
      taxRate: 0,
      lines: [{ id: '1', concept: buildConcept(plan, interval), quantity: 1, price: totalAmount, subtotal: totalAmount }],
      baseAmount: totalAmount,
      taxAmount: 0,
      totalAmount,
      huella,
      huellaAnterior,
      verifactuTimestamp,
    });

    // Generate PDF with QR
    const invoiceData: InvoiceData = {
      invoiceNumber,
      date: new Date(),
      clientName: account.companyName || account.name || '',
      clientAddress: account.companyAddress || '',
      clientPhone: account.companyPhone || '',
      clientEmail: account.companyEmail || account.email,
      clientCIF: account.companyCIF || '',
      clientNotes: account.invoiceNotes || '',
      concept: buildConcept(plan, interval),
      periodStart: formatShortDate(periodStart),
      periodEnd: formatShortDate(periodEnd),
      totalAmount,
      countryCode: account.country || 'ES',
      cardBrand: cardBrand || '',
      cardLast4: cardLast4 || '****',
      ownerName: process.env.INVOICE_OWNER_NAME || '',
      ownerNIF: ownerNIF,
      ownerAddress: process.env.INVOICE_OWNER_ADDRESS || '',
      huella,
      huellaAnterior,
      publicInvoiceId,
    };

    const pdfBuffer = await generateInvoicePDF(invoiceData);
    await sendInvoiceEmail(account.email, invoiceNumber, pdfBuffer);

    console.log(`[Invoice] Sent ${invoiceNumber} to ${account.email}`);
  } catch (error) {
    console.error('[Invoice] Error generating/sending invoice:', error);
  }
}

// ============= CONTROLLERS =============

// Crear suscripción inicial (automático al crear cuenta)
export const createTrialSubscription = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;

    if (!requireMainAccountAccess(req, res, accountId)) {
      return;
    }

    // Verificar si ya existe una suscripción
    const existing = await Subscription.findOne({ accountId });
    if (existing) {
      return res.status(400).json({ error: 'La cuenta ya tiene una suscripción' });
    }

    const now = new Date().toISOString();
    const trialEndDate = calculateTrialEndDate();

    const newSubscription = await Subscription.create({
      _id: Date.now().toString(),
      accountId,
      plan: 'starter',
      interval: 'monthly',
      status: 'trial',
      trialEndDate,
      currentPeriodStart: now,
      currentPeriodEnd: trialEndDate,
      autoRenew: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePaymentMethodId: null,
      paymentMethod: null,
      createdAt: now,
      updatedAt: now,
    });

    res.json({ success: true, subscription: newSubscription.toJSON() });
  } catch (error) {
    console.error('Error al crear suscripción de prueba:', error);
    res.status(500).json({ error: 'Error al crear suscripción de prueba' });
  }
};

// Obtener suscripción por accountId
export const getSubscription = async (req: Request, res: Response) => {
  try {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;

    if (!requireMainAccountAccess(req, res, accountId)) {
      return;
    }

    const subscription = await Subscription.findOne({ accountId });

    if (!subscription) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }

    // Comprobar expiración automática de descuento junior (2 años desde appliedAt)
    if (subscription.juniorDiscount?.enabled && subscription.juniorDiscount?.appliedAt) {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      if (new Date(subscription.juniorDiscount.appliedAt) < twoYearsAgo) {
        subscription.juniorDiscount.enabled = false;
        subscription.juniorDiscount.status = 'expired';

        if (subscription.stripeSubscriptionId && subscription.interval) {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
            const itemId = stripeSub.items?.data?.[0]?.id;
            if (itemId) {
              const basePriceId = subscription.interval === 'monthly'
                ? PLANS.individual.stripePriceIdMonthly
                : PLANS.individual.stripePriceIdAnnual;
              await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
                items: [{ id: itemId, price: basePriceId }],
                proration_behavior: 'none',
              });
            }
          } catch (stripeErr: any) {
            console.error('Error updating Stripe subscription on junior expiry:', stripeErr?.message);
          }
        }

        subscription.updatedAt = new Date().toISOString();
        await subscription.save();
      }
    }

    res.json(subscription.toJSON());
  } catch (error) {
    console.error('Error al obtener suscripción:', error);
    res.status(500).json({ error: 'Error al obtener suscripción' });
  }
};

// Crear Setup Intent o Subscription (para formulario embebido)
export const createPaymentIntent = async (req: Request, res: Response) => {
  try {
    const { accountId, plan, interval, autoRenew, isJunior, promoCode: promoCodeInput } = req.body;

    if (!requireMainAccountAccess(req, res, accountId)) {
      return;
    }

    if (!plan || !interval) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const planConfig = PLANS[plan as LocalPlanId];
    if (!planConfig) {
      return res.status(400).json({ error: 'Plan no válido' });
    }

    const useJunior = plan === 'individual' && !!isJunior;
    let amount = interval === 'monthly' ? planConfig.monthlyPrice : planConfig.annualPrice;
    if (useJunior) {
      amount = interval === 'monthly' ? 40 : 420;
    }

    let appliedPromo: any = null;
    let stripeCouponId: string | undefined;
    if (promoCodeInput) {
      const promo = await PromoCode.findOne({ code: promoCodeInput.toUpperCase() });
      if (promo && promo.active) {
        const expired = promo.expiresAt ? new Date(promo.expiresAt) < new Date() : false;
        const exhausted = promo.maxUses != null && promo.usedCount >= promo.maxUses;
        if (!expired && !exhausted) {
          appliedPromo = promo;
          if (promo.type === 'percentage_discount') {
            amount = Math.round(amount * (1 - promo.value / 100));
          } else if (promo.type === 'free_months') {
            amount = 0;
          }
        }
      }
    }

    let subscription = await Subscription.findOne({ accountId });

    // Crear o obtener Stripe Customer
    let customerId = subscription?.stripeCustomerId;
    
    // Leer email del usuario desde Account model
    let userEmail: string | undefined;
    try {
      const account = await Account.findById(accountId);
      userEmail = account?.email;
    } catch (error) {
      console.error('Error al leer email del usuario:', error);
    }
    
    if (!customerId) {
      // Crear nuevo customer con email
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { accountId },
      });
      customerId = customer.id;
      
      // Actualizar suscripción con customerId
      if (subscription) {
        await Subscription.updateOne(
          { accountId },
          { stripeCustomerId: customerId, updatedAt: new Date().toISOString() }
        );
        subscription.stripeCustomerId = customerId;
      }
    } else {
      // Verificar que el customer existe en Stripe, si no crear uno nuevo
      try {
        const existingCustomer = await stripe.customers.retrieve(customerId);
        if (existingCustomer && !existingCustomer.deleted && !existingCustomer.email && userEmail) {
          await stripe.customers.update(customerId, {
            email: userEmail,
          });
        }
      } catch (error: any) {
        if (error?.code === 'resource_missing' || error?.statusCode === 404) {
          const newCustomer = await stripe.customers.create({
            email: userEmail,
            metadata: { accountId },
          });
          customerId = newCustomer.id;
          if (subscription) {
            await Subscription.updateOne(
              { accountId },
              { stripeCustomerId: customerId, updatedAt: new Date().toISOString() }
            );
            subscription.stripeCustomerId = customerId;
          }
        } else {
          console.error('Error al verificar customer:', error);
        }
      }
    }

    if (autoRenew) {
      // Renovación automática: guardar tarjeta y cobrar al finalizar el trial
      let priceId: string;
      if (useJunior && planConfig.stripePriceIdJuniorMonthly && planConfig.stripePriceIdJuniorAnnual) {
        priceId = interval === 'monthly' ? planConfig.stripePriceIdJuniorMonthly : planConfig.stripePriceIdJuniorAnnual;
      } else {
        priceId = interval === 'monthly' ? planConfig.stripePriceIdMonthly : planConfig.stripePriceIdAnnual;
      }

      // Si ya tiene una suscripción Stripe activa, cancelarla antes de crear una nueva
      if (subscription?.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
          subscription.stripeSubscriptionId = null;
          await subscription.save();
        } catch (cancelErr: any) {
        }
      }

      // Calcular fecha de fin del trial (desde la suscripción actual)
      // Solo dar trial si el usuario está actualmente en trial con fecha futura
      // y su periodo actual no ha sido expirado manualmente (ej: por admin)
      let trialEndTimestamp: number | undefined;
      const now = Math.floor(Date.now() / 1000);
      if (subscription && subscription.status === 'trial' && subscription.trialEndDate) {
        const trialEndDate = new Date(subscription.trialEndDate);
        const ts = Math.floor(trialEndDate.getTime() / 1000);
        // Verificar que el periodo actual no haya expirado (admin puede haberlo puesto en el pasado)
        const periodStillValid = !subscription.currentPeriodEnd || new Date(subscription.currentPeriodEnd) > new Date();
        // Solo usar trial_end si está en el futuro Y el periodo sigue vigente
        if (ts > now && periodStillValid) {
          trialEndTimestamp = ts;
        }
      }
      // Si el usuario ya consumió su trial o fue expirado por admin,
      // trialEndTimestamp queda undefined y Stripe cobrará de inmediato

      // Crear coupon de Stripe si aplica descuento porcentaje
      if (appliedPromo && appliedPromo.type === 'percentage_discount') {
        try {
          const coupon = await stripe.coupons.create({
            percent_off: appliedPromo.value,
            duration: 'repeating',
            duration_in_months: appliedPromo.durationMonths,
          });
          stripeCouponId = coupon.id;
        } catch (couponErr: any) {
          console.error('Error creating Stripe coupon:', couponErr?.message);
        }
      }

      let trialEndForStripe = trialEndTimestamp;
      if (appliedPromo && appliedPromo.type === 'free_months') {
        const extraMonths = appliedPromo.value;
        const baseDate = trialEndTimestamp ? new Date(trialEndTimestamp * 1000) : new Date();
        baseDate.setMonth(baseDate.getMonth() + extraMonths);
        trialEndForStripe = Math.floor(baseDate.getTime() / 1000);
      }

      // Crear suscripción con trial - Stripe cobrará automáticamente al finalizar
      const stripeSubscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        ...(trialEndForStripe ? { trial_end: trialEndForStripe } : { payment_behavior: 'default_incomplete' }),
        ...(trialEndForStripe ? {} : { expand: ['latest_invoice.payment_intent'] }),
        ...(stripeCouponId ? { coupon: stripeCouponId } : {}),
        payment_settings: { 
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription' 
        },
        metadata: {
          accountId,
          plan,
          interval,
        },
      });

      if (trialEndTimestamp) {
        // Trial activo: crear SetupIntent para guardar la tarjeta sin cobrar
        const setupIntent = await stripe.setupIntents.create({
          customer: customerId,
          usage: 'off_session',
          metadata: {
            accountId,
            subscription_id: stripeSubscription.id,
          },
        });

        res.json({ 
          clientSecret: setupIntent.client_secret,
          setupIntentId: setupIntent.id,
          subscriptionId: stripeSubscription.id,
          customerId,
          promoCode: appliedPromo ? { code: appliedPromo.code, type: appliedPromo.type, value: appliedPromo.value, durationMonths: appliedPromo.durationMonths } : null,
        });
      } else {
        // Trial expirado + autoRenew: usar SetupIntent (igual que trial activo)
        // Al vincular el PM a la suscripción, Stripe pagará la invoice pendiente automáticamente
        const setupIntent = await stripe.setupIntents.create({
          customer: customerId,
          usage: 'off_session',
          metadata: {
            accountId,
            subscription_id: stripeSubscription.id,
          },
        });

        res.json({ 
          clientSecret: setupIntent.client_secret,
          setupIntentId: setupIntent.id,
          subscriptionId: stripeSubscription.id,
          customerId,
          promoCode: appliedPromo ? { code: appliedPromo.code, type: appliedPromo.type, value: appliedPromo.value, durationMonths: appliedPromo.durationMonths } : null,
        });
      }
    } else {
      // Pago único (sin renovación automática)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100,
        currency: 'eur',
        customer: customerId,
        setup_future_usage: undefined,
        metadata: {
          accountId,
          plan,
          interval,
          autoRenew: 'false',
          promoCode: appliedPromo ? appliedPromo.code : undefined,
        },
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        customerId,
        promoCode: appliedPromo ? { code: appliedPromo.code, type: appliedPromo.type, value: appliedPromo.value, durationMonths: appliedPromo.durationMonths } : null,
      });
    }
  } catch (error) {
    console.error('Error al crear payment intent:', error);
    res.status(500).json({ error: 'Error al crear payment intent' });
  }
};

// Confirmar pago exitoso
export const confirmPayment = async (req: Request, res: Response) => {
  try {
    const { accountId, plan, interval, paymentIntentId, setupIntentId, subscriptionId, isJunior, proofUrl, promoCode: promoCodeInput } = req.body;

    if (!requireMainAccountAccess(req, res, accountId)) {
      return;
    }

    if (!plan || !interval) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    let subscription = await Subscription.findOne({ accountId });

    if (!subscription) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }

    const now = new Date().toISOString();
    let periodEnd: Date;

    // Obtener método de pago
    let paymentMethod = null;
    
    if (setupIntentId && subscriptionId) {
      // Renovación automática con SetupIntent: tarjeta guardada, cobro al final del trial
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      
      if (setupIntent.payment_method) {
        const paymentMethodId = setupIntent.payment_method as string;
        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
        
        if (pm.card) {
          paymentMethod = {
            brand: pm.card.brand,
            last4: pm.card.last4,
          };
          subscription.stripePaymentMethodId = pm.id;
        }
        
        // Vincular el payment method a la suscripción
        await stripe.subscriptions.update(subscriptionId, {
          default_payment_method: paymentMethodId,
        });

        // Si el trial ya expiró, pagar la factura pendiente con la tarjeta recién guardada
        const trialEnd = subscription.trialEndDate ? new Date(subscription.trialEndDate) : null;
        if (!trialEnd || trialEnd <= new Date()) {
          const stripeSub = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['latest_invoice'],
          });
          const latestInvoice = stripeSub.latest_invoice as Stripe.Invoice;
          if (latestInvoice && latestInvoice.status === 'open') {
            await stripe.invoices.pay(latestInvoice.id);
          }
        }
      }

      // Con autoRenew, calcular periodo según si el trial sigue activo o ya expiró
      if (subscription.trialEndDate) {
        const trialEnd = new Date(subscription.trialEndDate);
        if (trialEnd > new Date()) {
          // Trial activo: el periodo termina cuando expire el trial
          periodEnd = trialEnd;
        } else {
          // Trial expirado: el periodo empieza ahora + intervalo
          periodEnd = new Date();
          if (interval === 'monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
          } else {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          }
        }
      } else {
        // Sin trialEndDate: usar el intervalo contratado
        periodEnd = new Date();
        if (interval === 'monthly') {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        // Sumar días restantes del periodo activo anterior (para no perderlos)
        if (subscription.status === 'active' && subscription.currentPeriodEnd) {
          const prevPeriodEnd = new Date(subscription.currentPeriodEnd);
          const nowDate = new Date();
          if (prevPeriodEnd > nowDate) {
            const remainingDays = Math.ceil((prevPeriodEnd.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
            periodEnd.setDate(periodEnd.getDate() + remainingDays);
          }
        }
      }
    } else if (paymentIntentId) {
      // Pago con cobro inmediato (puede ser autoRenew con trial expirado o pago único)
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (subscriptionId) {
        // Con autoRenew: obtener el PM desde la Stripe Subscription
        // (save_default_payment_method: 'on_subscription' lo guarda automáticamente al pagar la invoice)
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        const defaultPm = stripeSub.default_payment_method;
        
        if (defaultPm) {
          const pmId = typeof defaultPm === 'string' ? defaultPm : defaultPm.id;
          const pm = await stripe.paymentMethods.retrieve(pmId);
          if (pm.card) {
            paymentMethod = {
              brand: pm.card.brand,
              last4: pm.card.last4,
            };
            subscription.stripePaymentMethodId = pm.id;
          }
        } else if (paymentIntent.payment_method) {
          // Fallback: adjuntar manualmente el PM del PaymentIntent
          const paymentMethodId = paymentIntent.payment_method as string;
          try {
            await stripe.paymentMethods.attach(paymentMethodId, {
              customer: subscription.stripeCustomerId!,
            });
          } catch (attachError: any) {
          }
          await stripe.subscriptions.update(subscriptionId, {
            default_payment_method: paymentMethodId,
          });
          const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
          if (pm.card) {
            paymentMethod = {
              brand: pm.card.brand,
              last4: pm.card.last4,
            };
            subscription.stripePaymentMethodId = pm.id;
          }
        }
      } else if (paymentIntent.payment_method) {
        // Pago único sin autoRenew — solo guardar info de la tarjeta
        const paymentMethodId = paymentIntent.payment_method as string;
        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
        if (pm.card) {
          paymentMethod = {
            brand: pm.card.brand,
            last4: pm.card.last4,
          };
          subscription.stripePaymentMethodId = pm.id;
        }
      }

      // Calcular periodo: fecha actual + intervalo + días de trial restantes
      periodEnd = new Date();
      if (interval === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      // Sumar días de prueba restantes
      if (subscription.status === 'trial' && subscription.trialEndDate) {
        const trialEndDate = new Date(subscription.trialEndDate);
        const nowDate = new Date();
        if (trialEndDate > nowDate) {
          const remainingDays = Math.ceil((trialEndDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
          periodEnd.setDate(periodEnd.getDate() + remainingDays);
        }
      }

      // Sumar días restantes del plan activo anterior (cambio de plan sin auto-renovación)
      if (subscription.status === 'active' && subscription.currentPeriodEnd) {
        const prevPeriodEnd = new Date(subscription.currentPeriodEnd);
        const nowDate = new Date();
        if (prevPeriodEnd > nowDate) {
          const remainingDays = Math.ceil((prevPeriodEnd.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
          periodEnd.setDate(periodEnd.getDate() + remainingDays);
        }
      }
    } else {
      return res.status(400).json({ error: 'Se requiere paymentIntentId o setupIntentId' });
    }

    // Sync Stripe subscription billing cycle with our calculated periodEnd
    // (which may include remaining days from a previous active period)
    if (subscriptionId) {
      try {
        const periodEndTimestamp = Math.floor(periodEnd.getTime() / 1000);
        await stripe.subscriptions.update(subscriptionId, {
          trial_end: periodEndTimestamp,
          proration_behavior: 'none',
        });
      } catch (stripeErr: any) {
        console.error('Error syncing Stripe billing cycle:', stripeErr?.message);
      }
    }

    subscription.plan = plan as LocalPlanId;
    subscription.interval = interval as LocalInterval;
    subscription.status = 'active';
    subscription.trialEndDate = null;
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = periodEnd.toISOString();
    subscription.autoRenew = !!subscriptionId;
    subscription.stripeSubscriptionId = subscriptionId || null;
    subscription.paymentMethod = paymentMethod;

    // Guardar código promocional aplicado
    if (promoCodeInput) {
      subscription.promoCode = promoCodeInput.toUpperCase();
      subscription.promoCodeAppliedAt = now;
    } else if (!subscription.promoCode) {
      subscription.promoCode = null;
      subscription.promoCodeAppliedAt = null;
    }

    if (plan === 'individual' && isJunior) {
      subscription.juniorDiscount = {
        enabled: true,
        proofUrl: proofUrl || null,
        status: 'pending',
        appliedAt: null,
        verifiedAt: null,
        verifiedBy: null,
        originalPrice: interval === 'monthly' ? 50 : 500,
        finalPrice: interval === 'monthly' ? 40 : 420,
      };
    } else if (subscription.juniorDiscount && plan !== 'individual') {
      subscription.juniorDiscount = null;
    }

    subscription.updatedAt = now;

    await subscription.save();

    // Generate and send invoice asynchronously (don't block response)
    const planConfig = PLANS[plan as LocalPlanId];
    if (planConfig) {
      let invoiceAmount = interval === 'monthly' ? planConfig.monthlyPrice : planConfig.annualPrice;
      if (plan === 'individual' && isJunior) {
        invoiceAmount = interval === 'monthly' ? 40 : 420;
      }
      generateAndSendInvoice(
        accountId,
        plan,
        interval,
        invoiceAmount,
        new Date(now),
        periodEnd,
        paymentMethod?.brand || '',
        paymentMethod?.last4 || '',
      ).catch(err => console.error('[Invoice] async error:', err));
    }

    res.json({ success: true, subscription: subscription.toJSON() });
  } catch (error) {
    console.error('Error al confirmar pago:', error);
    res.status(500).json({ error: 'Error al confirmar pago' });
  }
};

// Webhook de Stripe
export const handleWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    let context = extractWebhookContext(event);
    const claim = await claimStripeWebhookEvent(event, context);

    if (claim.state === 'duplicate' || claim.state === 'processing') {
      return res.json({ received: true, duplicate: true });
    }

    const eventRecord = claim.record;
    let ignoredReason: string | null = null;
    const eventCreatedAtIso = stripeTimestampToIso(event.created);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const { accountId, plan, interval, autoRenew } = session.metadata || {};

        if (!accountId) {
          ignoredReason = 'missing_account_id';
          break;
        }

        context.accountId = accountId;
        context.stripeCustomerId = typeof session.customer === 'string' ? session.customer : context.stripeCustomerId;
        context.stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : context.stripeSubscriptionId;

        const subscription = await Subscription.findOne({ accountId });
        if (!subscription) {
          ignoredReason = 'local_subscription_not_found';
          break;
        }

        const now = new Date().toISOString();

        // Calcular currentPeriodEnd
        let periodEnd = new Date();
        if (interval === 'monthly') {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        // Si hay días de prueba restantes, sumarlos
        if (subscription?.status === 'trial' && subscription.trialEndDate) {
          const trialEndDate = new Date(subscription.trialEndDate);
          const nowDate = new Date();
          if (trialEndDate > nowDate) {
            const remainingDays = Math.ceil((trialEndDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
            periodEnd.setDate(periodEnd.getDate() + remainingDays);
          }
        }

        if (hasLocalStateMovedPastEvent(subscription, periodEnd, eventCreatedAtIso)) {
          ignoredReason = 'stale_checkout_session_completed';
          break;
        }

        subscription.plan = plan as LocalPlanId;
        subscription.interval = interval as LocalInterval;
        subscription.status = 'active';
        subscription.trialEndDate = null;
        subscription.currentPeriodStart = now;
        subscription.currentPeriodEnd = periodEnd.toISOString();
        subscription.autoRenew = autoRenew === 'true';
        subscription.stripeCustomerId = session.customer as string;
        subscription.stripeSubscriptionId = session.subscription as string || null;
        subscription.updatedAt = now;
        await subscription.save();
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { accountId, plan, interval, autoRenew } = paymentIntent.metadata || {};

        if (!accountId) {
          ignoredReason = 'missing_account_id';
          break;
        }

        if (autoRenew === 'true') {
          ignoredReason = 'auto_renew_managed_by_invoice_paid';
          break;
        }

        context.accountId = accountId;
        context.stripeCustomerId = typeof paymentIntent.customer === 'string' ? paymentIntent.customer : context.stripeCustomerId;

        const subscription = await Subscription.findOne({ accountId });
        if (!subscription) {
          ignoredReason = 'local_subscription_not_found';
          break;
        }

        const now = new Date().toISOString();
        let periodEnd = new Date();

        if (interval === 'monthly') {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        } else {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        }

        if (subscription.status === 'trial' && subscription.trialEndDate) {
          const trialEndDate = new Date(subscription.trialEndDate);
          const nowDate = new Date();
          if (trialEndDate > nowDate) {
            const remainingDays = Math.ceil((trialEndDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
            periodEnd.setDate(periodEnd.getDate() + remainingDays);
          }
        }

        if (hasLocalStateMovedPastEvent(subscription, periodEnd, eventCreatedAtIso)) {
          ignoredReason = 'stale_payment_intent_succeeded';
          break;
        }

        subscription.plan = plan as LocalPlanId;
        subscription.interval = interval as LocalInterval;
        subscription.status = 'active';
        subscription.trialEndDate = null;
        subscription.currentPeriodStart = now;
        subscription.currentPeriodEnd = periodEnd.toISOString();
        subscription.autoRenew = false;
        subscription.stripeCustomerId = typeof paymentIntent.customer === 'string' ? paymentIntent.customer : subscription.stripeCustomerId;
        subscription.updatedAt = now;

        await subscription.save();
        break;
      }

      case 'payment_method.attached': {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        const customerId = paymentMethod.customer as string;

        context.stripeCustomerId = customerId || context.stripeCustomerId;

        const subscription = await Subscription.findOne({ stripeCustomerId: customerId });
        if (!subscription) {
          ignoredReason = 'local_subscription_not_found';
          break;
        }

        context.accountId = subscription.accountId;
        context.stripeSubscriptionId = subscription.stripeSubscriptionId;

        if (subscription && paymentMethod.card) {
          subscription.stripePaymentMethodId = paymentMethod.id;
          subscription.paymentMethod = {
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
          };
          subscription.updatedAt = new Date().toISOString();
          await subscription.save();
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        context.stripeCustomerId = customerId || context.stripeCustomerId;

        // Solo procesar facturas de renovación real (subscription_cycle)
        // Ignorar: subscription_update (proration de changePlan) y subscription_create (factura $0 del trial)
        // confirmPayment ya maneja las fechas correctas para pagos iniciales y cambios de plan
        const billingReason = (invoice as any).billing_reason;
        if (billingReason === 'subscription_update' || billingReason === 'subscription_create') {
          ignoredReason = `ignored_billing_reason_${billingReason}`;
          break;
        }

        const subscription = await Subscription.findOne({ stripeCustomerId: customerId });
        if (!subscription) {
          ignoredReason = 'local_subscription_not_found';
          break;
        }

        context.accountId = subscription.accountId;
        const invoiceSubscriptionId = getInvoiceSubscriptionId(invoice);
        context.stripeSubscriptionId = invoiceSubscriptionId || subscription.stripeSubscriptionId;

        let periodStart = new Date();
        let periodEnd: Date | null = null;

        if (invoiceSubscriptionId) {
          try {
            const stripeSubscription = await stripe.subscriptions.retrieve(invoiceSubscriptionId);
            context.stripeSubscriptionId = stripeSubscription.id;
            const stripePeriod = getStripeSubscriptionPeriod(stripeSubscription);
            if (stripePeriod.start) {
              periodStart = stripePeriod.start;
            }
            periodEnd = stripePeriod.end;

            const planAndInterval = getPlanAndIntervalFromPriceId(stripeSubscription.items.data[0]?.price?.id || null);
            if (planAndInterval) {
              subscription.plan = planAndInterval.plan;
              subscription.interval = planAndInterval.interval;
            }
            subscription.autoRenew = stripeSubscription.status !== 'canceled' && !stripeSubscription.cancel_at_period_end;
            subscription.stripeSubscriptionId = stripeSubscription.id;
          } catch (stripeErr: any) {
            if (!isStripeResourceMissingError(stripeErr)) {
              console.error('Error retrieving Stripe subscription for invoice.paid:', stripeErr?.message || stripeErr);
            }
          }
        }

        if (!periodEnd) {
          const invoicePeriod = getInvoiceLinePeriod(invoice);
          if (invoicePeriod.start) {
            periodStart = invoicePeriod.start;
          }
          periodEnd = invoicePeriod.end;
        }

        if (!periodEnd) {
          periodEnd = new Date();
          if (subscription.interval === 'monthly') {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
          } else {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          }
        }

        if (hasLocalStateMovedPastEvent(subscription, periodEnd, eventCreatedAtIso)) {
          ignoredReason = 'stale_invoice_paid';
          break;
        }

        const now = new Date().toISOString();
        subscription.currentPeriodStart = periodStart.toISOString();
        subscription.currentPeriodEnd = periodEnd.toISOString();
        subscription.status = 'active';
        subscription.updatedAt = now;
        await subscription.save();

        const renewalPlanConfig = PLANS[subscription.plan as LocalPlanId];
        if (renewalPlanConfig) {
          const renewalAmount = subscription.interval === 'monthly'
            ? renewalPlanConfig.monthlyPrice
            : renewalPlanConfig.annualPrice;
          generateAndSendInvoice(
            subscription.accountId,
            subscription.plan,
            subscription.interval,
            renewalAmount,
            periodStart,
            periodEnd,
            subscription.paymentMethod?.brand || '',
            subscription.paymentMethod?.last4 || '',
          ).catch(err => console.error('[Invoice] async renewal error:', err));
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSubscription = event.data.object as Stripe.Subscription;
        context.stripeCustomerId = typeof stripeSubscription.customer === 'string'
          ? stripeSubscription.customer
          : context.stripeCustomerId;
        context.stripeSubscriptionId = stripeSubscription.id;

        const subscription = await Subscription.findOne({ stripeSubscriptionId: stripeSubscription.id });
        if (!subscription) {
          ignoredReason = 'local_subscription_not_found';
          break;
        }

        context.accountId = subscription.accountId;

        const stripePeriod = getStripeSubscriptionPeriod(stripeSubscription);
        const stripePeriodEnd = stripePeriod.end
          ? stripePeriod.end
          : subscription.currentPeriodEnd
            ? new Date(subscription.currentPeriodEnd)
            : null;

        if (hasLocalStateMovedPastEvent(subscription, stripePeriodEnd, eventCreatedAtIso)) {
          ignoredReason = 'stale_subscription_deleted';
          break;
        }

        const localPeriodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : stripePeriodEnd;
        if (localPeriodEnd && localPeriodEnd <= new Date()) {
          subscription.status = 'canceled';
        }
        if (subscription.stripeSubscriptionId === stripeSubscription.id) {
          subscription.autoRenew = false;
          subscription.stripeSubscriptionId = null;
        }
        subscription.updatedAt = new Date().toISOString();
        await subscription.save();
        break;
      }

      case 'invoice.payment_failed': {
        const failedInvoice = event.data.object as Stripe.Invoice;
        const failedCustomerId = failedInvoice.customer as string;
        const failedBillingReason = (failedInvoice as any).billing_reason;
        context.stripeCustomerId = failedCustomerId || context.stripeCustomerId;
        const failedInvoiceSubscriptionId = getInvoiceSubscriptionId(failedInvoice);
        context.stripeSubscriptionId = failedInvoiceSubscriptionId || context.stripeSubscriptionId;

        const subscription = await Subscription.findOne({ stripeCustomerId: failedCustomerId });
        if (!subscription) {
          ignoredReason = 'local_subscription_not_found';
          break;
        }

        context.accountId = subscription.accountId;

        const failedPeriod = getInvoiceLinePeriod(failedInvoice).end;
        if (subscription.status === 'canceled' || subscription.status === 'expired') {
          ignoredReason = 'terminal_local_status';
          break;
        }

        if (hasLocalStateMovedPastEvent(subscription, failedPeriod, eventCreatedAtIso)) {
          ignoredReason = 'stale_invoice_payment_failed';
          break;
        }

        if (failedBillingReason === 'subscription_update') {
          console.error(`Proration payment failed for customer ${failedCustomerId}. Invoice: ${failedInvoice.id}`);
        }

        subscription.status = 'past_due';
        subscription.updatedAt = new Date().toISOString();
        await subscription.save();
        break;
      }

      default:
        ignoredReason = 'unsupported_event_type';
        break;
    }

    await finalizeStripeWebhookEvent(eventRecord, ignoredReason ? 'ignored' : 'processed', context, {
      ignoredReason,
    });
    res.json({ received: true });
  } catch (error) {
    try {
      const context = extractWebhookContext(event);
      const record = await StripeWebhookEvent.findById(event.id);
      if (record) {
        await finalizeStripeWebhookEvent(record, 'failed', context, {
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (persistError) {
      console.error('Error persisting Stripe webhook failure:', persistError);
    }

    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Error processing webhook' });
  }
};

// Cambiar plan
export const changePlan = async (req: Request, res: Response) => {
  try {
    const { accountId, newPlan, newInterval, promoCode: promoCodeInput } = req.body;

    if (!requireMainAccountAccess(req, res, accountId)) {
      return;
    }

    if (!newPlan || !newInterval) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const subscription = await Subscription.findOne({ accountId });

    let appliedPromo: any = null;
    let stripeCouponId: string | undefined;
    if (promoCodeInput) {
      const promo = await PromoCode.findOne({ code: promoCodeInput.toUpperCase() });
      if (promo && promo.active) {
        const expired = promo.expiresAt ? new Date(promo.expiresAt) < new Date() : false;
        const exhausted = promo.maxUses != null && promo.usedCount >= promo.maxUses;
        if (!expired && !exhausted) {
          appliedPromo = promo;
          if (promo.type === 'percentage_discount') {
            try {
              const coupon = await stripe.coupons.create({
                percent_off: promo.value,
                duration: 'repeating',
                duration_in_months: promo.durationMonths,
              });
              stripeCouponId = coupon.id;
            } catch (couponErr: any) {
              console.error('Error creating Stripe coupon on change plan:', couponErr?.message);
            }
          }
        }
      }
    }

    if (!subscription) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }

    if (subscription.status !== 'active') {
      return res.status(400).json({ error: 'Solo se puede cambiar plan en suscripciones activas' });
    }

    // Si tiene Stripe subscription activa, actualizar en Stripe
    if (subscription.stripeSubscriptionId) {
      const planConfig = PLANS[newPlan as LocalPlanId];
      const newPriceId = newInterval === 'monthly'
        ? planConfig.stripePriceIdMonthly
        : planConfig.stripePriceIdAnnual;

      // Obtener la suscripción actual para acceder al subscription item ID
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const subscriptionItemId = stripeSubscription.items?.data?.[0]?.id;
      if (!subscriptionItemId) {
        return res.status(502).json({ error: 'Stripe devolvió la suscripción sin items válidos' });
      }

      const updateParams: any = {
        items: [{
          id: subscriptionItemId,
          price: newPriceId,
        }],
        proration_behavior: 'always_invoice',
      };
      if (stripeCouponId) {
        updateParams.coupon = stripeCouponId;
      }
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, updateParams);

      // Mantener la fecha de renovación existente (no dar un ciclo completo nuevo)
      // Stripe compensa económicamente con proration, el periodo actual no cambia
      // Solo actualizar si no hay fecha válida
      if (!subscription.currentPeriodEnd || new Date(subscription.currentPeriodEnd) <= new Date()) {
        const newPeriodEnd = new Date();
        if (newInterval === 'monthly') {
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
        } else {
          newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
        }
        subscription.currentPeriodEnd = newPeriodEnd.toISOString();
      }
    }

    if (appliedPromo) {
      subscription.promoCode = appliedPromo.code;
      subscription.promoCodeAppliedAt = new Date().toISOString();
    }

    // El cambio aplica al próximo ciclo de facturación
    subscription.plan = newPlan;
    subscription.interval = newInterval;

    // Si cambia de plan individual a otro, limpiar juniorDiscount
    if (newPlan !== 'individual' && subscription.juniorDiscount) {
      subscription.juniorDiscount = null;
    }

    subscription.updatedAt = new Date().toISOString();

    await subscription.save();
    res.json({ success: true, subscription: subscription.toJSON() });
  } catch (error) {
    console.error('Error al cambiar plan:', error);
    res.status(500).json({ error: 'Error al cambiar plan' });
  }
};

// Cancelar renovación automática
export const cancelAutoRenew = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;

    if (!requireMainAccountAccess(req, res, accountId)) {
      return;
    }

    const subscription = await Subscription.findOne({ accountId });

    if (!subscription) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }

    // Cancelar en Stripe si existe
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    }

    // Eliminar método de pago
    if (subscription.stripePaymentMethodId) {
      try {
        await stripe.paymentMethods.detach(subscription.stripePaymentMethodId);
      } catch (err) {
        console.error('Error al eliminar método de pago:', err);
      }
    }

    subscription.autoRenew = false;
    subscription.stripeSubscriptionId = null;
    subscription.stripePaymentMethodId = null;
    subscription.paymentMethod = null;
    subscription.updatedAt = new Date().toISOString();

    await subscription.save();
    res.json({ success: true, subscription: subscription.toJSON() });
  } catch (error) {
    console.error('Error al cancelar renovación:', error);
    res.status(500).json({ error: 'Error al cancelar renovación' });
  }
};

// Validar si la suscripción está activa
export const validateSubscription = async (req: Request, res: Response) => {
  try {
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;

    if (!requireMainAccountAccess(req, res, accountId)) {
      return;
    }

    const subscription = await Subscription.findOne({ accountId });

    if (!subscription) {
      return res.status(404).json({ error: 'Suscripción no encontrada' });
    }

    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);

    if (periodEnd < now) {
      // Suscripción expirada
      if (subscription.status !== 'expired') {
        subscription.status = 'expired';
        subscription.updatedAt = new Date().toISOString();
        await subscription.save();
      }
      return res.json({ valid: false, reason: 'expired' });
    }

    res.json({ valid: true, subscription: subscription.toJSON() });
  } catch (error) {
    console.error('Error al validar suscripción:', error);
    res.status(500).json({ error: 'Error al validar suscripción' });
  }
};

// ============= JUNIOR PROOF UPLOAD =============

const JUNIOR_PROOFS_DIR = path.join(process.cwd(), 'uploads', 'junior-proofs');
if (!fs.existsSync(JUNIOR_PROOFS_DIR)) {
  fs.mkdirSync(JUNIOR_PROOFS_DIR, { recursive: true });
}

const juniorProofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, JUNIOR_PROOFS_DIR);
  },
  filename: (req, file, cb) => {
    const accountId = (req as AuthRequest).user?.userId || 'unknown';
    const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${accountId}_${uniqueSuffix}${ext}`);
  },
});

const juniorProofUpload = multer({
  storage: juniorProofStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo PDF, JPG y PNG.'));
    }
  },
});

export const uploadJuniorProof = async (req: Request, res: Response) => {
  try {
    const accountId = (req as AuthRequest).user?.userId;
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo' });
    }

    const relativePath = path.join('uploads', 'junior-proofs', req.file.filename);

    // Asociar proofUrl a la suscripción actual
    const subscription = await Subscription.findOne({ accountId });
    if (subscription) {
      if (subscription.juniorDiscount) {
        subscription.juniorDiscount.proofUrl = relativePath;
      } else {
        subscription.juniorDiscount = {
          enabled: true,
          proofUrl: relativePath,
          status: 'pending',
          appliedAt: null,
          verifiedAt: null,
          verifiedBy: null,
          originalPrice: 0,
          finalPrice: 0,
        };
      }
      subscription.updatedAt = new Date().toISOString();
      await subscription.save();
    }

    res.json({ success: true, proofUrl: relativePath });
  } catch (error) {
    console.error('Error al subir prueba junior:', error);
    res.status(500).json({ error: 'Error al subir prueba junior' });
  }
};

export const validatePromoCode = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Código requerido' });
    }
    const promo = await PromoCode.findOne({ code: code.toUpperCase() });
    if (!promo || !promo.active) {
      return res.status(400).json({ error: 'Código no válido o inactivo' });
    }
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'El código ha expirado' });
    }
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
      return res.status(400).json({ error: 'El código ha alcanzado el límite de usos' });
    }
    res.json({
      valid: true,
      code: promo.code,
      type: promo.type,
      value: promo.value,
      durationMonths: promo.durationMonths,
    });
  } catch (error) {
    console.error('Error validating promo code:', error);
    res.status(500).json({ error: 'Error al validar código' });
  }
};

// ============= ROUTER =============

const router = Router();

router.post('/webhook', handleWebhook);
router.use(authMiddleware as any);
router.post('/trial', createTrialSubscription);
router.get('/', getSubscription);
router.post('/payment-intent', createPaymentIntent);
router.post('/confirm-payment', confirmPayment);
router.post('/change-plan', changePlan);
router.post('/cancel-auto-renew', cancelAutoRenew);
router.get('/validate', validateSubscription);
router.post('/junior-proof', juniorProofUpload.single('file'), uploadJuniorProof);

export default router;
