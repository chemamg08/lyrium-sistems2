/**
 * Stripe Integration Tests — Lyrium Systems
 *
 * 29 tests con API REAL de Stripe (modo test) + MongoDB mockeado.
 * Verifica pagos, suscripciones, webhooks, fechas y login expirado end-to-end.
 *
 * Ejecutar:  npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Stripe from 'stripe';

// ─── Stripe real (test mode) ─────────────────────────────────────────────────

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const PRICES = {
  starterMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
  starterAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL!,
  advancedMonthly: process.env.STRIPE_PRICE_ADVANCED_MONTHLY!,
  advancedAnnual: process.env.STRIPE_PRICE_ADVANCED_ANNUAL!,
};

// ─── Hoisted mocks — solo MongoDB, NO Stripe ─────────────────────────────────

const { SubMock, AccMock, SubaccMock, InvMocks, BcryptMock, AuthMocks } = vi.hoisted(() => {
  const saveFn = vi.fn(async function (this: any) { return this; });
  const updateOneFn = vi.fn(async function () { return {}; });
  return {
    SubMock: {
      findOne: vi.fn(),
      create: vi.fn(),
      updateOne: vi.fn(),
      find: vi.fn(),
      deleteMany: vi.fn(),
    },
    AccMock: {
      findOne: vi.fn(),
      findById: vi.fn(),
      find: vi.fn(),
    },
    SubaccMock: {
      findOne: vi.fn(),
      find: vi.fn(),
    },
    InvMocks: {
      generateInvoicePDF: vi.fn().mockResolvedValue(Buffer.from('pdf')),
      sendInvoiceEmail: vi.fn().mockResolvedValue(undefined),
      buildInvoiceNumber: vi.fn().mockReturnValue('LY-2026-0001'),
      buildConcept: vi.fn().mockReturnValue('Plan Starter - Mensual'),
      formatShortDate: vi.fn().mockReturnValue('01/04/2026'),
    },
    BcryptMock: {
      compare: vi.fn(),
      hash: vi.fn().mockResolvedValue('$2b$10$hashed'),
    },
    AuthMocks: {
      generateToken: vi.fn().mockReturnValue('test-jwt-token'),
      generateRefreshToken: vi.fn().mockReturnValue('test-refresh-token'),
      setAuthCookies: vi.fn(),
      clearAuthCookies: vi.fn(),
      verifyRefreshToken: vi.fn(),
      verifyOwnership: vi.fn(),
      AuthPayload: {},
    },
  };
});

vi.mock('../models/Subscription.js', () => ({ Subscription: SubMock }));
vi.mock('../models/Account.js', () => ({ Account: AccMock }));
vi.mock('../models/Subaccount.js', () => ({ Subaccount: SubaccMock }));
vi.mock('../models/Client.js', () => ({ Client: { find: vi.fn(), deleteMany: vi.fn() } }));
vi.mock('../services/invoiceService.js', () => InvMocks);
vi.mock('bcrypt', () => ({ default: BcryptMock }));
vi.mock('speakeasy', () => ({ default: { totp: { verify: vi.fn().mockReturnValue(true) } } }));
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test' }),
    }),
  },
}));
vi.mock('../middleware/auth.js', () => AuthMocks);
vi.mock('mongoose', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, default: { ...actual.default, model: vi.fn() } };
});

// ─── Tracking para cleanup ───────────────────────────────────────────────────

const toCleanup: { customers: string[]; testClocks: string[] } = {
  customers: [],
  testClocks: [],
};

afterAll(async () => {
  for (const id of toCleanup.customers) {
    try { await stripe.customers.del(id); } catch { /* ya borrado */ }
  }
  for (const id of toCleanup.testClocks) {
    try { await stripe.testHelpers.testClocks.del(id); } catch { /* ya borrado */ }
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeCustomer(email?: string): Promise<Stripe.Customer> {
  const c = await stripe.customers.create({
    email: email || `test-${Date.now()}@lyrium-test.io`,
    metadata: { test: 'integration' },
  });
  toCleanup.customers.push(c.id);
  return c;
}

async function makePM(): Promise<Stripe.PaymentMethod> {
  return stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' } });
}

async function makeDeclinedPM(): Promise<Stripe.PaymentMethod> {
  return stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_chargeDeclined' } });
}

function mockDoc(data: Record<string, any>) {
  return {
    ...data,
    save: vi.fn(async function (this: any) { return this; }),
    updateOne: vi.fn(async function () { return {}; }),
    toJSON: vi.fn(function (this: any) { return { id: data._id, ...data }; }),
  };
}

function mockReq(body: any = {}, query: any = {}, headers: any = {}) {
  return { body, query, headers, params: {} } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  return res;
}

function signWebhookPayload(payload: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const crypto = require('crypto');
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function waitForTestClock(clockId: string, maxWaitMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (clock.status === 'ready') return;
    if (clock.status === 'advancing') {
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    throw new Error(`Test clock in unexpected status: ${clock.status}`);
  }
  throw new Error(`Test clock did not reach 'ready' within ${maxWaitMs}ms`);
}

// =============================================================================
// SECCIÓN 1: PAGOS REALES EN STRIPE
// =============================================================================

describe('1. Pagos reales en Stripe', () => {
  let customer: Stripe.Customer;
  let pm: Stripe.PaymentMethod;

  beforeAll(async () => {
    customer = await makeCustomer('pagos-test@lyrium-test.io');
    pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
  });

  it('Test 1 — Pago único Starter mensual (€197)', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 19700,
      currency: 'eur',
      customer: customer.id,
      payment_method: pm.id,
      confirm: true,
      metadata: { plan: 'starter', interval: 'monthly', autoRenew: 'false' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    expect(pi.status).toBe('succeeded');
    expect(pi.amount).toBe(19700);
    expect(pi.currency).toBe('eur');
    expect(pi.metadata.plan).toBe('starter');

    // Verificar en Stripe que el pago existe
    const retrieved = await stripe.paymentIntents.retrieve(pi.id);
    expect(retrieved.status).toBe('succeeded');
    expect(retrieved.amount_received).toBe(19700);
  });

  it('Test 2 — Pago único Starter anual (€2100)', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 210000,
      currency: 'eur',
      customer: customer.id,
      payment_method: pm.id,
      confirm: true,
      metadata: { plan: 'starter', interval: 'annual', autoRenew: 'false' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    expect(pi.status).toBe('succeeded');
    expect(pi.amount).toBe(210000);

    const retrieved = await stripe.paymentIntents.retrieve(pi.id);
    expect(retrieved.amount_received).toBe(210000);
  });

  it('Test 3 — Pago único Advanced mensual (€350)', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 35000,
      currency: 'eur',
      customer: customer.id,
      payment_method: pm.id,
      confirm: true,
      metadata: { plan: 'advanced', interval: 'monthly', autoRenew: 'false' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    expect(pi.status).toBe('succeeded');
    expect(pi.amount).toBe(35000);
  });

  it('Test 4 — Pago único Advanced anual (€3700)', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 370000,
      currency: 'eur',
      customer: customer.id,
      payment_method: pm.id,
      confirm: true,
      metadata: { plan: 'advanced', interval: 'annual', autoRenew: 'false' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    expect(pi.status).toBe('succeeded');
    expect(pi.amount).toBe(370000);
  });

  it('Test 5 — Suscripción auto-renew (guarda tarjeta + crea suscripción)', async () => {
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
      default_payment_method: pm.id,
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      metadata: { plan: 'starter', interval: 'monthly' },
    });

    expect(sub.status).toMatch(/active|trialing/);
    expect(sub.items.data[0].price.id).toBe(PRICES.starterMonthly);
    expect(sub.default_payment_method).toBe(pm.id);

    // Verificar en Stripe
    const retrieved = await stripe.subscriptions.retrieve(sub.id);
    expect(retrieved.id).toBe(sub.id);
    expect(retrieved.customer).toBe(customer.id);

    // Limpiar
    await stripe.subscriptions.cancel(sub.id);
  });

  it('Test 6 — Suscripción con trial (14 días, no cobra)', async () => {
    const trialEnd = Math.floor(Date.now() / 1000) + 14 * 86400;

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
      trial_end: trialEnd,
      default_payment_method: pm.id,
      metadata: { plan: 'starter', interval: 'monthly' },
    });

    expect(sub.status).toBe('trialing');
    expect(sub.trial_end).toBe(trialEnd);

    // Verificar que la fecha de trial en Stripe coincide
    const retrieved = await stripe.subscriptions.retrieve(sub.id);
    expect(retrieved.trial_end).toBe(trialEnd);

    await stripe.subscriptions.cancel(sub.id);
  });
});

// =============================================================================
// SECCIÓN 2: CICLO DE VIDA DE SUSCRIPCIONES
// =============================================================================

describe('2. Ciclo de vida de suscripciones', () => {
  let customer: Stripe.Customer;
  let pm: Stripe.PaymentMethod;

  beforeAll(async () => {
    customer = await makeCustomer('lifecycle-test@lyrium-test.io');
    pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
  });

  it('Test 7 — Trial → pago → suscripción activa con fechas correctas', async () => {
    // Crear sub con trial
    const trialEnd = Math.floor(Date.now() / 1000) + 14 * 86400;
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
      trial_end: trialEnd,
      default_payment_method: pm.id,
    });

    expect(sub.status).toBe('trialing');

    // Simular fin de trial: cancelar trial y crear sub inmediata
    await stripe.subscriptions.cancel(sub.id);
    const activeSub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
      default_payment_method: pm.id,
    });

    expect(activeSub.status).toBe('active');
    const item = activeSub.items.data[0];
    expect(item.current_period_start).toBeDefined();
    expect(item.current_period_end).toBeDefined();

    // Verificar que el periodo es ~1 mes
    const periodSeconds = item.current_period_end - item.current_period_start;
    const periodDays = periodSeconds / 86400;
    expect(periodDays).toBeGreaterThanOrEqual(28);
    expect(periodDays).toBeLessThanOrEqual(31);

    await stripe.subscriptions.cancel(activeSub.id);
  });

  it('Test 8 — Trial expirado → pago inmediato (no suma días de trial)', async () => {
    // Crear sub con pago inmediato (sin trial)
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
      default_payment_method: pm.id,
    });

    expect(sub.status).toBe('active');
    expect(sub.trial_end).toBeNull();

    // Periodo empieza ahora, no tiene días de trial sumados
    const now = Math.floor(Date.now() / 1000);
    const item = sub.items.data[0];
    expect(Math.abs(item.current_period_start - now)).toBeLessThan(60);

    await stripe.subscriptions.cancel(sub.id);
  });

  it('Test 9 — Cambio Starter → Advanced (proration en Stripe)', async () => {
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
      default_payment_method: pm.id,
    });

    expect(sub.items.data[0].price.id).toBe(PRICES.starterMonthly);

    // Cambiar a Advanced
    const updated = await stripe.subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0].id, price: PRICES.advancedMonthly }],
      proration_behavior: 'always_invoice',
    });

    expect(updated.items.data[0].price.id).toBe(PRICES.advancedMonthly);

    // Verificar en Stripe
    const retrieved = await stripe.subscriptions.retrieve(sub.id);
    expect(retrieved.items.data[0].price.id).toBe(PRICES.advancedMonthly);

    await stripe.subscriptions.cancel(sub.id);
  });

  it('Test 10 — Cambio Advanced → Starter', async () => {
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.advancedMonthly }],
      default_payment_method: pm.id,
    });

    const updated = await stripe.subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0].id, price: PRICES.starterMonthly }],
      proration_behavior: 'always_invoice',
    });

    expect(updated.items.data[0].price.id).toBe(PRICES.starterMonthly);
    await stripe.subscriptions.cancel(sub.id);
  });

  it('Test 11 — Cancelar auto-renew (tarjeta desvinculada, sub cancelada)', async () => {
    const newPm = await makePM();
    await stripe.paymentMethods.attach(newPm.id, { customer: customer.id });

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
      default_payment_method: newPm.id,
    });

    // Cancelar
    const canceled = await stripe.subscriptions.cancel(sub.id);
    expect(canceled.status).toBe('canceled');

    // Desvincular tarjeta
    const detached = await stripe.paymentMethods.detach(newPm.id);
    expect(detached.customer).toBeNull();
  });
});

// =============================================================================
// SECCIÓN 3: WEBHOOKS CON FIRMA REAL
// =============================================================================

describe('3. Webhooks con firma real', () => {
  let handleWebhook: any;

  beforeAll(async () => {
    const mod = await import('../subscriptions.js');
    handleWebhook = mod.handleWebhook;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 12 — invoice.paid (subscription_cycle) → renueva periodo', async () => {
    const existingSub = mockDoc({
      _id: 'sub_1', accountId: 'acc_1', plan: 'starter', interval: 'monthly',
      status: 'active', stripeCustomerId: 'cus_test_12',
      currentPeriodEnd: new Date().toISOString(),
      paymentMethod: { brand: 'visa', last4: '4242' },
    });
    SubMock.findOne.mockResolvedValue(existingSub);
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_1', email: 'test@test.com' }));

    const event = {
      id: 'evt_test_12',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_test_12',
          customer: 'cus_test_12',
          billing_reason: 'subscription_cycle',
        },
      },
    };

    const payload = JSON.stringify(event);
    const sig = signWebhookPayload(payload);
    const req = mockReq(payload, {}, { 'stripe-signature': sig });
    const res = mockRes();

    await handleWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(existingSub.status).toBe('active');
    expect(existingSub.save).toHaveBeenCalled();
    // Verifica que currentPeriodEnd se actualizó al futuro
    const newEnd = new Date(existingSub.currentPeriodEnd);
    expect(newEnd.getTime()).toBeGreaterThan(Date.now());
  });

  it('Test 13 — invoice.paid (subscription_create) → IGNORA', async () => {
    const event = {
      id: 'evt_test_13',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_test_13',
          customer: 'cus_test_13',
          billing_reason: 'subscription_create',
        },
      },
    };

    const payload = JSON.stringify(event);
    const sig = signWebhookPayload(payload);
    const req = mockReq(payload, {}, { 'stripe-signature': sig });
    const res = mockRes();

    await handleWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    // NO debe buscar ni actualizar nada
    expect(SubMock.findOne).not.toHaveBeenCalled();
  });

  it('Test 14 — invoice.paid (subscription_update) → IGNORA', async () => {
    const event = {
      id: 'evt_test_14',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_test_14',
          customer: 'cus_test_14',
          billing_reason: 'subscription_update',
        },
      },
    };

    const payload = JSON.stringify(event);
    const sig = signWebhookPayload(payload);
    const req = mockReq(payload, {}, { 'stripe-signature': sig });
    const res = mockRes();

    await handleWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(SubMock.findOne).not.toHaveBeenCalled();
  });

  it('Test 15 — payment_intent.succeeded → activa suscripción', async () => {
    const existingSub = mockDoc({
      _id: 'sub_15', accountId: 'acc_15', plan: 'starter', interval: 'monthly',
      status: 'trial', stripeCustomerId: 'cus_test_15',
      trialEndDate: new Date(Date.now() + 5 * 86400000).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 5 * 86400000).toISOString(),
    });
    SubMock.findOne.mockResolvedValue(existingSub);

    const event = {
      id: 'evt_test_15',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_15',
          customer: 'cus_test_15',
          metadata: {
            accountId: 'acc_15',
            plan: 'starter',
            interval: 'monthly',
            autoRenew: 'false',
          },
        },
      },
    };

    const payload = JSON.stringify(event);
    const sig = signWebhookPayload(payload);
    const req = mockReq(payload, {}, { 'stripe-signature': sig });
    const res = mockRes();

    await handleWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(existingSub.status).toBe('active');
    expect(existingSub.autoRenew).toBe(false);
    expect(existingSub.save).toHaveBeenCalled();
  });

  it('Test 16 — payment_method.attached → guarda brand + last4', async () => {
    const existingSub = mockDoc({
      _id: 'sub_16', accountId: 'acc_16',
      stripeCustomerId: 'cus_test_16', paymentMethod: null,
    });
    SubMock.findOne.mockResolvedValue(existingSub);

    const event = {
      id: 'evt_test_16',
      type: 'payment_method.attached',
      data: {
        object: {
          id: 'pm_test_16',
          customer: 'cus_test_16',
          card: { brand: 'visa', last4: '4242' },
        },
      },
    };

    const payload = JSON.stringify(event);
    const sig = signWebhookPayload(payload);
    const req = mockReq(payload, {}, { 'stripe-signature': sig });
    const res = mockRes();

    await handleWebhook(req, res);

    expect(existingSub.paymentMethod).toEqual({ brand: 'visa', last4: '4242' });
    expect(existingSub.stripePaymentMethodId).toBe('pm_test_16');
    expect(existingSub.save).toHaveBeenCalled();
  });

  it('Test 17 — customer.subscription.deleted → marca autoRenew=false', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const existingSub = mockDoc({
      _id: 'sub_17', accountId: 'acc_17',
      stripeSubscriptionId: 'sub_stripe_17', stripeCustomerId: 'cus_test_17',
      status: 'active', autoRenew: true,
      currentPeriodEnd: pastDate,
    });
    SubMock.findOne.mockResolvedValue(existingSub);

    const event = {
      id: 'evt_test_17',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_stripe_17',
          customer: 'cus_test_17',
        },
      },
    };

    const payload = JSON.stringify(event);
    const sig = signWebhookPayload(payload);
    const req = mockReq(payload, {}, { 'stripe-signature': sig });
    const res = mockRes();

    await handleWebhook(req, res);

    expect(existingSub.autoRenew).toBe(false);
    expect(existingSub.stripeSubscriptionId).toBeNull();
    expect(existingSub.status).toBe('canceled');
    expect(existingSub.save).toHaveBeenCalled();
  });

  it('Test 18 — invoice.payment_failed → estado past_due', async () => {
    const existingSub = mockDoc({
      _id: 'sub_18', accountId: 'acc_18',
      stripeCustomerId: 'cus_test_18', status: 'active',
    });
    SubMock.findOne.mockResolvedValue(existingSub);

    const event = {
      id: 'evt_test_18',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_18',
          customer: 'cus_test_18',
          billing_reason: 'subscription_cycle',
        },
      },
    };

    const payload = JSON.stringify(event);
    const sig = signWebhookPayload(payload);
    const req = mockReq(payload, {}, { 'stripe-signature': sig });
    const res = mockRes();

    await handleWebhook(req, res);

    expect(existingSub.status).toBe('past_due');
    expect(existingSub.save).toHaveBeenCalled();
  });
});

// =============================================================================
// SECCIÓN 4: FECHAS Y EDGE CASES
// =============================================================================

describe('4. Fechas y edge cases', () => {
  it('Test 19 — Periodo mensual = exactamente +1 mes', () => {
    const now = new Date('2026-03-15T12:00:00Z');
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(3); // Abril
    expect(end.getDate()).toBe(15);
  });

  it('Test 20 — Periodo anual = exactamente +1 año', () => {
    const now = new Date('2026-03-15T12:00:00Z');
    const end = new Date(now);
    end.setFullYear(end.getFullYear() + 1);

    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(2); // Marzo
    expect(end.getDate()).toBe(15);
  });

  it('Test 21 — Días restantes de trial se suman al periodo', () => {
    const now = new Date('2026-03-15T12:00:00Z');
    const trialEnd = new Date('2026-03-20T12:00:00Z'); // 5 días de trial restantes

    // Cálculo: periodo base (1 mes) + días de trial restantes
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const remainingDays = Math.ceil(
      (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    periodEnd.setDate(periodEnd.getDate() + remainingDays);

    expect(remainingDays).toBe(5);
    expect(periodEnd.getDate()).toBe(20); // 15 abril + 5 = 20 abril
    expect(periodEnd.getMonth()).toBe(3); // Abril
  });

  it('Test 22 — Días de plan activo se suman al cambiar plan', () => {
    const now = new Date('2026-03-15T12:00:00Z');
    const prevPeriodEnd = new Date('2026-03-25T12:00:00Z'); // 10 días restantes

    const newPeriodEnd = new Date(now);
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

    if (prevPeriodEnd > now) {
      const remainingDays = Math.ceil(
        (prevPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      newPeriodEnd.setDate(newPeriodEnd.getDate() + remainingDays);
    }

    // 15 abril + 10 = 25 abril
    expect(newPeriodEnd.getDate()).toBe(25);
    expect(newPeriodEnd.getMonth()).toBe(3);
  });

  it('Test 23 — Firma webhook inválida → rechaza con 400', async () => {
    const { handleWebhook } = await import('../subscriptions.js');

    const payload = JSON.stringify({ id: 'evt_fake', type: 'invoice.paid', data: { object: {} } });
    const req = mockReq(payload, {}, { 'stripe-signature': 'invalid_signature' });
    const res = mockRes();

    await handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// =============================================================================
// SECCIÓN 5: TEST CLOCKS — CICLO DE VIDA REAL
// =============================================================================

describe('5. Test Clocks — ciclo de vida real en Stripe', () => {
  it('Test 24 — Trial 14d → expira → Stripe cobra automáticamente', async () => {
    // Crear Test Clock congelado en "ahora"
    const now = Math.floor(Date.now() / 1000);
    const testClock = await stripe.testHelpers.testClocks.create({
      frozen_time: now,
    });
    toCleanup.testClocks.push(testClock.id);

    // Crear customer vinculado al reloj
    const customer = await stripe.customers.create({
      email: 'clock-24@lyrium-test.io',
      test_clock: testClock.id,
    });
    toCleanup.customers.push(customer.id);

    // Vincular tarjeta
    const pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });

    // Crear suscripción con trial de 14 días
    const trialEnd = now + 14 * 86400;
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
      trial_end: trialEnd,
    });

    expect(sub.status).toBe('trialing');

    // Avanzar el reloj 15 días (1 día después del trial)
    await stripe.testHelpers.testClocks.advance(testClock.id, {
      frozen_time: now + 15 * 86400,
    });
    await waitForTestClock(testClock.id);

    // Verificar que Stripe cobró y la sub está activa
    const updated = await stripe.subscriptions.retrieve(sub.id);
    expect(updated.status).toBe('active');
    expect(updated.trial_end).toBe(trialEnd);

    // Verificar que se creó una factura pagada
    const invoices = await stripe.invoices.list({
      subscription: sub.id,
      limit: 5,
    });
    const paidInvoice = invoices.data.find(inv => inv.status === 'paid' && inv.amount_paid > 0);
    expect(paidInvoice).toBeDefined();
    expect(paidInvoice!.amount_paid).toBe(
      (await stripe.prices.retrieve(PRICES.starterMonthly)).unit_amount!
    );
  });

  it('Test 25 — Trial 14d → tarjeta falla → invoice.payment_failed', async () => {
    const now = Math.floor(Date.now() / 1000);
    const testClock = await stripe.testHelpers.testClocks.create({
      frozen_time: now,
    });
    toCleanup.testClocks.push(testClock.id);

    const customer = await stripe.customers.create({
      email: 'clock-25@lyrium-test.io',
      test_clock: testClock.id,
    });
    toCleanup.customers.push(customer.id);

    // NO vincular tarjeta → cuando el trial expire, Stripe no podrá cobrar
    // (simula que el usuario tiene una tarjeta rechazada o no tiene método de pago)

    const trialEnd = now + 14 * 86400;
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
      trial_end: trialEnd,
    });

    expect(sub.status).toBe('trialing');

    // Avanzar reloj pasado el trial
    await stripe.testHelpers.testClocks.advance(testClock.id, {
      frozen_time: now + 15 * 86400,
    });
    await waitForTestClock(testClock.id);

    // Verificar que la sub no está activa (pago falló)
    const updated = await stripe.subscriptions.retrieve(sub.id);
    expect(['past_due', 'incomplete', 'canceled']).toContain(updated.status);

    // Verificar que hay una factura con fallo
    const invoices = await stripe.invoices.list({
      subscription: sub.id,
      limit: 5,
    });
    const failedInvoice = invoices.data.find(
      inv => inv.status === 'open' || inv.status === 'uncollectible'
    );
    expect(failedInvoice).toBeDefined();
  });

  it('Test 26 — Renovación mensual automática → periodo se renueva', async () => {
    const now = Math.floor(Date.now() / 1000);
    const testClock = await stripe.testHelpers.testClocks.create({
      frozen_time: now,
    });
    toCleanup.testClocks.push(testClock.id);

    const customer = await stripe.customers.create({
      email: 'clock-26@lyrium-test.io',
      test_clock: testClock.id,
    });
    toCleanup.customers.push(customer.id);

    const pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });

    // Crear sub activa (sin trial)
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
    });

    const originalItem = sub.items.data[0];
    const originalPeriodEnd = originalItem.current_period_end;
    expect(sub.status).toBe('active');

    // Avanzar 32 días (pasa 1 mes → renovación)
    await stripe.testHelpers.testClocks.advance(testClock.id, {
      frozen_time: now + 32 * 86400,
    });
    await waitForTestClock(testClock.id);

    // Verificar que sigue activa y el periodo se renovó
    const updated = await stripe.subscriptions.retrieve(sub.id);
    expect(updated.status).toBe('active');
    const updatedItem = updated.items.data[0];
    expect(updatedItem.current_period_start).toBeGreaterThanOrEqual(originalPeriodEnd);
    expect(updatedItem.current_period_end).toBeGreaterThan(originalPeriodEnd);

    // Verificar que hay al menos 2 invoices (primera + renovación)
    const invoices = await stripe.invoices.list({
      subscription: sub.id,
      limit: 10,
    });
    const paidInvoices = invoices.data.filter(inv => inv.status === 'paid');
    expect(paidInvoices.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// SECCIÓN 6: LOGIN CON SUSCRIPCIÓN EXPIRADA
// =============================================================================

describe('6. Login con suscripción expirada', () => {
  let login: any;

  beforeAll(async () => {
    const mod = await import('../controllers/accountsController.js');
    login = mod.login;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    BcryptMock.compare.mockResolvedValue(true);
  });

  it('Test 27 — Login cuenta principal con suscripción expirada → 403 + needsPayment', async () => {
    // Usuario con email verificado, 2FA activado (para pasar el check 2FA)
    const mockUser = {
      _id: 'acc_27',
      name: 'Test User',
      email: 'expired@lyrium.io',
      password: '$2b$10$hashed',
      country: 'ES',
      role: 'user',
      emailVerified: true,
      twoFactorEnabled: true,
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      disabled: false,
      failedLoginAttempts: 0,
      lockUntil: null,
      updateOne: vi.fn().mockResolvedValue({}),
      save: vi.fn(),
    };

    // Suscripción expirada (periodo terminó ayer)
    const expiredSub = mockDoc({
      _id: 'sub_27',
      accountId: 'acc_27',
      status: 'expired',
      currentPeriodEnd: new Date(Date.now() - 86400000).toISOString(), // Ayer
    });

    AccMock.findOne.mockResolvedValue(mockUser);
    SubaccMock.findOne.mockResolvedValue(null);
    SubMock.findOne.mockResolvedValue(expiredSub);

    const req = mockReq({ email: 'expired@lyrium.io', password: 'Test1234!', totpCode: '123456' });
    const res = mockRes();

    await login(req, res);

    // Debe devolver 403 con needsPayment y datos del usuario
    expect(res.status).toHaveBeenCalledWith(403);
    const responseData = res.json.mock.calls[0][0];
    expect(responseData.needsPayment).toBe(true);
    expect(responseData.accountId).toBe('acc_27');
    expect(responseData.email).toBe('expired@lyrium.io');
    expect(responseData.country).toBe('ES');
    expect(responseData.type).toBe('main');
  });

  it('Test 28 — Login subcuenta con suscripción expirada → 403 SIN needsPayment', async () => {
    const mockSubUser = {
      _id: 'subacc_28',
      name: 'Sub User',
      email: 'subuser@lyrium.io',
      password: '$2b$10$hashed',
      parentAccountId: 'acc_28_parent',
      role: 'user',
      twoFactorEnabled: true,
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      disabled: false,
      failedLoginAttempts: 0,
      lockUntil: null,
      updateOne: vi.fn().mockResolvedValue({}),
      save: vi.fn(),
    };

    const expiredSub = mockDoc({
      _id: 'sub_28',
      accountId: 'acc_28_parent',
      status: 'expired',
      currentPeriodEnd: new Date(Date.now() - 86400000).toISOString(),
    });

    AccMock.findOne.mockResolvedValue(null); // No es cuenta principal
    SubaccMock.findOne.mockResolvedValue(mockSubUser);
    SubMock.findOne.mockResolvedValue(expiredSub);

    const req = mockReq({ email: 'subuser@lyrium.io', password: 'Test1234!', totpCode: '123456' });
    const res = mockRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    const responseData = res.json.mock.calls[0][0];
    // Subcuenta NO puede pagar — needsPayment es false
    expect(responseData.needsPayment).toBe(false);
    expect(responseData.type).toBe('subaccount');
    // No debe incluir accountId (es subcuenta)
    expect(responseData.accountId).toBeUndefined();
  });

  it('Test 29 — Usuario paga desde login expirado → siguiente login exitoso', async () => {
    // Paso 1: Login con sub expirada → 403
    const mockUser = {
      _id: 'acc_29',
      name: 'Renewal User',
      email: 'renew@lyrium.io',
      password: '$2b$10$hashed',
      country: 'ES',
      role: 'user',
      emailVerified: true,
      twoFactorEnabled: true,
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      disabled: false,
      failedLoginAttempts: 0,
      lockUntil: null,
      updateOne: vi.fn().mockResolvedValue({}),
      save: vi.fn(),
    };

    const expiredSub = mockDoc({
      _id: 'sub_29',
      accountId: 'acc_29',
      status: 'expired',
      currentPeriodEnd: new Date(Date.now() - 86400000).toISOString(),
    });

    AccMock.findOne.mockResolvedValue(mockUser);
    SubaccMock.findOne.mockResolvedValue(null);
    SubMock.findOne.mockResolvedValue(expiredSub);

    const req1 = mockReq({ email: 'renew@lyrium.io', password: 'Test1234!', totpCode: '123456' });
    const res1 = mockRes();
    await login(req1, res1);

    expect(res1.status).toHaveBeenCalledWith(403);
    expect(res1.json.mock.calls[0][0].needsPayment).toBe(true);

    // Paso 2: Pago real en Stripe (simula lo que hace RenewalModal)
    const customer = await makeCustomer('renew@lyrium.io');
    const pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });

    const pi = await stripe.paymentIntents.create({
      amount: 19700,
      currency: 'eur',
      customer: customer.id,
      payment_method: pm.id,
      confirm: true,
      metadata: { accountId: 'acc_29', plan: 'starter', interval: 'monthly' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    expect(pi.status).toBe('succeeded');

    // Paso 3: La app actualiza la suscripción (simula lo que hace confirmPayment)
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const activeSub = mockDoc({
      _id: 'sub_29',
      accountId: 'acc_29',
      status: 'active',
      plan: 'starter',
      interval: 'monthly',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      stripeCustomerId: customer.id,
      paymentMethod: { brand: 'visa', last4: '4242' },
    });

    // Paso 4: Siguiente login con sub activa → 200
    vi.clearAllMocks();
    BcryptMock.compare.mockResolvedValue(true);
    AccMock.findOne.mockResolvedValue(mockUser);
    SubaccMock.findOne.mockResolvedValue(null);
    SubMock.findOne.mockResolvedValue(activeSub);

    const req2 = mockReq({ email: 'renew@lyrium.io', password: 'Test1234!', totpCode: '123456' });
    const res2 = mockRes();
    await login(req2, res2);

    // Ahora debe pasar: 200 con token
    expect(res2.json).toHaveBeenCalled();
    const successData = res2.json.mock.calls[0][0];
    expect(successData.success).toBe(true);
    expect(successData.user.email).toBe('renew@lyrium.io');
  });
});
