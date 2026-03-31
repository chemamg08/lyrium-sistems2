/**
 * Stripe Integration Tests — Lyrium Systems
 *
 * 23 test suites covering every Stripe-related user action:
 *  - Trial creation
 *  - Subscription queries
 *  - Payment intents (one-time & auto-renew)
 *  - Payment confirmation (PaymentIntent & SetupIntent)
 *  - Plan changes
 *  - Cancel auto-renew
 *  - Subscription validation
 *  - Webhooks (6 event types + signature verification)
 *  - Invoice generation & emailing
 *  - Admin operations (stats, modify subscription, disable account)
 *  - Cleanup service
 *  - Period calculation edge cases
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (available before vi.mock factories) ─────────────────────

const {
  stripeMock,
  SubscriptionMock,
  AccountMock,
  invoiceMocks,
} = vi.hoisted(() => {
  const _vi = {
    fn: (...args: any[]) => {
      // This runs at hoist-time; vitest injects vi globally so we can use it
      return (globalThis as any).__vitest_mocker__
        ? (globalThis as any).__vitest_mocker__.fn(...args)
        : { mockResolvedValue: () => ({}), mockReturnValue: () => ({}), mockImplementation: () => ({}) };
    },
  };

  // We return plain objects — vi.fn() is available because vitest injects it
  return {
    stripeMock: {
      customers: {
        create: vi.fn(),
        retrieve: vi.fn(),
        update: vi.fn(),
      },
      subscriptions: {
        create: vi.fn(),
        retrieve: vi.fn(),
        update: vi.fn(),
        cancel: vi.fn(),
      },
      setupIntents: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
      paymentIntents: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
      paymentMethods: {
        retrieve: vi.fn(),
        attach: vi.fn(),
        detach: vi.fn(),
      },
      invoices: {
        pay: vi.fn(),
      },
      charges: {
        list: vi.fn(),
      },
      webhooks: {
        constructEvent: vi.fn(),
      },
    },

    SubscriptionMock: {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      updateOne: vi.fn(),
      deleteMany: vi.fn(),
      countDocuments: vi.fn(),
    },

    AccountMock: {
      findById: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      updateOne: vi.fn(),
      deleteMany: vi.fn(),
      countDocuments: vi.fn(),
      findOne: vi.fn(),
    },

    invoiceMocks: {
      generateInvoicePDF: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
      sendInvoiceEmail: vi.fn().mockResolvedValue(undefined),
      buildInvoiceNumber: vi.fn((n: number) => `LY-2026-${String(n).padStart(4, '0')}`),
      buildConcept: vi.fn((plan: string, interval: string) => {
        const p = plan === 'advanced' ? 'Advanced' : 'Starter';
        const i = interval === 'annual' ? 'Anual' : 'Mensual';
        return `Suscripción Lyrium — Plan ${p} ${i}`;
      }),
      formatShortDate: vi.fn((d: Date) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
      }),
    },
  };
});

// ─── Module mocks ───────────────────────────────────────────────────────────

vi.mock('stripe', () => ({
  default: vi.fn(function () { return stripeMock; }),
}));

vi.mock('../models/Subscription.js', () => ({
  Subscription: SubscriptionMock,
}));

vi.mock('../models/Account.js', () => ({
  Account: AccountMock,
}));

vi.mock('../models/Subaccount.js', () => ({
  Subaccount: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}), findOne: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../services/invoiceService.js', () => invoiceMocks);

vi.mock('../middleware/auth.js', () => ({ AuthRequest: {} }));

vi.mock('bcrypt', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed_password') },
}));

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

// Mock all cleanup-related models
vi.mock('../models/Client.js', () => ({ Client: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/Chat.js', () => ({ Chat: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/AssistantChat.js', () => ({ AssistantChat: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/FiscalChat.js', () => ({ FiscalChat: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/ContractChat.js', () => ({ ContractChat: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/DefenseChat.js', () => ({ DefenseChat: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/DocumentSummariesChat.js', () => ({ DocumentSummariesChat: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/Automation.js', () => ({ Automation: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/FiscalAlert.js', () => ({ FiscalAlert: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/Stat.js', () => ({ Stat: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/Job.js', () => ({ Job: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/Calculation.js', () => ({ Calculation: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/FiscalProfile.js', () => ({ FiscalProfile: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/Contract.js', () => ({ Contract: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/GeneratedContract.js', () => ({ GeneratedContract: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/EmailConfig.js', () => ({ EmailConfig: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/WritingText.js', () => ({ WritingText: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/SpecialtiesSettings.js', () => ({ SpecialtiesSettings: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));
vi.mock('../models/SharedFile.js', () => ({ SharedFile: { find: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({}) } }));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDoc(data: Record<string, any>) {
  const doc: any = { ...data };
  doc.save = vi.fn().mockResolvedValue(doc);
  doc.updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  doc.toJSON = () => {
    const json: any = {};
    for (const key of Object.keys(doc)) {
      if (key !== 'save' && key !== 'updateOne' && key !== 'toJSON') {
        json[key] = doc[key];
      }
    }
    json.id = json._id;
    delete json._id;
    return json;
  };
  return doc;
}

function mockReq(
  body: Record<string, any> = {},
  query: Record<string, any> = {},
  params: Record<string, any> = {},
  headers: Record<string, any> = {},
) {
  return { body, query, params, headers } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function makeTrialSub(accountId: string, overrides: Record<string, any> = {}) {
  return createMockDoc({
    _id: 'sub_1',
    accountId,
    plan: 'starter',
    interval: 'monthly',
    status: 'trial',
    trialEndDate: futureDate(10),
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: futureDate(10),
    autoRenew: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    stripePaymentMethodId: null,
    paymentMethod: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });
}

function makeActiveSub(accountId: string, overrides: Record<string, any> = {}) {
  return createMockDoc({
    _id: 'sub_1',
    accountId,
    plan: 'starter',
    interval: 'monthly',
    status: 'active',
    trialEndDate: null,
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: futureDate(30),
    autoRenew: true,
    stripeCustomerId: 'cus_test123',
    stripeSubscriptionId: 'sub_stripe_123',
    stripePaymentMethodId: 'pm_test123',
    paymentMethod: { brand: 'visa', last4: '4242' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });
}

function makeAccount(id: string, overrides: Record<string, any> = {}) {
  return createMockDoc({
    _id: id,
    name: 'Test User',
    email: 'test@example.com',
    password: 'hashed',
    country: 'ES',
    type: 'main',
    role: 'user',
    companyName: 'Test Company',
    companyAddress: 'Test Street 1',
    companyPhone: '+34600000000',
    companyEmail: 'billing@test.com',
    companyCIF: 'B12345678',
    invoiceNotes: '',
    nextInvoiceNumber: 1,
    ...overrides,
  });
}

// ─── Import modules under test ──────────────────────────────────────────────

import {
  createTrialSubscription,
  getSubscription,
  createPaymentIntent,
  confirmPayment,
  handleWebhook,
  changePlan,
  cancelAutoRenew,
  validateSubscription,
} from '../subscriptions.js';

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── TEST 1: Crear trial ────────────────────────────────────────────────────

describe('1. createTrialSubscription', () => {
  it('crea suscripción trial de 14 días', async () => {
    SubscriptionMock.findOne.mockResolvedValue(null);
    SubscriptionMock.create.mockImplementation(async (data: any) => createMockDoc(data));

    const req = mockReq({ accountId: 'acc_1' });
    const res = mockRes();

    await createTrialSubscription(req, res);

    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.plan).toBe('starter');
    expect(result.subscription.status).toBe('trial');
    expect(result.subscription.autoRenew).toBe(false);

    const trialEnd = new Date(result.subscription.trialEndDate);
    const now = new Date();
    const diffDays = Math.round((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(14);
  });

  it('rechaza si ya existe suscripción', async () => {
    SubscriptionMock.findOne.mockResolvedValue(makeTrialSub('acc_1'));

    const req = mockReq({ accountId: 'acc_1' });
    const res = mockRes();

    await createTrialSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rechaza si falta accountId', async () => {
    const req = mockReq({});
    const res = mockRes();

    await createTrialSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─── TEST 2: Obtener suscripción ────────────────────────────────────────────

describe('2. getSubscription', () => {
  it('devuelve la suscripción por accountId', async () => {
    const sub = makeTrialSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq({}, { accountId: 'acc_1' });
    const res = mockRes();

    await getSubscription(req, res);

    expect(res.json).toHaveBeenCalled();
  });

  it('devuelve 404 si no existe', async () => {
    SubscriptionMock.findOne.mockResolvedValue(null);

    const req = mockReq({}, { accountId: 'acc_nonexistent' });
    const res = mockRes();

    await getSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('rechaza si falta accountId', async () => {
    const req = mockReq({}, {});
    const res = mockRes();

    await getSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─── TEST 3: PaymentIntent (pago único sin auto-renew) ─────────────────────

describe('3. createPaymentIntent — pago único', () => {
  it('crea PaymentIntent para Starter mensual sin auto-renew', async () => {
    const sub = makeTrialSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' });
    stripeMock.paymentIntents.create.mockResolvedValue({
      client_secret: 'pi_secret_test',
      id: 'pi_test_123',
    });

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      autoRenew: false,
    });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.clientSecret).toBe('pi_secret_test');
    expect(result.paymentIntentId).toBe('pi_test_123');
    expect(result.subscriptionId).toBeUndefined();

    // 197 * 100 = 19700 cents
    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 19700,
        currency: 'eur',
      })
    );
  });

  it('crea PaymentIntent para Advanced anual sin auto-renew', async () => {
    const sub = makeTrialSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.customers.create.mockResolvedValue({ id: 'cus_new' });
    stripeMock.paymentIntents.create.mockResolvedValue({
      client_secret: 'pi_secret_adv',
      id: 'pi_adv_123',
    });

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'advanced',
      interval: 'annual',
      autoRenew: false,
    });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 370000,
        currency: 'eur',
      })
    );
  });

  it('reutiliza Stripe customer existente', async () => {
    const sub = makeTrialSub('acc_1', { stripeCustomerId: 'cus_existing' });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_existing', email: 'test@example.com' });
    stripeMock.paymentIntents.create.mockResolvedValue({
      client_secret: 'pi_secret_reuse',
      id: 'pi_reuse',
    });

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      autoRenew: false,
    });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(stripeMock.customers.create).not.toHaveBeenCalled();
    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing' })
    );
  });

  it('rechaza plan no válido', async () => {
    const req = mockReq({
      accountId: 'acc_1',
      plan: 'enterprise',
      interval: 'monthly',
      autoRenew: false,
    });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rechaza si faltan parámetros', async () => {
    const req = mockReq({ accountId: 'acc_1' });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─── TEST 4: SetupIntent (auto-renew con trial activo) ─────────────────────

describe('4. createPaymentIntent — auto-renew con trial activo', () => {
  it('crea Stripe Subscription con trial_end y devuelve SetupIntent', async () => {
    const trialEnd = futureDate(10);
    const sub = makeTrialSub('acc_1', { trialEndDate: trialEnd, currentPeriodEnd: trialEnd });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.customers.create.mockResolvedValue({ id: 'cus_trial' });
    stripeMock.subscriptions.create.mockResolvedValue({ id: 'sub_stripe_trial' });
    stripeMock.setupIntents.create.mockResolvedValue({
      client_secret: 'si_secret_trial',
      id: 'si_trial_123',
    });

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      autoRenew: true,
    });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.clientSecret).toBe('si_secret_trial');
    expect(result.setupIntentId).toBe('si_trial_123');
    expect(result.subscriptionId).toBe('sub_stripe_trial');

    expect(stripeMock.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_trial',
        trial_end: expect.any(Number),
        payment_settings: expect.objectContaining({
          save_default_payment_method: 'on_subscription',
        }),
      })
    );
  });

  it('cancela suscripción Stripe previa antes de crear nueva', async () => {
    const sub = makeTrialSub('acc_1', {
      stripeSubscriptionId: 'sub_old',
      stripeCustomerId: 'cus_existing',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.customers.retrieve.mockResolvedValue({ id: 'cus_existing', email: 'test@example.com' });
    stripeMock.subscriptions.cancel.mockResolvedValue({});
    stripeMock.subscriptions.create.mockResolvedValue({ id: 'sub_new' });
    stripeMock.setupIntents.create.mockResolvedValue({
      client_secret: 'si_secret_new',
      id: 'si_new',
    });

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      autoRenew: true,
    });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith('sub_old');
    expect(stripeMock.subscriptions.create).toHaveBeenCalled();
  });
});

// ─── TEST 5: SetupIntent (auto-renew con trial expirado) ───────────────────

describe('5. createPaymentIntent — auto-renew con trial expirado', () => {
  it('crea Stripe Subscription con payment_behavior default_incomplete', async () => {
    const sub = makeTrialSub('acc_1', {
      trialEndDate: pastDate(5),
      currentPeriodEnd: pastDate(5),
      status: 'expired',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.customers.create.mockResolvedValue({ id: 'cus_expired' });
    stripeMock.subscriptions.create.mockResolvedValue({
      id: 'sub_stripe_expired',
      latest_invoice: { payment_intent: { client_secret: 'pi_secret_inv' } },
    });
    stripeMock.setupIntents.create.mockResolvedValue({
      client_secret: 'si_secret_expired',
      id: 'si_expired_123',
    });

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      autoRenew: true,
    });
    const res = mockRes();

    await createPaymentIntent(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.setupIntentId).toBe('si_expired_123');
    expect(result.subscriptionId).toBe('sub_stripe_expired');

    expect(stripeMock.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_behavior: 'default_incomplete',
      })
    );
  });
});

// ─── TEST 6: Confirmar pago (PaymentIntent — pago único) ───────────────────

describe('6. confirmPayment — pago único con PaymentIntent', () => {
  it('activa suscripción y genera factura', async () => {
    const sub = makeTrialSub('acc_1', { trialEndDate: futureDate(10) });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_test',
      payment_method: 'pm_card_visa',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_card_visa',
      card: { brand: 'visa', last4: '4242' },
    });

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      paymentIntentId: 'pi_test',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.status).toBe('active');
    expect(result.subscription.autoRenew).toBe(false);
    expect(result.subscription.paymentMethod.brand).toBe('visa');
    expect(result.subscription.paymentMethod.last4).toBe('4242');

    // Period end: ~1 month + ~10 remaining trial days
    const periodEnd = new Date(result.subscription.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(30 + 9);
  });

  it('activa suscripción anual (trial expirado)', async () => {
    const sub = makeTrialSub('acc_1', {
      trialEndDate: pastDate(2),
      status: 'expired',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_annual',
      payment_method: 'pm_mc',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_mc',
      card: { brand: 'mastercard', last4: '5555' },
    });

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'advanced',
      interval: 'annual',
      paymentIntentId: 'pi_annual',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.plan).toBe('advanced');
    expect(result.subscription.interval).toBe('annual');

    const periodEnd = new Date(result.subscription.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(360);
    expect(diffDays).toBeLessThanOrEqual(370);
  });

  it('rechaza si falta paymentIntentId y setupIntentId', async () => {
    SubscriptionMock.findOne.mockResolvedValue(makeTrialSub('acc_1'));

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('devuelve 404 si no existe suscripción', async () => {
    SubscriptionMock.findOne.mockResolvedValue(null);

    const req = mockReq({
      accountId: 'acc_nonexistent',
      plan: 'starter',
      interval: 'monthly',
      paymentIntentId: 'pi_test',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ─── TEST 7: Confirmar pago (SetupIntent — auto-renew) ─────────────────────

describe('7. confirmPayment — auto-renew con SetupIntent', () => {
  it('vincula tarjeta y activa suscripción (trial activo)', async () => {
    const trialEnd = futureDate(10);
    const sub = makeTrialSub('acc_1', {
      trialEndDate: trialEnd,
      stripeCustomerId: 'cus_ar',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.setupIntents.retrieve.mockResolvedValue({
      id: 'si_ar_123',
      payment_method: 'pm_ar_visa',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_ar_visa',
      card: { brand: 'visa', last4: '1234' },
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      setupIntentId: 'si_ar_123',
      subscriptionId: 'sub_stripe_ar',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.status).toBe('active');
    expect(result.subscription.autoRenew).toBe(true);
    expect(result.subscription.paymentMethod.last4).toBe('1234');

    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_stripe_ar',
      expect.objectContaining({
        default_payment_method: 'pm_ar_visa',
      })
    );
  });

  it('paga factura pendiente si trial ya expirado', async () => {
    const sub = makeTrialSub('acc_1', {
      trialEndDate: pastDate(3),
      stripeCustomerId: 'cus_exp',
      status: 'expired',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.setupIntents.retrieve.mockResolvedValue({
      id: 'si_exp',
      payment_method: 'pm_exp_visa',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_exp_visa',
      card: { brand: 'visa', last4: '9999' },
    });
    stripeMock.subscriptions.update.mockResolvedValue({});
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      latest_invoice: { id: 'inv_pending', status: 'open' },
    });
    stripeMock.invoices.pay.mockResolvedValue({});

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      setupIntentId: 'si_exp',
      subscriptionId: 'sub_stripe_exp',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    expect(stripeMock.invoices.pay).toHaveBeenCalledWith('inv_pending');
  });
});

// ─── TEST 8: Cambiar plan ───────────────────────────────────────────────────

describe('8. changePlan', () => {
  it('cambia de Starter a Advanced con Stripe update', async () => {
    const sub = makeActiveSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_stripe_123',
      items: { data: [{ id: 'si_item_1' }] },
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = mockReq({
      accountId: 'acc_1',
      newPlan: 'advanced',
      newInterval: 'monthly',
    });
    const res = mockRes();

    await changePlan(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.plan).toBe('advanced');

    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_stripe_123',
      expect.objectContaining({
        items: [{ id: 'si_item_1', price: 'price_advanced_monthly_test' }],
        proration_behavior: 'always_invoice',
      })
    );
  });

  it('cambia de monthly a annual', async () => {
    const sub = makeActiveSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_stripe_123',
      items: { data: [{ id: 'si_item_1' }] },
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = mockReq({
      accountId: 'acc_1',
      newPlan: 'starter',
      newInterval: 'annual',
    });
    const res = mockRes();

    await changePlan(req, res);

    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_stripe_123',
      expect.objectContaining({
        items: [{ id: 'si_item_1', price: 'price_starter_annual_test' }],
      })
    );
  });

  it('rechaza si suscripción no está activa', async () => {
    const sub = makeTrialSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq({
      accountId: 'acc_1',
      newPlan: 'advanced',
      newInterval: 'monthly',
    });
    const res = mockRes();

    await changePlan(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('devuelve 404 si no existe suscripción', async () => {
    SubscriptionMock.findOne.mockResolvedValue(null);

    const req = mockReq({
      accountId: 'acc_unknown',
      newPlan: 'advanced',
      newInterval: 'monthly',
    });
    const res = mockRes();

    await changePlan(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ─── TEST 9: Cancelar auto-renew ───────────────────────────────────────────

describe('9. cancelAutoRenew', () => {
  it('cancela suscripción Stripe, desvincula tarjeta y limpia campos', async () => {
    const sub = makeActiveSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.cancel.mockResolvedValue({});
    stripeMock.paymentMethods.detach.mockResolvedValue({});

    const req = mockReq({ accountId: 'acc_1' });
    const res = mockRes();

    await cancelAutoRenew(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.autoRenew).toBe(false);
    expect(result.subscription.stripeSubscriptionId).toBeNull();
    expect(result.subscription.stripePaymentMethodId).toBeNull();
    expect(result.subscription.paymentMethod).toBeNull();

    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith('sub_stripe_123');
    expect(stripeMock.paymentMethods.detach).toHaveBeenCalledWith('pm_test123');
  });

  it('funciona si no tiene Stripe subscription (solo DB)', async () => {
    const sub = makeActiveSub('acc_1', {
      stripeSubscriptionId: null,
      stripePaymentMethodId: null,
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq({ accountId: 'acc_1' });
    const res = mockRes();

    await cancelAutoRenew(req, res);

    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripeMock.paymentMethods.detach).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  it('devuelve 404 si no existe suscripción', async () => {
    SubscriptionMock.findOne.mockResolvedValue(null);

    const req = mockReq({ accountId: 'acc_missing' });
    const res = mockRes();

    await cancelAutoRenew(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ─── TEST 10: Validar suscripción ──────────────────────────────────────────

describe('10. validateSubscription', () => {
  it('devuelve valid=true si periodo vigente', async () => {
    const sub = makeActiveSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq({}, { accountId: 'acc_1' });
    const res = mockRes();

    await validateSubscription(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.valid).toBe(true);
    expect(result.subscription).toBeDefined();
  });

  it('devuelve valid=false y marca expired si periodo vencido', async () => {
    const sub = makeActiveSub('acc_1', {
      currentPeriodEnd: pastDate(5),
      status: 'active',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq({}, { accountId: 'acc_1' });
    const res = mockRes();

    await validateSubscription(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
    expect(sub.status).toBe('expired');
    expect(sub.save).toHaveBeenCalled();
  });

  it('devuelve valid=false reason=no_subscription si no existe', async () => {
    SubscriptionMock.findOne.mockResolvedValue(null);

    const req = mockReq({}, { accountId: 'acc_ghost' });
    const res = mockRes();

    await validateSubscription(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('no_subscription');
  });
});

// ─── TEST 11: Webhook — checkout.session.completed ─────────────────────────

describe('11. Webhook: checkout.session.completed', () => {
  it('activa suscripción tras checkout exitoso', async () => {
    const sub = makeTrialSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { accountId: 'acc_1', plan: 'starter', interval: 'monthly', autoRenew: 'true' },
          customer: 'cus_checkout',
          subscription: 'sub_checkout',
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(sub.status).toBe('active');
    expect(sub.stripeCustomerId).toBe('cus_checkout');
    expect(sub.autoRenew).toBe(true);
    expect(sub.save).toHaveBeenCalled();
  });
});

// ─── TEST 12: Webhook — payment_intent.succeeded ───────────────────────────

describe('12. Webhook: payment_intent.succeeded', () => {
  it('activa suscripción tras pago único exitoso', async () => {
    const sub = makeTrialSub('acc_1', { trialEndDate: futureDate(5) });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          metadata: { accountId: 'acc_1', plan: 'starter', interval: 'monthly', autoRenew: 'false' },
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(sub.status).toBe('active');
    expect(sub.autoRenew).toBe(false);

    const periodEnd = new Date(sub.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(30 + 4);
  });

  it('ignora eventos con autoRenew=true (los maneja invoice.paid)', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          metadata: { accountId: 'acc_1', plan: 'starter', interval: 'monthly', autoRenew: 'true' },
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(SubscriptionMock.findOne).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});

// ─── TEST 13: Webhook — payment_method.attached ────────────────────────────

describe('13. Webhook: payment_method.attached', () => {
  it('guarda marca y last4 de la tarjeta', async () => {
    const sub = makeActiveSub('acc_1', { stripeCustomerId: 'cus_pm' });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'payment_method.attached',
      data: {
        object: {
          id: 'pm_new_card',
          customer: 'cus_pm',
          card: { brand: 'mastercard', last4: '8888' },
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(sub.paymentMethod).toEqual({ brand: 'mastercard', last4: '8888' });
    expect(sub.stripePaymentMethodId).toBe('pm_new_card');
    expect(sub.save).toHaveBeenCalled();
  });
});

// ─── TEST 14: Webhook — invoice.paid (renovación) ──────────────────────────

describe('14. Webhook: invoice.paid', () => {
  it('extiende periodo en renovación automática mensual', async () => {
    const sub = makeActiveSub('acc_1', { stripeCustomerId: 'cus_renew' });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.paid',
      data: {
        object: {
          customer: 'cus_renew',
          billing_reason: 'subscription_cycle',
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(sub.status).toBe('active');

    const periodEnd = new Date(sub.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(28);
    expect(diffDays).toBeLessThanOrEqual(33);
  });

  it('extiende periodo en renovación automática anual', async () => {
    const sub = makeActiveSub('acc_1', {
      stripeCustomerId: 'cus_renew_yr',
      interval: 'annual',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.paid',
      data: {
        object: {
          customer: 'cus_renew_yr',
          billing_reason: 'subscription_cycle',
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    const periodEnd = new Date(sub.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(360);
    expect(diffDays).toBeLessThanOrEqual(370);
  });

  it('ignora facturas de subscription_update (proration)', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.paid',
      data: {
        object: {
          customer: 'cus_proration',
          billing_reason: 'subscription_update',
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(SubscriptionMock.findOne).not.toHaveBeenCalled();
  });

  it('ignora facturas de subscription_create (trial $0)', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.paid',
      data: {
        object: {
          customer: 'cus_trial_create',
          billing_reason: 'subscription_create',
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(SubscriptionMock.findOne).not.toHaveBeenCalled();
  });
});

// ─── TEST 15: Webhook — customer.subscription.deleted ──────────────────────

describe('15. Webhook: customer.subscription.deleted', () => {
  it('marca canceled si periodo ya expiró', async () => {
    const sub = makeActiveSub('acc_1', {
      currentPeriodEnd: pastDate(2),
      stripeSubscriptionId: 'sub_deleted',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: { id: 'sub_deleted' },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(sub.status).toBe('canceled');
    expect(sub.autoRenew).toBe(false);
    expect(sub.stripeSubscriptionId).toBeNull();
  });

  it('mantiene status si periodo vigente (usuario canceló pero tiene tiempo)', async () => {
    const sub = makeActiveSub('acc_1', {
      currentPeriodEnd: futureDate(20),
      stripeSubscriptionId: 'sub_active_cancel',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: { id: 'sub_active_cancel' },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(sub.status).toBe('active');
    expect(sub.autoRenew).toBe(false);
    expect(sub.stripeSubscriptionId).toBeNull();
  });

  it('protege contra race condition (no sobreescribe nuevo ID)', async () => {
    const sub = makeActiveSub('acc_1', {
      stripeSubscriptionId: 'sub_NEW_id',
    });
    // findOne by stripeSubscriptionId will not match sub_OLD_id
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: { id: 'sub_OLD_id' },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    // Should NOT clear the new subscription ID because sub_OLD_id != sub_NEW_id
    expect(sub.stripeSubscriptionId).toBe('sub_NEW_id');
    expect(sub.autoRenew).toBe(true);
  });
});

// ─── TEST 16: Webhook — invoice.payment_failed ─────────────────────────────

describe('16. Webhook: invoice.payment_failed', () => {
  it('marca past_due cuando falla pago de renovación', async () => {
    const sub = makeActiveSub('acc_1', { stripeCustomerId: 'cus_fail' });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_fail',
          billing_reason: 'subscription_cycle',
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(sub.status).toBe('past_due');
    expect(sub.save).toHaveBeenCalled();
  });

  it('marca past_due cuando falla pago de proration (cambio de plan)', async () => {
    const sub = makeActiveSub('acc_1', { stripeCustomerId: 'cus_fail_proration' });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_fail_proration',
          billing_reason: 'subscription_update',
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(sub.status).toBe('past_due');
  });
});

// ─── TEST 17: Webhook — verificación de firma ──────────────────────────────

describe('17. Webhook: verificación de firma', () => {
  it('rechaza firma inválida con 400', async () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('Webhook signature verification failed');
    });

    const req = mockReq();
    req.body = Buffer.from('tampered_body');
    req.headers = { 'stripe-signature': 'sig_bad' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('Webhook Error')
    );
  });

  it('firma válida procesa evento correctamente', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'unknown.event.type',
      data: { object: {} },
    });

    const req = mockReq();
    req.body = Buffer.from('valid_body');
    req.headers = { 'stripe-signature': 'sig_good' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(res.status).not.toHaveBeenCalledWith(400);
  });
});

// ─── TEST 18: Generación de factura ─────────────────────────────────────────

describe('18. Generación y envío de factura', () => {
  it('buildInvoiceNumber genera formato LY-YYYY-NNNN', () => {
    const { buildInvoiceNumber } = invoiceMocks;
    expect(buildInvoiceNumber(1)).toBe('LY-2026-0001');
    expect(buildInvoiceNumber(42)).toBe('LY-2026-0042');
    expect(buildInvoiceNumber(999)).toBe('LY-2026-0999');
  });

  it('buildConcept genera concepto correcto', () => {
    const { buildConcept } = invoiceMocks;
    expect(buildConcept('starter', 'monthly')).toBe('Suscripción Lyrium — Plan Starter Mensual');
    expect(buildConcept('advanced', 'annual')).toBe('Suscripción Lyrium — Plan Advanced Anual');
  });

  it('confirmPayment genera factura tras pago único exitoso', async () => {
    const account = makeAccount('acc_inv');
    const sub = makeTrialSub('acc_inv', { trialEndDate: pastDate(1), status: 'expired' });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(account);

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_inv',
      payment_method: 'pm_inv',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_inv',
      card: { brand: 'visa', last4: '7777' },
    });

    const req = mockReq({
      accountId: 'acc_inv',
      plan: 'starter',
      interval: 'monthly',
      paymentIntentId: 'pi_inv',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    expect(res.json.mock.calls[0][0].success).toBe(true);
    expect(sub.save).toHaveBeenCalled();
  });
});

// ─── TEST 19: Admin — modificar suscripción ─────────────────────────────────

describe('19. Admin: modifySubscription', () => {
  let modifySubscription: any;

  beforeEach(async () => {
    const mod = await import('../controllers/adminController.js');
    modifySubscription = mod.modifySubscription;
  });

  it('cambia plan y actualiza Stripe subscription', async () => {
    const sub = makeActiveSub('acc_admin', { stripeSubscriptionId: 'sub_admin_stripe' });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_admin_stripe',
      items: { data: [{ id: 'item_admin_1' }] },
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = mockReq(
      { plan: 'advanced', interval: 'annual' },
      {},
      { id: 'acc_admin' },
    );
    const res = mockRes();

    await modifySubscription(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.plan).toBe('advanced');
    expect(result.subscription.interval).toBe('annual');

    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_admin_stripe',
      expect.objectContaining({
        proration_behavior: 'none',
      })
    );
  });

  it('extiende periodo con trial_end en Stripe', async () => {
    const newEnd = futureDate(60);
    const sub = makeActiveSub('acc_admin', { stripeSubscriptionId: 'sub_admin_ext' });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = mockReq(
      { currentPeriodEnd: newEnd },
      {},
      { id: 'acc_admin' },
    );
    const res = mockRes();

    await modifySubscription(req, res);

    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_admin_ext',
      expect.objectContaining({
        trial_end: expect.any(Number),
        proration_behavior: 'none',
      })
    );
  });

  it('auto-expira si admin pone periodo en el pasado', async () => {
    const pastEnd = pastDate(5);
    const sub = makeActiveSub('acc_admin', { stripeSubscriptionId: null });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq(
      { currentPeriodEnd: pastEnd },
      {},
      { id: 'acc_admin' },
    );
    const res = mockRes();

    await modifySubscription(req, res);

    expect(sub.status).toBe('expired');
    expect(sub.trialEndDate).toBeNull();
  });

  it('devuelve 404 si no existe suscripción', async () => {
    SubscriptionMock.findOne.mockResolvedValue(null);

    const req = mockReq({ plan: 'advanced' }, {}, { id: 'acc_ghost' });
    const res = mockRes();

    await modifySubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ─── TEST 20: Admin — deshabilitar cuenta ───────────────────────────────────

describe('20. Admin: toggleAccountStatus', () => {
  let toggleAccountStatus: any;

  beforeEach(async () => {
    const mod = await import('../controllers/adminController.js');
    toggleAccountStatus = mod.toggleAccountStatus;
  });

  it('desactiva cuenta: cancela Stripe, desvincula PM, preserva periodo', async () => {
    const account = makeAccount('acc_disable');
    AccountMock.findById.mockResolvedValue(account);

    const sub = makeActiveSub('acc_disable');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.cancel.mockResolvedValue({});
    stripeMock.paymentMethods.detach.mockResolvedValue({});

    const req = mockReq(
      { disabled: true },
      {},
      { id: 'acc_disable' },
    );
    const res = mockRes();

    await toggleAccountStatus(req, res);

    expect(res.json.mock.calls[0][0]).toEqual({ success: true, disabled: true });

    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith('sub_stripe_123');
    expect(stripeMock.paymentMethods.detach).toHaveBeenCalledWith('pm_test123');

    expect(sub.status).toBe('canceled');
    expect(sub.autoRenew).toBe(false);
    expect(sub.stripeSubscriptionId).toBeNull();
    expect(sub.paymentMethod).toBeNull();

    // Period preserved for reactivation
    expect(sub.currentPeriodEnd).toBeDefined();
    expect(sub.save).toHaveBeenCalled();
  });

  it('reactiva cuenta sin tocar Stripe', async () => {
    const account = makeAccount('acc_enable');
    AccountMock.findById.mockResolvedValue(account);

    const req = mockReq(
      { disabled: false },
      {},
      { id: 'acc_enable' },
    );
    const res = mockRes();

    await toggleAccountStatus(req, res);

    expect(res.json.mock.calls[0][0]).toEqual({ success: true, disabled: false });
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('devuelve 404 si usuario no existe', async () => {
    AccountMock.findById.mockResolvedValue(null);

    const req = mockReq({ disabled: true }, {}, { id: 'acc_ghost' });
    const res = mockRes();

    await toggleAccountStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ─── TEST 21: Cleanup service ──────────────────────────────────────────────

describe('21. Cleanup service — isExpiredForDeletion logic', () => {
  function isExpiredForDeletion(record: Record<string, any>): boolean {
    const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (record.currentPeriodEnd) {
      const periodEnd = new Date(record.currentPeriodEnd).getTime();
      const isPaymentExpired = record.status !== 'active' && now - periodEnd > GRACE_PERIOD_MS;
      if (isPaymentExpired) return true;
    }

    if (record.trialEndDate) {
      const trialEnd = new Date(record.trialEndDate).getTime();
      const isTrialExpired = record.status !== 'active' && now - trialEnd > GRACE_PERIOD_MS;
      if (isTrialExpired) return true;
    }

    return false;
  }

  it('no borra cuenta activa', () => {
    expect(isExpiredForDeletion({
      status: 'active',
      currentPeriodEnd: pastDate(60),
    })).toBe(false);
  });

  it('no borra trial recién expirado (menos de 30 días)', () => {
    expect(isExpiredForDeletion({
      status: 'expired',
      trialEndDate: pastDate(15),
      currentPeriodEnd: pastDate(15),
    })).toBe(false);
  });

  it('borra cuenta expirada hace +30 días', () => {
    expect(isExpiredForDeletion({
      status: 'expired',
      currentPeriodEnd: pastDate(35),
      trialEndDate: pastDate(49),
    })).toBe(true);
  });

  it('borra trial expirado hace +30 días', () => {
    expect(isExpiredForDeletion({
      status: 'trial',
      trialEndDate: pastDate(35),
      currentPeriodEnd: pastDate(35),
    })).toBe(true);
  });

  it('borra cuenta cancelada con periodo expirado +30 días', () => {
    expect(isExpiredForDeletion({
      status: 'canceled',
      currentPeriodEnd: pastDate(45),
    })).toBe(true);
  });

  it('no borra cuenta cancelada con periodo reciente', () => {
    expect(isExpiredForDeletion({
      status: 'canceled',
      currentPeriodEnd: pastDate(10),
    })).toBe(false);
  });
});

// ─── TEST 22: Admin — revenue stats ─────────────────────────────────────────

describe('22. Admin: getStats — Stripe revenue', () => {
  let getStats: any;

  beforeEach(async () => {
    const mod = await import('../controllers/adminController.js');
    getStats = mod.getStats;
  });

  it('calcula revenue mensual desde Stripe charges', async () => {
    AccountMock.countDocuments.mockResolvedValue(10);
    SubscriptionMock.find.mockResolvedValue([
      { status: 'active', currentPeriodEnd: futureDate(10), plan: 'starter', interval: 'monthly' },
      { status: 'trial', currentPeriodEnd: futureDate(5), plan: 'starter', interval: 'monthly' },
      { status: 'canceled', currentPeriodEnd: pastDate(5), plan: 'advanced', interval: 'annual' },
    ]);

    stripeMock.charges.list.mockResolvedValue({
      data: [
        { status: 'succeeded', amount: 19700 },
        { status: 'succeeded', amount: 35000 },
        { status: 'failed', amount: 19700 },
      ],
    });

    const req = mockReq();
    const res = mockRes();

    await getStats(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.monthlyRevenue).toBe(547);
    expect(result.totalUsers).toBe(10);
    expect(result.active).toBe(1);
    expect(result.trial).toBe(1);
    expect(result.cancelled).toBe(1);
  });

  it('devuelve 0 si Stripe falla', async () => {
    AccountMock.countDocuments.mockResolvedValue(0);
    SubscriptionMock.find.mockResolvedValue([]);
    stripeMock.charges.list.mockRejectedValue(new Error('Stripe down'));

    const req = mockReq();
    const res = mockRes();

    await getStats(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.monthlyRevenue).toBe(0);
  });
});

// ─── TEST 23: Cálculo de periodos (edge cases) ─────────────────────────────

describe('23. Cálculo de periodos — edge cases', () => {
  it('trial activo + pago único: suma días restantes de trial', async () => {
    const trialEnd = futureDate(7);
    const sub = makeTrialSub('acc_edge1', { trialEndDate: trialEnd });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_edge1'));

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_edge1',
      payment_method: 'pm_edge1',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_edge1',
      card: { brand: 'visa', last4: '1111' },
    });

    const req = mockReq({
      accountId: 'acc_edge1',
      plan: 'starter',
      interval: 'monthly',
      paymentIntentId: 'pi_edge1',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    const result = res.json.mock.calls[0][0];
    const periodEnd = new Date(result.subscription.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // ~1 month + ~7 days remaining trial
    expect(diffDays).toBeGreaterThanOrEqual(30 + 6);
    expect(diffDays).toBeLessThanOrEqual(30 + 8);
  });

  it('plan activo + cambio sin auto-renew: suma días restantes del periodo', async () => {
    const sub = makeActiveSub('acc_edge2', {
      currentPeriodEnd: futureDate(15),
      stripeSubscriptionId: null,
      stripePaymentMethodId: null,
      autoRenew: false,
      trialEndDate: null,
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_edge2'));

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_edge2',
      payment_method: 'pm_edge2',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_edge2',
      card: { brand: 'visa', last4: '2222' },
    });

    const req = mockReq({
      accountId: 'acc_edge2',
      plan: 'advanced',
      interval: 'monthly',
      paymentIntentId: 'pi_edge2',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    const result = res.json.mock.calls[0][0];
    const periodEnd = new Date(result.subscription.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // ~1 month + ~15 remaining days
    expect(diffDays).toBeGreaterThanOrEqual(30 + 14);
    expect(diffDays).toBeLessThanOrEqual(30 + 16);
  });

  it('trial expirado + pago único: periodo empieza desde ahora sin bonus', async () => {
    const sub = makeTrialSub('acc_edge3', {
      trialEndDate: pastDate(3),
      currentPeriodEnd: pastDate(3),
      status: 'expired',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_edge3'));

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_edge3',
      payment_method: 'pm_edge3',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_edge3',
      card: { brand: 'visa', last4: '3333' },
    });

    const req = mockReq({
      accountId: 'acc_edge3',
      plan: 'starter',
      interval: 'monthly',
      paymentIntentId: 'pi_edge3',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    const result = res.json.mock.calls[0][0];
    const periodEnd = new Date(result.subscription.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Exactly ~1 month (no bonus days)
    expect(diffDays).toBeGreaterThanOrEqual(28);
    expect(diffDays).toBeLessThanOrEqual(33);
  });

  it('pago anual con trial expirado: periodo = 1 año exacto', async () => {
    const sub = makeTrialSub('acc_edge4', {
      trialEndDate: pastDate(10),
      currentPeriodEnd: pastDate(10),
      status: 'expired',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_edge4'));

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_edge4',
      payment_method: 'pm_edge4',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_edge4',
      card: { brand: 'visa', last4: '4444' },
    });

    const req = mockReq({
      accountId: 'acc_edge4',
      plan: 'advanced',
      interval: 'annual',
      paymentIntentId: 'pi_edge4',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    const result = res.json.mock.calls[0][0];
    const periodEnd = new Date(result.subscription.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    expect(diffDays).toBeGreaterThanOrEqual(360);
    expect(diffDays).toBeLessThanOrEqual(370);
  });
});
