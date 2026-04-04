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
// SECCIÓN 1: PAGOS REALES EN STRIPE + confirmPayment
// =============================================================================

describe('1. Pagos reales en Stripe + confirmPayment', () => {
  let customer: Stripe.Customer;
  let pm: Stripe.PaymentMethod;
  let confirmPayment: any;

  beforeAll(async () => {
    customer = await makeCustomer('pagos-test@lyrium-test.io');
    pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    const mod = await import('../subscriptions.js');
    confirmPayment = mod.confirmPayment;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1 — Pago Starter mensual → confirmPayment actualiza BD correctamente', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 19700, currency: 'eur',
      customer: customer.id, payment_method: pm.id, confirm: true,
      metadata: { plan: 'starter', interval: 'monthly', autoRenew: 'false' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    expect(pi.status).toBe('succeeded');
    expect(pi.amount).toBe(19700);
    expect(pi.currency).toBe('eur');

    // Verificar en Stripe que el pago existe
    const retrieved = await stripe.paymentIntents.retrieve(pi.id);
    expect(retrieved.status).toBe('succeeded');
    expect(retrieved.amount_received).toBe(19700);

    // Llamar a confirmPayment del código real y verificar que la BD se actualiza
    const fakeSub = mockDoc({
      _id: 'sub_t1', accountId: 'acc_t1', plan: 'starter', interval: 'monthly',
      status: 'trial', stripeCustomerId: customer.id,
      trialEndDate: null, currentPeriodEnd: null,
    });
    SubMock.findOne.mockResolvedValue(fakeSub);
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_t1', email: 'test@test.com' }));

    const req = mockReq({ accountId: 'acc_t1', plan: 'starter', interval: 'monthly', paymentIntentId: pi.id });
    const res = mockRes();
    await confirmPayment(req, res);

    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(fakeSub.status).toBe('active');
    expect(fakeSub.plan).toBe('starter');
    expect(fakeSub.interval).toBe('monthly');
    expect(fakeSub.autoRenew).toBe(false);
    // currentPeriodEnd debe ser ~1 mes desde ahora
    const periodEnd = new Date(fakeSub.currentPeriodEnd);
    const daysDiff = (periodEnd.getTime() - Date.now()) / 86400000;
    expect(daysDiff).toBeGreaterThanOrEqual(27);
    expect(daysDiff).toBeLessThanOrEqual(32);
    // PaymentMethod debe estar guardado (brand + last4 de tok_visa)
    expect(fakeSub.paymentMethod).toBeDefined();
    expect(fakeSub.paymentMethod.brand).toBe('visa');
    expect(fakeSub.paymentMethod.last4).toBe('4242');
    expect(fakeSub.save).toHaveBeenCalled();
  });

  it('Test 2 — Pago Starter anual → confirmPayment guarda periodo de ~1 año', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 210000, currency: 'eur',
      customer: customer.id, payment_method: pm.id, confirm: true,
      metadata: { plan: 'starter', interval: 'annual', autoRenew: 'false' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    expect(pi.status).toBe('succeeded');
    expect(pi.amount_received).toBe(210000);

    const fakeSub = mockDoc({
      _id: 'sub_t2', accountId: 'acc_t2', plan: 'starter', interval: 'monthly',
      status: 'trial', stripeCustomerId: customer.id,
      trialEndDate: null, currentPeriodEnd: null,
    });
    SubMock.findOne.mockResolvedValue(fakeSub);
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_t2', email: 'test@test.com' }));

    const req = mockReq({ accountId: 'acc_t2', plan: 'starter', interval: 'annual', paymentIntentId: pi.id });
    const res = mockRes();
    await confirmPayment(req, res);

    expect(res.json.mock.calls[0][0].success).toBe(true);
    expect(fakeSub.status).toBe('active');
    expect(fakeSub.interval).toBe('annual');
    // currentPeriodEnd debe ser ~1 año desde ahora
    const periodEnd = new Date(fakeSub.currentPeriodEnd);
    const daysDiff = (periodEnd.getTime() - Date.now()) / 86400000;
    expect(daysDiff).toBeGreaterThanOrEqual(363);
    expect(daysDiff).toBeLessThanOrEqual(367);
  });

  it('Test 3 — Pago Advanced mensual → confirmPayment guarda plan advanced', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 35000, currency: 'eur',
      customer: customer.id, payment_method: pm.id, confirm: true,
      metadata: { plan: 'advanced', interval: 'monthly', autoRenew: 'false' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    expect(pi.status).toBe('succeeded');

    const fakeSub = mockDoc({
      _id: 'sub_t3', accountId: 'acc_t3', plan: 'starter', interval: 'monthly',
      status: 'trial', stripeCustomerId: customer.id,
      trialEndDate: null, currentPeriodEnd: null,
    });
    SubMock.findOne.mockResolvedValue(fakeSub);
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_t3', email: 'test@test.com' }));

    const req = mockReq({ accountId: 'acc_t3', plan: 'advanced', interval: 'monthly', paymentIntentId: pi.id });
    const res = mockRes();
    await confirmPayment(req, res);

    expect(fakeSub.plan).toBe('advanced');
    expect(fakeSub.status).toBe('active');
    expect(fakeSub.autoRenew).toBe(false);
    expect(fakeSub.paymentMethod.brand).toBe('visa');
  });

  it('Test 4 — Pago Advanced anual → confirmPayment guarda periodo ~1 año', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 370000, currency: 'eur',
      customer: customer.id, payment_method: pm.id, confirm: true,
      metadata: { plan: 'advanced', interval: 'annual', autoRenew: 'false' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    expect(pi.status).toBe('succeeded');
    expect(pi.amount).toBe(370000);

    const fakeSub = mockDoc({
      _id: 'sub_t4', accountId: 'acc_t4', plan: 'starter', interval: 'monthly',
      status: 'trial', stripeCustomerId: customer.id,
      trialEndDate: null, currentPeriodEnd: null,
    });
    SubMock.findOne.mockResolvedValue(fakeSub);
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_t4', email: 'test@test.com' }));

    const req = mockReq({ accountId: 'acc_t4', plan: 'advanced', interval: 'annual', paymentIntentId: pi.id });
    const res = mockRes();
    await confirmPayment(req, res);

    expect(fakeSub.plan).toBe('advanced');
    expect(fakeSub.interval).toBe('annual');
    expect(fakeSub.status).toBe('active');
    const periodEnd = new Date(fakeSub.currentPeriodEnd);
    const daysDiff = (periodEnd.getTime() - Date.now()) / 86400000;
    expect(daysDiff).toBeGreaterThanOrEqual(363);
    expect(daysDiff).toBeLessThanOrEqual(367);
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

    // Verificar que Stripe no ha cobrado nada
    const invoices = await stripe.invoices.list({ subscription: sub.id, limit: 5 });
    const paidInvoices = invoices.data.filter(i => i.amount_paid > 0);
    expect(paidInvoices.length).toBe(0);

    // Verificar fecha de trial exacta
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

  it('Test 12 — invoice.paid (subscription_cycle) → renueva periodo exactamente +1 mes', async () => {
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
    // Verifica que currentPeriodEnd sea exactamente ~1 mes desde ahora (no solo "en el futuro")
    const newEnd = new Date(existingSub.currentPeriodEnd);
    const daysDiff = (newEnd.getTime() - Date.now()) / 86400000;
    expect(daysDiff).toBeGreaterThanOrEqual(27);
    expect(daysDiff).toBeLessThanOrEqual(32);
    // currentPeriodStart debe haberse actualizado
    expect(existingSub.currentPeriodStart).toBeDefined();
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

  it('Test 15 — payment_intent.succeeded → activa suscripción con fechas correctas', async () => {
    const trialRemaining5Days = new Date(Date.now() + 5 * 86400000).toISOString();
    const existingSub = mockDoc({
      _id: 'sub_15', accountId: 'acc_15', plan: 'starter', interval: 'monthly',
      status: 'trial', stripeCustomerId: 'cus_test_15',
      trialEndDate: trialRemaining5Days,
      currentPeriodEnd: trialRemaining5Days,
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
    expect(existingSub.plan).toBe('starter');
    expect(existingSub.interval).toBe('monthly');
    // trialEndDate debe borrarse al activar
    expect(existingSub.trialEndDate).toBeNull();
    // currentPeriodEnd = ~1 mes + 5 días de trial restantes
    const periodEnd = new Date(existingSub.currentPeriodEnd);
    const daysDiff = (periodEnd.getTime() - Date.now()) / 86400000;
    expect(daysDiff).toBeGreaterThanOrEqual(32); // 30 + 5 - margen
    expect(daysDiff).toBeLessThanOrEqual(37);    // 31 + 5 + margen
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

  it('Test 17 — customer.subscription.deleted (periodo expirado) → canceled', async () => {
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

  it('Test 17b — customer.subscription.deleted (periodo aún vigente) → sigue active', async () => {
    // Periodo expira mañana — el usuario canceló autoRenew pero tiene días pagados
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const existingSub = mockDoc({
      _id: 'sub_17b', accountId: 'acc_17b',
      stripeSubscriptionId: 'sub_stripe_17b', stripeCustomerId: 'cus_test_17b',
      status: 'active', autoRenew: true,
      currentPeriodEnd: futureDate,
    });
    SubMock.findOne.mockResolvedValue(existingSub);

    const event = {
      id: 'evt_test_17b',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_stripe_17b',
          customer: 'cus_test_17b',
        },
      },
    };

    const payload = JSON.stringify(event);
    const sig = signWebhookPayload(payload);
    const req = mockReq(payload, {}, { 'stripe-signature': sig });
    const res = mockRes();

    await handleWebhook(req, res);

    // Periodo aún vigente → NO debe ponerse canceled (tiene días pagados)
    expect(existingSub.status).toBe('active');
    expect(existingSub.autoRenew).toBe(false);
    expect(existingSub.stripeSubscriptionId).toBeNull();
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
// SECCIÓN 4: FECHAS REALES — VERIFICACIÓN CON STRIPE + confirmPayment
// =============================================================================

describe('4. Fechas reales — periodos verificados contra Stripe y confirmPayment', () => {
  let customer: Stripe.Customer;
  let pm: Stripe.PaymentMethod;
  let confirmPayment: any;

  beforeAll(async () => {
    customer = await makeCustomer('dates-real@lyrium-test.io');
    pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    const mod = await import('../subscriptions.js');
    confirmPayment = mod.confirmPayment;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 19 — Suscripción mensual en Stripe → periodo = 28-31 días', async () => {
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
      default_payment_method: pm.id,
    });
    expect(sub.status).toBe('active');

    const item = sub.items.data[0];
    const periodDays = (item.current_period_end - item.current_period_start) / 86400;
    expect(periodDays).toBeGreaterThanOrEqual(28);
    expect(periodDays).toBeLessThanOrEqual(31);

    await stripe.subscriptions.cancel(sub.id);
  });

  it('Test 20 — Suscripción anual en Stripe → periodo = 364-366 días', async () => {
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterAnnual }],
      default_payment_method: pm.id,
    });
    expect(sub.status).toBe('active');

    const item = sub.items.data[0];
    const periodDays = (item.current_period_end - item.current_period_start) / 86400;
    expect(periodDays).toBeGreaterThanOrEqual(364);
    expect(periodDays).toBeLessThanOrEqual(366);

    await stripe.subscriptions.cancel(sub.id);
  });

  it('Test 21 — confirmPayment con trial de 5 días → periodo = 1 mes + 5 días', async () => {
    // Pago real en Stripe
    const pi = await stripe.paymentIntents.create({
      amount: 19700, currency: 'eur',
      customer: customer.id, payment_method: pm.id, confirm: true,
      metadata: { plan: 'starter', interval: 'monthly', autoRenew: 'false' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    expect(pi.status).toBe('succeeded');

    // Simular suscripción en estado trial con 5 días restantes
    const trialEnd5Days = new Date(Date.now() + 5 * 86400000).toISOString();
    const fakeSub = mockDoc({
      _id: 'sub_t21', accountId: 'acc_t21', plan: 'starter', interval: 'monthly',
      status: 'trial', stripeCustomerId: customer.id,
      trialEndDate: trialEnd5Days,
      currentPeriodEnd: trialEnd5Days,
    });
    SubMock.findOne.mockResolvedValue(fakeSub);
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_t21', email: 'test@test.com' }));

    const req = mockReq({ accountId: 'acc_t21', plan: 'starter', interval: 'monthly', paymentIntentId: pi.id });
    const res = mockRes();
    await confirmPayment(req, res);

    expect(fakeSub.status).toBe('active');
    expect(fakeSub.trialEndDate).toBeNull();

    // currentPeriodEnd debe ser ~1 mes + 5 días = ~35 días desde ahora
    const periodEnd = new Date(fakeSub.currentPeriodEnd);
    const daysDiff = (periodEnd.getTime() - Date.now()) / 86400000;
    expect(daysDiff).toBeGreaterThanOrEqual(32); // 28 + 5 - margen
    expect(daysDiff).toBeLessThanOrEqual(37);    // 31 + 5 + margen
  });

  it('Test 22 — confirmPayment con plan activo (10 días restantes) → periodo = 1 mes + 10 días', async () => {
    // Pago real en Stripe
    const pi = await stripe.paymentIntents.create({
      amount: 35000, currency: 'eur',
      customer: customer.id, payment_method: pm.id, confirm: true,
      metadata: { plan: 'advanced', interval: 'monthly', autoRenew: 'false' },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    expect(pi.status).toBe('succeeded');

    // Simular suscripción activa con 10 días restantes de periodo anterior
    const periodEnd10Days = new Date(Date.now() + 10 * 86400000).toISOString();
    const fakeSub = mockDoc({
      _id: 'sub_t22', accountId: 'acc_t22', plan: 'starter', interval: 'monthly',
      status: 'active', stripeCustomerId: customer.id,
      trialEndDate: null,
      currentPeriodEnd: periodEnd10Days,
    });
    SubMock.findOne.mockResolvedValue(fakeSub);
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_t22', email: 'test@test.com' }));

    const req = mockReq({ accountId: 'acc_t22', plan: 'advanced', interval: 'monthly', paymentIntentId: pi.id });
    const res = mockRes();
    await confirmPayment(req, res);

    expect(fakeSub.status).toBe('active');
    expect(fakeSub.plan).toBe('advanced');

    // currentPeriodEnd debe ser ~1 mes + 10 días = ~40 días desde ahora
    const periodEnd = new Date(fakeSub.currentPeriodEnd);
    const daysDiff = (periodEnd.getTime() - Date.now()) / 86400000;
    expect(daysDiff).toBeGreaterThanOrEqual(37); // 28 + 10 - margen
    expect(daysDiff).toBeLessThanOrEqual(42);    // 31 + 10 + margen
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
// SECCIÓN 7: REEMBOLSOS REALES
// =============================================================================

describe('7. Reembolsos reales', () => {
  let customer: Stripe.Customer;
  let pm: Stripe.PaymentMethod;

  beforeAll(async () => {
    customer = await makeCustomer('refunds@lyrium-test.io');
    pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
  });

  it('Test 27 — Reembolso completo de pago €197', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 19700, currency: 'eur',
      customer: customer.id, payment_method: pm.id,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    expect(pi.status).toBe('succeeded');

    const refund = await stripe.refunds.create({ payment_intent: pi.id });
    expect(refund.status).toBe('succeeded');
    expect(refund.amount).toBe(19700);
    expect(refund.currency).toBe('eur');

    // Verificar en Stripe
    const retrieved = await stripe.refunds.retrieve(refund.id);
    expect(retrieved.amount).toBe(19700);
    expect(retrieved.status).toBe('succeeded');
  });

  it('Test 28 — Reembolso parcial €100 de €350', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 35000, currency: 'eur',
      customer: customer.id, payment_method: pm.id,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    expect(pi.status).toBe('succeeded');

    const refund = await stripe.refunds.create({ payment_intent: pi.id, amount: 10000 });
    expect(refund.status).toBe('succeeded');
    expect(refund.amount).toBe(10000);

    // El charge original tiene amount_refunded = 10000
    const charges = await stripe.charges.list({ payment_intent: pi.id });
    expect(charges.data[0].amount_refunded).toBe(10000);
    expect(charges.data[0].refunded).toBe(false); // No es reembolso completo
  });

  it('Test 29 — Doble reembolso completo → error InvalidRequestError', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 19700, currency: 'eur',
      customer: customer.id, payment_method: pm.id,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    expect(pi.status).toBe('succeeded');

    // Primer reembolso completo
    await stripe.refunds.create({ payment_intent: pi.id });

    // Segundo reembolso → debe fallar
    await expect(
      stripe.refunds.create({ payment_intent: pi.id })
    ).rejects.toMatchObject({ type: 'StripeInvalidRequestError' });
  });

  it('Test 30 — Reembolso €2100 (pago anual)', async () => {
    const pi = await stripe.paymentIntents.create({
      amount: 210000, currency: 'eur',
      customer: customer.id, payment_method: pm.id,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    expect(pi.amount).toBe(210000);

    const refund = await stripe.refunds.create({ payment_intent: pi.id });
    expect(refund.amount).toBe(210000);
    expect(refund.status).toBe('succeeded');
  });
});

// =============================================================================
// SECCIÓN 8: VERIFICACIÓN DE PRECIOS EN STRIPE
// =============================================================================

describe('8. Verificación de precios en Stripe', () => {
  it('Test 31 — Starter mensual existe y vale €197/mes', async () => {
    const price = await stripe.prices.retrieve(PRICES.starterMonthly);
    expect(price.active).toBe(true);
    expect(price.currency).toBe('eur');
    expect(price.unit_amount).toBe(19700);
    expect(price.recurring?.interval).toBe('month');
    expect(price.type).toBe('recurring');
  });

  it('Test 32 — Starter anual existe y vale €2100/año', async () => {
    const price = await stripe.prices.retrieve(PRICES.starterAnnual);
    expect(price.active).toBe(true);
    expect(price.currency).toBe('eur');
    expect(price.unit_amount).toBe(210000);
    expect(price.recurring?.interval).toBe('year');
    expect(price.type).toBe('recurring');
  });

  it('Test 33 — Advanced mensual existe y vale €350/mes', async () => {
    const price = await stripe.prices.retrieve(PRICES.advancedMonthly);
    expect(price.active).toBe(true);
    expect(price.currency).toBe('eur');
    expect(price.unit_amount).toBe(35000);
    expect(price.recurring?.interval).toBe('month');
    expect(price.type).toBe('recurring');
  });

  it('Test 34 — Advanced anual existe y vale €3700/año', async () => {
    const price = await stripe.prices.retrieve(PRICES.advancedAnnual);
    expect(price.active).toBe(true);
    expect(price.currency).toBe('eur');
    expect(price.unit_amount).toBe(370000);
    expect(price.recurring?.interval).toBe('year');
    expect(price.type).toBe('recurring');
  });

  it('Test 35 — Los 4 precios pertenecen al mismo producto o productos activos', async () => {
    const prices = await Promise.all([
      stripe.prices.retrieve(PRICES.starterMonthly, { expand: ['product'] }),
      stripe.prices.retrieve(PRICES.starterAnnual, { expand: ['product'] }),
      stripe.prices.retrieve(PRICES.advancedMonthly, { expand: ['product'] }),
      stripe.prices.retrieve(PRICES.advancedAnnual, { expand: ['product'] }),
    ]);

    for (const price of prices) {
      expect(price.active).toBe(true);
      // El producto asociado debe estar activo
      const product = price.product as Stripe.Product;
      expect(product.active).toBe(true);
    }
  });
});

// =============================================================================
// SECCIÓN 9: TARJETAS ESPECIALES — FALLOS DE PAGO REALES
// =============================================================================

describe('9. Tarjetas especiales y fallos de pago reales', () => {
  let customer: Stripe.Customer;

  beforeAll(async () => {
    customer = await makeCustomer('card-failures@lyrium-test.io');
  });

  it('Test 36 — Tarjeta Mastercard funciona correctamente', async () => {
    const masterPM = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_mastercard' },
    });
    await stripe.paymentMethods.attach(masterPM.id, { customer: customer.id });

    const pi = await stripe.paymentIntents.create({
      amount: 19700, currency: 'eur',
      customer: customer.id,
      payment_method: masterPM.id,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    expect(pi.status).toBe('succeeded');

    // Verificar que es Mastercard
    const retrievedPM = await stripe.paymentMethods.retrieve(masterPM.id);
    expect(retrievedPM.card?.brand).toBe('mastercard');
    expect(retrievedPM.card?.last4).toBeDefined();
  });

  it('Test 40 — Visa Debit funciona correctamente', async () => {
    const debitPM = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_visa_debit' },
    });
    await stripe.paymentMethods.attach(debitPM.id, { customer: customer.id });

    const pi = await stripe.paymentIntents.create({
      amount: 35000, currency: 'eur',
      customer: customer.id,
      payment_method: debitPM.id,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    expect(pi.status).toBe('succeeded');
    expect(pi.amount).toBe(35000);

    const retrievedPM = await stripe.paymentMethods.retrieve(debitPM.id);
    expect(retrievedPM.card?.brand).toBe('visa');
    expect(retrievedPM.card?.funding).toBe('debit');
  });

  it('Test 40b — createPaymentIntent (app) con sub existente → devuelve paymentIntentId y clientSecret', async () => {
    const { createPaymentIntent } = await import('../subscriptions.js');

    // Simular sub existente con stripeCustomerId real
    const existingSub = mockDoc({
      _id: 'sub_card_1',
      accountId: 'acc_card_1',
      stripeCustomerId: customer.id,
      status: 'trial',
      save: vi.fn(),
    });
    SubMock.findOne.mockResolvedValue(existingSub);
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_card_1', email: 'card-failures@lyrium-test.io' }));

    const req = mockReq({ accountId: 'acc_card_1', plan: 'starter', interval: 'monthly', autoRenew: false });
    const res = mockRes();
    await createPaymentIntent(req, res);

    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0];
    expect(data.paymentIntentId).toBeDefined();
    expect(data.clientSecret).toBeDefined();
    expect(data.customerId).toBe(customer.id);

    // Verificar que Stripe creó un PaymentIntent real
    const pi = await stripe.paymentIntents.retrieve(data.paymentIntentId);
    expect(pi.amount).toBe(19700); // starter monthly = 197€ = 19700 cents
    expect(pi.currency).toBe('eur');
    expect(pi.metadata.plan).toBe('starter');
    expect(pi.metadata.interval).toBe('monthly');
  });

  it('Test 40c — createPaymentIntent (app) sin parámetros → 400', async () => {
    const { createPaymentIntent } = await import('../subscriptions.js');

    const req = mockReq({ accountId: 'acc_card_2' }); // falta plan e interval
    const res = mockRes();
    await createPaymentIntent(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBeDefined();
  });
});

// =============================================================================
// SECCIÓN 10: SETUP INTENTS — GUARDAR TARJETA SIN COBRAR
// =============================================================================

describe('10. Setup Intents — guardar tarjeta sin cobrar', () => {
  let customer: Stripe.Customer;

  beforeAll(async () => {
    customer = await makeCustomer('setup-intent@lyrium-test.io');
  });

  it('Test 41 — Crear SetupIntent, guardar tarjeta y usarla después', async () => {
    const si = await stripe.setupIntents.create({
      customer: customer.id,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    expect(si.status).toBe('requires_payment_method');
    expect(si.customer).toBe(customer.id);

    // Confirmar SetupIntent con tok_visa
    const pm = await makePM();
    const confirmed = await stripe.setupIntents.confirm(si.id, {
      payment_method: pm.id,
    });
    expect(confirmed.status).toBe('succeeded');

    // Usar la tarjeta guardada para hacer un pago real
    const pi = await stripe.paymentIntents.create({
      amount: 19700, currency: 'eur',
      customer: customer.id,
      payment_method: pm.id,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    expect(pi.status).toBe('succeeded');
    expect(pi.amount_received).toBe(19700);
  });

  it('Test 42 — SetupIntent cancelado → no puede confirmarse', async () => {
    const si = await stripe.setupIntents.create({
      customer: customer.id,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    const canceled = await stripe.setupIntents.cancel(si.id);
    expect(canceled.status).toBe('canceled');

    // Intentar confirmar → error
    const pm = await makePM();
    let caught: any;
    try {
      await stripe.setupIntents.confirm(si.id, { payment_method: pm.id });
    } catch (err: any) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.type).toBe('StripeInvalidRequestError');
  });

  it('Test 43 — SetupIntent para suscripción futura → PM guardado disponible', async () => {
    // Crear una sub con un setup intent previo (like en autoRenew)
    const si = await stripe.setupIntents.create({
      customer: customer.id,
      usage: 'off_session', // para cargos futuros sin que el usuario esté presente
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    const pm = await makePM();
    await stripe.setupIntents.confirm(si.id, { payment_method: pm.id });

    // Crear suscripción usando el PM guardado
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
      default_payment_method: pm.id,
    });
    expect(sub.status).toBe('active');
    expect(sub.default_payment_method).toBe(pm.id);

    await stripe.subscriptions.cancel(sub.id);
  });

  it('Test 43b — createPaymentIntent (app) con autoRenew=true + trial activo → devuelve setupIntentId', async () => {
    const { createPaymentIntent } = await import('../subscriptions.js');

    vi.clearAllMocks();

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 5); // 5 días de trial restantes

    const trialSub = mockDoc({
      _id: 'sub_setup_1',
      accountId: 'acc_setup_1',
      stripeCustomerId: customer.id,
      stripeSubscriptionId: null,
      status: 'trial',
      trialEndDate: trialEnd.toISOString(),
      currentPeriodEnd: trialEnd.toISOString(),
      save: vi.fn(async function (this: any) { return this; }),
    });
    SubMock.findOne.mockResolvedValue(trialSub);
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_setup_1', email: 'setup-intent@lyrium-test.io' }));

    const req = mockReq({ accountId: 'acc_setup_1', plan: 'starter', interval: 'monthly', autoRenew: true });
    const res = mockRes();
    await createPaymentIntent(req, res);

    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0];
    // autoRenew con trial activo → SetupIntent (no PaymentIntent)
    expect(data.setupIntentId).toBeDefined();
    expect(data.clientSecret).toBeDefined();
    expect(data.subscriptionId).toBeDefined();
    expect(data.customerId).toBe(customer.id);

    // Verificar que Stripe creó un SetupIntent real
    const si = await stripe.setupIntents.retrieve(data.setupIntentId);
    expect(si.status).toBe('requires_payment_method');
    expect(si.customer).toBe(customer.id);
    expect(si.usage).toBe('off_session');

    // Verificar que la suscripción Stripe tiene trial_end
    const stripeSub = await stripe.subscriptions.retrieve(data.subscriptionId);
    expect(stripeSub.trial_end).toBeDefined();
    expect(stripeSub.trial_end! * 1000).toBeGreaterThan(Date.now());

    // Cleanup: cancelar la sub creada
    await stripe.subscriptions.cancel(data.subscriptionId);
  });
});

// =============================================================================
// SECCIÓN 11: GESTIÓN DE CLIENTES EN STRIPE
// =============================================================================

describe('11. Gestión de clientes en Stripe', () => {
  it('Test 44 — Crear, actualizar y eliminar cliente', async () => {
    const created = await stripe.customers.create({
      email: 'lifecycle-customer@lyrium-test.io',
      name: 'Test User',
      metadata: { plan: 'starter', source: 'integration-test' },
    });
    // Se borra en el test, no añadir a toCleanup

    expect(created.email).toBe('lifecycle-customer@lyrium-test.io');
    expect(created.name).toBe('Test User');
    expect(created.metadata.plan).toBe('starter');

    // Actualizar
    const updated = await stripe.customers.update(created.id, {
      name: 'Updated Name',
      email: 'updated@lyrium-test.io',
      metadata: { plan: 'advanced' },
    });
    expect(updated.name).toBe('Updated Name');
    expect(updated.metadata.plan).toBe('advanced');

    // Eliminar
    const deleted = await stripe.customers.del(created.id);
    expect(deleted.deleted).toBe(true);

    // Verificar que está marcado como eliminado
    const retrieved = await stripe.customers.retrieve(created.id) as any;
    expect(retrieved.deleted).toBe(true);
  });

  it('Test 45 — Listar y gestionar múltiples tarjetas de un cliente', async () => {
    const customer = await makeCustomer('multi-card@lyrium-test.io');

    const pm1 = await makePM();
    const pm2 = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_mastercard' } });
    await stripe.paymentMethods.attach(pm1.id, { customer: customer.id });
    await stripe.paymentMethods.attach(pm2.id, { customer: customer.id });

    const pms = await stripe.paymentMethods.list({ customer: customer.id, type: 'card' });
    expect(pms.data.length).toBeGreaterThanOrEqual(2);

    const pmIds = pms.data.map(p => p.id);
    expect(pmIds).toContain(pm1.id);
    expect(pmIds).toContain(pm2.id);

    // Verificar marcas
    const brands = pms.data.map(p => p.card?.brand);
    expect(brands).toContain('visa');
    expect(brands).toContain('mastercard');
  });

  it('Test 46 — Desvincular tarjeta → ya no está asociada al cliente', async () => {
    const customer = await makeCustomer('detach-card@lyrium-test.io');
    const pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });

    let retrieved = await stripe.paymentMethods.retrieve(pm.id);
    expect(retrieved.customer).toBe(customer.id);

    const detached = await stripe.paymentMethods.detach(pm.id);
    expect(detached.customer).toBeNull();

    retrieved = await stripe.paymentMethods.retrieve(pm.id);
    expect(retrieved.customer).toBeNull();
  });

  it('Test 47 — Tarjeta predeterminada de cliente → usada en suscripción', async () => {
    const customer = await makeCustomer('default-pm@lyrium-test.io');
    const pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });

    // Establecer como método de pago predeterminado para facturas
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });

    const retrievedCustomer = await stripe.customers.retrieve(customer.id) as Stripe.Customer;
    expect(
      (retrievedCustomer.invoice_settings as any).default_payment_method
    ).toBe(pm.id);

    // Crear sub sin especificar PM → usa el predeterminado del cliente
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
    });
    expect(sub.status).toBe('active');

    await stripe.subscriptions.cancel(sub.id);
  });

  it('Test 47b — createPaymentIntent (app) sin customer previo → crea customer nuevo en Stripe', async () => {
    const { createPaymentIntent } = await import('../subscriptions.js');

    vi.clearAllMocks();

    // Sub sin stripeCustomerId → la app debe crear el customer
    const subWithoutCustomer = mockDoc({
      _id: 'sub_cust_1',
      accountId: 'acc_cust_1',
      stripeCustomerId: null,
      status: 'trial',
      save: vi.fn(async function (this: any) { return this; }),
    });
    SubMock.findOne.mockResolvedValue(subWithoutCustomer);
    SubMock.updateOne.mockResolvedValue({});
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_cust_1', email: 'new-customer@lyrium-test.io' }));

    const req = mockReq({ accountId: 'acc_cust_1', plan: 'starter', interval: 'monthly', autoRenew: false });
    const res = mockRes();
    await createPaymentIntent(req, res);

    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0];
    expect(data.customerId).toBeDefined();

    // Verificar que Stripe tiene un customer real con ese email
    const stripeCustomer = await stripe.customers.retrieve(data.customerId) as Stripe.Customer;
    expect(stripeCustomer.email).toBe('new-customer@lyrium-test.io');
    expect(stripeCustomer.metadata.accountId).toBe('acc_cust_1');

    // Verificar que updateOne fue llamado para persistir el customerId
    expect(SubMock.updateOne).toHaveBeenCalled();
    const updateCall = SubMock.updateOne.mock.calls[0];
    expect(updateCall[0]).toEqual({ accountId: 'acc_cust_1' });
    expect(updateCall[1].stripeCustomerId).toBe(data.customerId);

    // Cleanup
    toCleanup.customers.push(data.customerId);
  });

  it('Test 47c — createPaymentIntent (app) con customer previo → reutiliza el mismo', async () => {
    const { createPaymentIntent } = await import('../subscriptions.js');

    vi.clearAllMocks();

    const existingCustomer = await makeCustomer('existing-customer@lyrium-test.io');

    const subWithCustomer = mockDoc({
      _id: 'sub_cust_2',
      accountId: 'acc_cust_2',
      stripeCustomerId: existingCustomer.id,
      status: 'trial',
      save: vi.fn(async function (this: any) { return this; }),
    });
    SubMock.findOne.mockResolvedValue(subWithCustomer);
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_cust_2', email: 'existing-customer@lyrium-test.io' }));

    const req = mockReq({ accountId: 'acc_cust_2', plan: 'advanced', interval: 'annual', autoRenew: false });
    const res = mockRes();
    await createPaymentIntent(req, res);

    expect(res.json).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0];
    // Debe reutilizar el mismo customer
    expect(data.customerId).toBe(existingCustomer.id);

    // Verificar el monto correcto para advanced annual = 3700€ = 370000 cents
    const pi = await stripe.paymentIntents.retrieve(data.paymentIntentId);
    expect(pi.amount).toBe(370000);
    expect(pi.metadata.plan).toBe('advanced');
    expect(pi.metadata.interval).toBe('annual');
    expect(pi.customer).toBe(existingCustomer.id);
  });
});

// =============================================================================
// SECCIÓN 12: TEST CLOCKS AVANZADOS
// =============================================================================

describe('12. Test Clocks avanzados', () => {
  it('Test 48 — Renovación anual → 366 días después Stripe genera nueva factura', async () => {
    const now = Math.floor(Date.now() / 1000);
    const testClock = await stripe.testHelpers.testClocks.create({ frozen_time: now });
    toCleanup.testClocks.push(testClock.id);

    const customer = await stripe.customers.create({
      email: 'annual-clock@lyrium-test.io',
      test_clock: testClock.id,
    });
    toCleanup.customers.push(customer.id);

    const pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterAnnual }],
    });
    expect(sub.status).toBe('active');

    const originalPeriodEnd = sub.items.data[0].current_period_end;

    // Avanzar 366 días
    await stripe.testHelpers.testClocks.advance(testClock.id, { frozen_time: now + 366 * 86400 });
    await waitForTestClock(testClock.id);

    const updatedSub = await stripe.subscriptions.retrieve(sub.id);
    expect(updatedSub.status).toBe('active');
    expect(updatedSub.items.data[0].current_period_start).toBeGreaterThanOrEqual(originalPeriodEnd);

    // Al menos 2 facturas pagadas
    const invoices = await stripe.invoices.list({ subscription: sub.id, limit: 10 });
    const paid = invoices.data.filter(i => i.status === 'paid');
    expect(paid.length).toBeGreaterThanOrEqual(2);

    // Monto de renovación = €2100
    const renewalInvoice = paid.find(i => i.billing_reason === 'subscription_cycle');
    expect(renewalInvoice).toBeDefined();
    expect(renewalInvoice!.amount_paid).toBe(210000);
  });

  it('Test 49 — Cancel at period end → activa hasta fin, luego canceled', async () => {
    const now = Math.floor(Date.now() / 1000);
    const testClock = await stripe.testHelpers.testClocks.create({ frozen_time: now });
    toCleanup.testClocks.push(testClock.id);

    const customer = await stripe.customers.create({
      email: 'cancel-end-clock@lyrium-test.io',
      test_clock: testClock.id,
    });
    toCleanup.customers.push(customer.id);

    const pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
    });

    // Marcar cancel_at_period_end
    const cancelScheduled = await stripe.subscriptions.update(sub.id, {
      cancel_at_period_end: true,
    });
    expect(cancelScheduled.status).toBe('active');
    expect(cancelScheduled.cancel_at_period_end).toBe(true);

    // Avanzar 32 días (pasa el fin del periodo mensual)
    await stripe.testHelpers.testClocks.advance(testClock.id, { frozen_time: now + 32 * 86400 });
    await waitForTestClock(testClock.id);

    const finalSub = await stripe.subscriptions.retrieve(sub.id);
    expect(finalSub.status).toBe('canceled');
  });

  it('Test 50 — Upgrade Starter→Advanced a mitad de mes → factura de proration', async () => {
    const now = Math.floor(Date.now() / 1000);
    const testClock = await stripe.testHelpers.testClocks.create({ frozen_time: now });
    toCleanup.testClocks.push(testClock.id);

    const customer = await stripe.customers.create({
      email: 'upgrade-proration@lyrium-test.io',
      test_clock: testClock.id,
    });
    toCleanup.customers.push(customer.id);

    const pm = await makePM();
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: PRICES.starterMonthly }],
    });
    expect(sub.status).toBe('active');

    // Avanzar 15 días (mitad del mes)
    await stripe.testHelpers.testClocks.advance(testClock.id, { frozen_time: now + 15 * 86400 });
    await waitForTestClock(testClock.id);

    // Upgrade con proration
    const updated = await stripe.subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0].id, price: PRICES.advancedMonthly }],
      proration_behavior: 'always_invoice',
    });
    expect(updated.items.data[0].price.id).toBe(PRICES.advancedMonthly);

    // Verificar factura de proration
    const invoices = await stripe.invoices.list({ subscription: sub.id, limit: 10 });
    const proratedInvoice = invoices.data.find(i => i.billing_reason === 'subscription_update');
    expect(proratedInvoice).toBeDefined();
    // Upgrade = cargo positivo (Advanced > Starter)
    expect(proratedInvoice!.amount_due).toBeGreaterThan(0);
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

  it('Test 51 — Login cuenta principal con suscripción expirada → 403 + needsPayment', async () => {
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

  it('Test 52 — Login subcuenta con suscripción expirada → 403 SIN needsPayment', async () => {
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

  it('Test 53 — Usuario paga desde login expirado → confirmPayment → siguiente login exitoso', async () => {
    let confirmPayment: any;
    const subsMod = await import('../subscriptions.js');
    confirmPayment = subsMod.confirmPayment;

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
      stripeCustomerId: null,
      trialEndDate: null,
      plan: 'starter',
      interval: 'monthly',
    });

    AccMock.findOne.mockResolvedValue(mockUser);
    SubaccMock.findOne.mockResolvedValue(null);
    SubMock.findOne.mockResolvedValue(expiredSub);

    const req1 = mockReq({ email: 'renew@lyrium.io', password: 'Test1234!', totpCode: '123456' });
    const res1 = mockRes();
    await login(req1, res1);

    expect(res1.status).toHaveBeenCalledWith(403);
    expect(res1.json.mock.calls[0][0].needsPayment).toBe(true);

    // Paso 2: Pago real en Stripe
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

    // Paso 3: Llamar a confirmPayment REAL (no simulación manual)
    vi.clearAllMocks();
    expiredSub.stripeCustomerId = customer.id;
    SubMock.findOne.mockResolvedValue(expiredSub);
    AccMock.findById.mockResolvedValue(mockDoc({ _id: 'acc_29', email: 'renew@lyrium.io' }));

    const reqConfirm = mockReq({ accountId: 'acc_29', plan: 'starter', interval: 'monthly', paymentIntentId: pi.id });
    const resConfirm = mockRes();
    await confirmPayment(reqConfirm, resConfirm);

    expect(resConfirm.json).toHaveBeenCalled();
    expect(resConfirm.json.mock.calls[0][0].success).toBe(true);
    // La suscripción ahora debe estar activa
    expect(expiredSub.status).toBe('active');
    expect(expiredSub.plan).toBe('starter');
    expect(expiredSub.paymentMethod.brand).toBe('visa');
    expect(expiredSub.paymentMethod.last4).toBe('4242');
    const periodEnd = new Date(expiredSub.currentPeriodEnd);
    expect(periodEnd.getTime()).toBeGreaterThan(Date.now());

    // Paso 4: Siguiente login con sub ahora activa → 200
    vi.clearAllMocks();
    BcryptMock.compare.mockResolvedValue(true);
    AccMock.findOne.mockResolvedValue(mockUser);
    SubaccMock.findOne.mockResolvedValue(null);
    SubMock.findOne.mockResolvedValue(expiredSub);

    const req2 = mockReq({ email: 'renew@lyrium.io', password: 'Test1234!', totpCode: '123456' });
    const res2 = mockRes();
    await login(req2, res2);

    expect(res2.json).toHaveBeenCalled();
    const successData = res2.json.mock.calls[0][0];
    expect(successData.success).toBe(true);
    expect(successData.user.email).toBe('renew@lyrium.io');
  });
});
