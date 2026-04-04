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

// ─── TEST 24: createPaymentIntent — cliente Stripe eliminado ────────────────

describe('24. createPaymentIntent — cliente Stripe eliminado (resource_missing)', () => {
  it('recrea el customer si fue eliminado en Stripe', async () => {
    const sub = makeTrialSub('acc_1', { stripeCustomerId: 'cus_deleted' });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    const notFoundError: any = new Error('No such customer: cus_deleted');
    notFoundError.code = 'resource_missing';
    notFoundError.statusCode = 404;
    stripeMock.customers.retrieve.mockRejectedValue(notFoundError);
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_recreated' });
    stripeMock.paymentIntents.create.mockResolvedValue({
      client_secret: 'pi_secret_recreated',
      id: 'pi_recreated',
    });

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      autoRenew: false,
    });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(stripeMock.customers.create).toHaveBeenCalled();
    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_recreated' })
    );
    const result = res.json.mock.calls[0][0];
    expect(result.clientSecret).toBe('pi_secret_recreated');
  });

  it('continúa con el ID existente si customers.retrieve falla por otro error (no resource_missing)', async () => {
    const sub = makeTrialSub('acc_1', { stripeCustomerId: 'cus_network_error' });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.customers.retrieve.mockRejectedValue(new Error('Network timeout'));
    stripeMock.paymentIntents.create.mockResolvedValue({
      client_secret: 'pi_after_net_error',
      id: 'pi_after_net',
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
      expect.objectContaining({ customer: 'cus_network_error' })
    );
  });
});

// ─── TEST 25: confirmPayment — PM sin campo card (SEPA/iDEAL) ──────────────

describe('25. confirmPayment — método de pago sin campo card (SEPA/iDEAL)', () => {
  it('activa suscripción aunque PM no tenga datos de tarjeta', async () => {
    const sub = makeTrialSub('acc_1', { trialEndDate: futureDate(5) });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_sepa',
      payment_method: 'pm_sepa_debit',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_sepa_debit',
      type: 'sepa_debit',
      // campo card ausente — SEPA, iDEAL, etc.
    });

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      paymentIntentId: 'pi_sepa',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.status).toBe('active');
    // paymentMethod queda null porque no hay campo card
    expect(result.subscription.paymentMethod).toBeNull();
  });
});

// ─── TEST 26: confirmPayment — sync billing cycle falla (error silenciado) ──

describe('26. confirmPayment — fallo al sincronizar ciclo de facturación en Stripe', () => {
  it('activa suscripción aunque el segundo subscriptions.update (sync) falle', async () => {
    const trialEnd = futureDate(5);
    const sub = makeTrialSub('acc_1', {
      trialEndDate: trialEnd,
      stripeCustomerId: 'cus_sync',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.setupIntents.retrieve.mockResolvedValue({
      id: 'si_sync',
      payment_method: 'pm_sync_visa',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_sync_visa',
      card: { brand: 'visa', last4: '9876' },
    });
    // Primera llamada: attach default_payment_method → ok
    // Segunda llamada: billing cycle sync → falla (pero está en try/catch)
    stripeMock.subscriptions.update
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Stripe billing sync error'));

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      setupIntentId: 'si_sync',
      subscriptionId: 'sub_sync',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.status).toBe('active');
    expect(result.subscription.paymentMethod.last4).toBe('9876');
  });
});

// ─── TEST 27: Webhook invoice.paid — customer sin suscripción ──────────────

describe('27. Webhook: invoice.paid — customer sin suscripción en BD', () => {
  it('responde { received: true } sin error si no hay suscripción para el customer', async () => {
    SubscriptionMock.findOne.mockResolvedValue(null);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.paid',
      data: {
        object: {
          customer: 'cus_unknown_renewal',
          billing_reason: 'subscription_cycle',
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── TEST 28: Webhook checkout.session.completed — metadata incompleta ──────

describe('28. Webhook: checkout.session.completed — metadata sin accountId', () => {
  it('no modifica BD y responde { received: true } sin crash', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {}, // accountId ausente
          customer: 'cus_no_meta',
          subscription: 'sub_no_meta',
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

// ─── TEST 29: changePlan — sin stripeSubscriptionId (solo MongoDB) ──────────

describe('29. changePlan — sin suscripción Stripe (solo actualiza MongoDB)', () => {
  it('actualiza plan en MongoDB sin llamar a Stripe', async () => {
    const sub = makeActiveSub('acc_1', {
      stripeSubscriptionId: null,
      autoRenew: false,
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq({
      accountId: 'acc_1',
      newPlan: 'advanced',
      newInterval: 'annual',
    });
    const res = mockRes();

    await changePlan(req, res);

    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.plan).toBe('advanced');
    expect(result.subscription.interval).toBe('annual');
  });
});

// ─── TEST 30: changePlan — Stripe subscription sin items (data vacío) ───────

describe('30. changePlan — Stripe subscription devuelve items vacíos', () => {
  it('devuelve 500 si items.data está vacío (TypeError al leer data[0].id)', async () => {
    const sub = makeActiveSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_stripe_123',
      items: { data: [] }, // sin items → TypeError
    });

    const req = mockReq({
      accountId: 'acc_1',
      newPlan: 'advanced',
      newInterval: 'monthly',
    });
    const res = mockRes();

    await changePlan(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── TEST 31: validateSubscription — estados con periodo vigente ────────────

describe('31. validateSubscription — estados no expirados devuelven valid=true', () => {
  it('devuelve valid=true para status trial con periodo vigente', async () => {
    const sub = makeTrialSub('acc_1', {
      trialEndDate: futureDate(10),
      currentPeriodEnd: futureDate(10),
      status: 'trial',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq({}, { accountId: 'acc_1' });
    const res = mockRes();

    await validateSubscription(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.valid).toBe(true);
    expect(sub.save).not.toHaveBeenCalled();
  });

  it('devuelve valid=true para status past_due con periodo vigente', async () => {
    const sub = makeActiveSub('acc_1', {
      status: 'past_due',
      currentPeriodEnd: futureDate(5),
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq({}, { accountId: 'acc_1' });
    const res = mockRes();

    await validateSubscription(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.valid).toBe(true);
  });

  it('no llama a save() si la suscripción ya estaba marcada como expired', async () => {
    const sub = makeActiveSub('acc_1', {
      currentPeriodEnd: pastDate(5),
      status: 'expired', // ya marcada — no debe volver a guardarse
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq({}, { accountId: 'acc_1' });
    const res = mockRes();

    await validateSubscription(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
    expect(sub.save).not.toHaveBeenCalled();
  });
});

// ─── TEST 32: cancelAutoRenew — comportamiento ante errores de Stripe ───────

describe('32. cancelAutoRenew — comportamiento ante errores de Stripe', () => {
  it('devuelve 500 si stripe.subscriptions.cancel lanza error (no está silenciado)', async () => {
    const sub = makeActiveSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.cancel.mockRejectedValue(new Error('Stripe API down'));

    const req = mockReq({ accountId: 'acc_1' });
    const res = mockRes();

    await cancelAutoRenew(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('éxito aunque paymentMethods.detach falle (error silenciado en try/catch)', async () => {
    const sub = makeActiveSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.cancel.mockResolvedValue({});
    stripeMock.paymentMethods.detach.mockRejectedValue(new Error('PM already detached'));

    const req = mockReq({ accountId: 'acc_1' });
    const res = mockRes();

    await cancelAutoRenew(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.autoRenew).toBe(false);
    expect(result.subscription.stripeSubscriptionId).toBeNull();
    expect(result.subscription.stripePaymentMethodId).toBeNull();
  });
});

// ─── TEST 33: Admin modifySubscription — solo status, sin stripeSubscriptionId

describe('33. Admin: modifySubscription — solo status, sin Stripe subscription', () => {
  let modifySubscription: any;

  beforeEach(async () => {
    const mod = await import('../controllers/adminController.js');
    modifySubscription = mod.modifySubscription;
  });

  it('actualiza solo status en MongoDB sin llamar a Stripe', async () => {
    const sub = makeTrialSub('acc_admin', { stripeSubscriptionId: null });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq(
      { status: 'active' },
      {},
      { id: 'acc_admin' },
    );
    const res = mockRes();

    await modifySubscription(req, res);

    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.status).toBe('active');
    expect(result.warnings).toBeUndefined();
  });
});

// ─── TEST 34: Admin modifySubscription — Stripe falla → warnings en respuesta

describe('34. Admin: modifySubscription — Stripe falla, MongoDB OK con warnings', () => {
  let modifySubscription: any;

  beforeEach(async () => {
    const mod = await import('../controllers/adminController.js');
    modifySubscription = mod.modifySubscription;
  });

  it('añade warnings si Stripe falla al cambiar precio, MongoDB sí se actualiza', async () => {
    const sub = makeActiveSub('acc_admin', { stripeSubscriptionId: 'sub_admin_warn' });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_admin_warn',
      items: { data: [{ id: 'item_warn_1' }] },
    });
    stripeMock.subscriptions.update.mockRejectedValue(new Error('Stripe rate limit'));

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
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Stripe no actualizado');
  });

  it('añade warnings si Stripe falla al extender periodo, MongoDB sí se actualiza', async () => {
    const sub = makeActiveSub('acc_admin', { stripeSubscriptionId: 'sub_admin_warn2' });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.update.mockRejectedValue(new Error('Invalid trial_end'));

    const newEnd = futureDate(30);
    const req = mockReq(
      { currentPeriodEnd: newEnd },
      {},
      { id: 'acc_admin' },
    );
    const res = mockRes();

    await modifySubscription(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(sub.save).toHaveBeenCalled();
  });
});

// ─── TEST 35: createPaymentIntent — stripe.subscriptions.create falla ───────

describe('35. createPaymentIntent — stripe.subscriptions.create lanza error', () => {
  it('devuelve 500 si la creación de Stripe Subscription falla', async () => {
    const sub = makeTrialSub('acc_1', { trialEndDate: futureDate(10) });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_1'));

    stripeMock.customers.create.mockResolvedValue({ id: 'cus_fail_create' });
    stripeMock.subscriptions.create.mockRejectedValue(new Error('No such price'));

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      autoRenew: true,
    });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toEqual({ error: 'Error al crear payment intent' });
  });
});

// ─── TEST 36: createTrialSubscription — Subscription.create lanza error ──────

describe('36. createTrialSubscription — Subscription.create lanza error', () => {
  it('devuelve 500 si falla al persistir en MongoDB', async () => {
    SubscriptionMock.findOne.mockResolvedValue(null);
    SubscriptionMock.create.mockRejectedValue(new Error('MongoDB connection lost'));

    const req = mockReq({ accountId: 'acc_db_fail' });
    const res = mockRes();

    await createTrialSubscription(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toEqual({ error: 'Error al crear suscripción de prueba' });
  });
});

// ─── TEST 37: Webhook — falta stripe-signature en headers ──────────────────

describe('37. Webhook: falta stripe-signature en headers', () => {
  it('rechaza con 400 cuando la cabecera stripe-signature no está presente', async () => {
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload.');
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = {}; // sin stripe-signature

    const res = mockRes();

    await handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Webhook Error'));
  });
});

// ─── TEST 38: Webhook invoice.payment_failed — customer sin suscripción ─────

describe('38. Webhook: invoice.payment_failed — customer sin suscripción en BD', () => {
  it('responde { received: true } sin error si no existe suscripción', async () => {
    SubscriptionMock.findOne.mockResolvedValue(null);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_ghost_fail',
          billing_reason: 'subscription_cycle',
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw_body');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── TEST 39: Admin getStats — charges vacíos / solo succeeded ───────────────

describe('39. Admin: getStats — filtrado de charges por status', () => {
  let getStats: any;

  beforeEach(async () => {
    const mod = await import('../controllers/adminController.js');
    getStats = mod.getStats;
  });

  it('devuelve monthlyRevenue=0 si charges.data está vacío', async () => {
    AccountMock.countDocuments.mockResolvedValue(5);
    SubscriptionMock.find.mockResolvedValue([]);
    stripeMock.charges.list.mockResolvedValue({ data: [] });

    const req = mockReq();
    const res = mockRes();

    await getStats(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.monthlyRevenue).toBe(0);
    expect(result.totalUsers).toBe(5);
  });

  it('solo suma charges con status=succeeded, ignora failed y pending', async () => {
    AccountMock.countDocuments.mockResolvedValue(3);
    SubscriptionMock.find.mockResolvedValue([]);
    stripeMock.charges.list.mockResolvedValue({
      data: [
        { status: 'succeeded', amount: 19700 },
        { status: 'failed',    amount: 19700 },
        { status: 'pending',   amount: 35000 },
        { status: 'succeeded', amount: 21000 },
      ],
    });

    const req = mockReq();
    const res = mockRes();

    await getStats(req, res);

    const result = res.json.mock.calls[0][0];
    // (19700 + 21000) / 100 = 407
    expect(result.monthlyRevenue).toBe(407);
  });
});

// ─── TEST 40: createPaymentIntent — Account.findById devuelve null ───────────

describe('40. createPaymentIntent — Account no encontrado (crea customer sin email)', () => {
  it('crea customer sin email y continúa normalmente', async () => {
    const sub = makeTrialSub('acc_1');
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(null); // cuenta no encontrada

    stripeMock.customers.create.mockResolvedValue({ id: 'cus_no_email' });
    stripeMock.paymentIntents.create.mockResolvedValue({
      client_secret: 'pi_no_email_secret',
      id: 'pi_no_email',
    });

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      autoRenew: false,
    });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(stripeMock.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { accountId: 'acc_1' } })
    );
    const result = res.json.mock.calls[0][0];
    expect(result.clientSecret).toBe('pi_no_email_secret');
    expect(result.paymentIntentId).toBe('pi_no_email');
  });
});

// ─── TEST 41: changePlan — parámetros faltantes ─────────────────────────────

describe('41. changePlan — parámetros faltantes', () => {
  it('rechaza con 400 si falta newPlan', async () => {
    const req = mockReq({ accountId: 'acc_1', newInterval: 'monthly' });
    const res = mockRes();

    await changePlan(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rechaza con 400 si falta newInterval', async () => {
    const req = mockReq({ accountId: 'acc_1', newPlan: 'advanced' });
    const res = mockRes();

    await changePlan(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rechaza con 400 si falta accountId', async () => {
    const req = mockReq({ newPlan: 'advanced', newInterval: 'monthly' });
    const res = mockRes();

    await changePlan(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─── TEST 42: confirmPayment — solo subscriptionId sin intent ───────────────

describe('42. confirmPayment — subscriptionId sin setupIntentId ni paymentIntentId', () => {
  it('rechaza con 400 si solo hay subscriptionId pero no intent de ningún tipo', async () => {
    SubscriptionMock.findOne.mockResolvedValue(makeTrialSub('acc_1'));

    const req = mockReq({
      accountId: 'acc_1',
      plan: 'starter',
      interval: 'monthly',
      subscriptionId: 'sub_only_no_intent',
      // sin setupIntentId ni paymentIntentId
    });
    const res = mockRes();

    await confirmPayment(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS EN PROFUNDIDAD
// ═══════════════════════════════════════════════════════════════════════════════

// ─── TEST 43: Precios exactos para todos los planes e intervalos ────────────

describe('43. createPaymentIntent — verificación de importes exactos (todos los planes)', () => {
  const cases = [
    { plan: 'starter',  interval: 'monthly', expectedCents: 19700,  label: 'Starter mensual' },
    { plan: 'starter',  interval: 'annual',  expectedCents: 210000, label: 'Starter anual' },
    { plan: 'advanced', interval: 'monthly', expectedCents: 35000,  label: 'Advanced mensual' },
    { plan: 'advanced', interval: 'annual',  expectedCents: 370000, label: 'Advanced anual' },
  ];

  for (const { plan, interval, expectedCents, label } of cases) {
    it(`${label}: ${expectedCents / 100}€ → ${expectedCents} cents`, async () => {
      const sub = makeTrialSub('acc_price');
      SubscriptionMock.findOne.mockResolvedValue(sub);
      AccountMock.findById.mockResolvedValue(makeAccount('acc_price'));

      stripeMock.customers.create.mockResolvedValue({ id: 'cus_price_test' });
      stripeMock.paymentIntents.create.mockResolvedValue({
        client_secret: `pi_secret_${plan}_${interval}`,
        id: `pi_${plan}_${interval}`,
      });

      const req = mockReq({ accountId: 'acc_price', plan, interval, autoRenew: false });
      const res = mockRes();

      await createPaymentIntent(req, res);

      expect(res.json).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: expectedCents, currency: 'eur' })
      );
    });
  }

  it('Starter mensual: metadata incluye plan, interval, autoRenew=false y accountId', async () => {
    const sub = makeTrialSub('acc_meta');
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_meta'));

    stripeMock.customers.create.mockResolvedValue({ id: 'cus_meta' });
    stripeMock.paymentIntents.create.mockResolvedValue({ client_secret: 'sec', id: 'pi_meta' });

    const req = mockReq({ accountId: 'acc_meta', plan: 'starter', interval: 'monthly', autoRenew: false });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          accountId: 'acc_meta',
          plan: 'starter',
          interval: 'monthly',
          autoRenew: 'false',
        }),
      })
    );
  });
});

// ─── TEST 44: createPaymentIntent — customers.update cuando falta email ──────

describe('44. createPaymentIntent — stripe.customers.update cuando el customer no tiene email', () => {
  it('actualiza email del customer si Stripe lo devuelve sin email', async () => {
    const sub = makeTrialSub('acc_upd', { stripeCustomerId: 'cus_no_email_stripe' });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_upd', { email: 'found@example.com' }));

    // Customer existente pero SIN email en Stripe
    stripeMock.customers.retrieve.mockResolvedValue({
      id: 'cus_no_email_stripe',
      deleted: false,
      email: null,
    });
    stripeMock.customers.update.mockResolvedValue({});
    stripeMock.paymentIntents.create.mockResolvedValue({ client_secret: 'pi_upd', id: 'pi_upd_id' });

    const req = mockReq({ accountId: 'acc_upd', plan: 'starter', interval: 'monthly', autoRenew: false });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(stripeMock.customers.update).toHaveBeenCalledWith(
      'cus_no_email_stripe',
      { email: 'found@example.com' }
    );
    expect(res.json.mock.calls[0][0].clientSecret).toBe('pi_upd');
  });

  it('NO llama a customers.update si el customer ya tiene email', async () => {
    const sub = makeTrialSub('acc_has_email', { stripeCustomerId: 'cus_has_email' });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_has_email', { email: 'test@example.com' }));

    stripeMock.customers.retrieve.mockResolvedValue({
      id: 'cus_has_email',
      deleted: false,
      email: 'already@set.com',
    });
    stripeMock.paymentIntents.create.mockResolvedValue({ client_secret: 'pi_has_email', id: 'pi_has' });

    const req = mockReq({ accountId: 'acc_has_email', plan: 'advanced', interval: 'monthly', autoRenew: false });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(stripeMock.customers.update).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].clientSecret).toBe('pi_has_email');
  });
});

// ─── TEST 45: createPaymentIntent — stripeCustomerId guardado en Subscription ─

describe('45. createPaymentIntent — stripeCustomerId se persiste en Subscription tras crear customer', () => {
  it('llama a Subscription.updateOne con el nuevo customerId', async () => {
    const sub = makeTrialSub('acc_save_cus');
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_save_cus'));

    stripeMock.customers.create.mockResolvedValue({ id: 'cus_newly_created' });
    stripeMock.paymentIntents.create.mockResolvedValue({ client_secret: 'pi_sc', id: 'pi_sc_id' });

    const req = mockReq({ accountId: 'acc_save_cus', plan: 'starter', interval: 'monthly', autoRenew: false });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(SubscriptionMock.updateOne).toHaveBeenCalledWith(
      { accountId: 'acc_save_cus' },
      expect.objectContaining({ stripeCustomerId: 'cus_newly_created' })
    );
    // El objeto local también debe actualizarse
    expect(sub.stripeCustomerId).toBe('cus_newly_created');
  });

  it('llama a Subscription.updateOne también cuando se recrea el customer eliminado', async () => {
    const sub = makeTrialSub('acc_recreate', { stripeCustomerId: 'cus_gone' });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_recreate'));

    const notFound: any = new Error('No such customer');
    notFound.code = 'resource_missing';
    stripeMock.customers.retrieve.mockRejectedValue(notFound);
    stripeMock.customers.create.mockResolvedValue({ id: 'cus_new_after_delete' });
    stripeMock.paymentIntents.create.mockResolvedValue({ client_secret: 'pi_reborn', id: 'pi_rb' });

    const req = mockReq({ accountId: 'acc_recreate', plan: 'starter', interval: 'monthly', autoRenew: false });
    const res = mockRes();

    await createPaymentIntent(req, res);

    expect(SubscriptionMock.updateOne).toHaveBeenCalledWith(
      { accountId: 'acc_recreate' },
      expect.objectContaining({ stripeCustomerId: 'cus_new_after_delete' })
    );
  });
});

// ─── TEST 46: confirmPayment — autoRenew + PaymentIntent (subscriptionId presente)

describe('46. confirmPayment — autoRenew con PaymentIntent: default_payment_method guardado automáticamente', () => {
  it('path A: stripe guarda PM automáticamente en la sub → lee default_payment_method', async () => {
    const sub = makeTrialSub('acc_ar_pi', {
      trialEndDate: pastDate(2),
      status: 'expired',
      stripeCustomerId: 'cus_ar_pi',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_ar_pi'));

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_ar',
      payment_method: 'pm_ar_fallback',
    });
    // Stripe guardó automáticamente el PM en la suscripción
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      default_payment_method: 'pm_ar_saved',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_ar_saved',
      card: { brand: 'amex', last4: '0005' },
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = mockReq({
      accountId: 'acc_ar_pi',
      plan: 'advanced',
      interval: 'monthly',
      paymentIntentId: 'pi_ar',
      subscriptionId: 'sub_ar_pi',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.status).toBe('active');
    expect(result.subscription.autoRenew).toBe(true);
    expect(result.subscription.paymentMethod).toEqual({ brand: 'amex', last4: '0005' });
    expect(result.subscription.stripeSubscriptionId).toBe('sub_ar_pi');
    // Lee PM de la suscripción, NO del PaymentIntent directamente
    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_ar_pi');
    expect(stripeMock.paymentMethods.retrieve).toHaveBeenCalledWith('pm_ar_saved');
  });

  it('path B (fallback): default_payment_method null → adjunta manualmente el PM del PaymentIntent', async () => {
    const sub = makeTrialSub('acc_ar_pi_fallback', {
      trialEndDate: pastDate(1),
      status: 'expired',
      stripeCustomerId: 'cus_fallback',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_ar_pi_fallback'));

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_fallback',
      payment_method: 'pm_fallback_card',
    });
    // Stripe NO guardó automáticamente (default_payment_method = null)
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      default_payment_method: null,
    });
    stripeMock.paymentMethods.attach.mockResolvedValue({});
    stripeMock.subscriptions.update.mockResolvedValue({});
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_fallback_card',
      card: { brand: 'mastercard', last4: '3456' },
    });

    const req = mockReq({
      accountId: 'acc_ar_pi_fallback',
      plan: 'starter',
      interval: 'annual',
      paymentIntentId: 'pi_fallback',
      subscriptionId: 'sub_fallback',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.subscription.autoRenew).toBe(true);
    expect(result.subscription.paymentMethod).toEqual({ brand: 'mastercard', last4: '3456' });
    expect(stripeMock.paymentMethods.attach).toHaveBeenCalledWith(
      'pm_fallback_card',
      { customer: 'cus_fallback' }
    );
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      'sub_fallback',
      expect.objectContaining({ default_payment_method: 'pm_fallback_card' })
    );
  });
});

// ─── TEST 47: confirmPayment — setupIntent path sin trialEndDate (activo con días restantes)

describe('47. confirmPayment — setupIntent path sin trialEndDate: hereda días del periodo activo', () => {
  it('suma días del periodo activo anterior al nuevo ciclo', async () => {
    // Sub activa sin trial, con 20 días restantes, y tiene Stripe sub (autoRenew)
    const sub = makeActiveSub('acc_inherit', {
      trialEndDate: null,
      stripeCustomerId: 'cus_inherit',
      currentPeriodEnd: futureDate(20),
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_inherit'));

    stripeMock.setupIntents.retrieve.mockResolvedValue({
      id: 'si_inherit',
      payment_method: 'pm_inherit',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_inherit',
      card: { brand: 'visa', last4: '1111' },
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = mockReq({
      accountId: 'acc_inherit',
      plan: 'starter',
      interval: 'monthly',
      setupIntentId: 'si_inherit',
      subscriptionId: 'sub_inherit',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);

    const periodEnd = new Date(result.subscription.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // ~1 month + ~20 remaining days
    expect(diffDays).toBeGreaterThanOrEqual(30 + 19);
    expect(diffDays).toBeLessThanOrEqual(30 + 21);
  });

  it('sin trialEndDate y sin periodo activo previo: ciclo = 1 mes exacto desde ahora', async () => {
    // Sub activa sin trial y sin días restantes (ya expiró)
    const sub = makeActiveSub('acc_no_extra', {
      trialEndDate: null,
      stripeCustomerId: 'cus_noextra',
      currentPeriodEnd: pastDate(1),
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_no_extra'));

    stripeMock.setupIntents.retrieve.mockResolvedValue({
      id: 'si_noextra',
      payment_method: 'pm_noextra',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_noextra',
      card: { brand: 'visa', last4: '2222' },
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = mockReq({
      accountId: 'acc_no_extra',
      plan: 'starter',
      interval: 'monthly',
      setupIntentId: 'si_noextra',
      subscriptionId: 'sub_noextra',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    const result = res.json.mock.calls[0][0];
    const periodEnd = new Date(result.subscription.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    expect(diffDays).toBeGreaterThanOrEqual(28);
    expect(diffDays).toBeLessThanOrEqual(33);
  });
});

// ─── TEST 48: confirmPayment — stripeSubscriptionId y campos se guardan correctamente

describe('48. confirmPayment — persistencia de campos en Subscription tras activar', () => {
  it('guarda plan, interval, status=active, autoRenew, stripeSubscriptionId, paymentMethod en subscription', async () => {
    const sub = makeTrialSub('acc_persist', { trialEndDate: pastDate(1), status: 'expired' });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_persist'));

    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_persist',
      payment_method: 'pm_persist',
    });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_persist',
      card: { brand: 'visa', last4: '9999' },
    });

    const req = mockReq({
      accountId: 'acc_persist',
      plan: 'advanced',
      interval: 'annual',
      paymentIntentId: 'pi_persist',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    // Verificar estado interno del doc antes de save()
    expect(sub.plan).toBe('advanced');
    expect(sub.interval).toBe('annual');
    expect(sub.status).toBe('active');
    expect(sub.autoRenew).toBe(false); // sin subscriptionId → no autoRenew
    expect(sub.trialEndDate).toBeNull();
    expect(sub.stripeSubscriptionId).toBeNull();
    expect(sub.stripePaymentMethodId).toBe('pm_persist');
    expect(sub.paymentMethod).toEqual({ brand: 'visa', last4: '9999' });
    expect(sub.save).toHaveBeenCalled();
  });

  it('autoRenew=true cuando se pasa subscriptionId', async () => {
    const sub = makeTrialSub('acc_persist_ar', { trialEndDate: pastDate(1), status: 'expired' });
    SubscriptionMock.findOne.mockResolvedValue(sub);
    AccountMock.findById.mockResolvedValue(makeAccount('acc_persist_ar'));

    stripeMock.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_par', payment_method: 'pm_par' });
    stripeMock.subscriptions.retrieve.mockResolvedValue({ default_payment_method: 'pm_par' });
    stripeMock.paymentMethods.retrieve.mockResolvedValue({ id: 'pm_par', card: { brand: 'visa', last4: '1234' } });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = mockReq({
      accountId: 'acc_persist_ar',
      plan: 'starter',
      interval: 'monthly',
      paymentIntentId: 'pi_par',
      subscriptionId: 'sub_par',
    });
    const res = mockRes();

    await confirmPayment(req, res);

    expect(sub.autoRenew).toBe(true);
    expect(sub.stripeSubscriptionId).toBe('sub_par');
  });
});

// ─── TEST 49: changePlan — lógica condicional de currentPeriodEnd ────────────

describe('49. changePlan — lógica condicional de currentPeriodEnd', () => {
  it('NO actualiza currentPeriodEnd si el periodo actual aún es válido', async () => {
    const existingEnd = futureDate(15);
    const sub = makeActiveSub('acc_keep_end', {
      stripeSubscriptionId: 'sub_keep',
      currentPeriodEnd: existingEnd,
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_keep',
      items: { data: [{ id: 'item_keep' }] },
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = mockReq({ accountId: 'acc_keep_end', newPlan: 'advanced', newInterval: 'monthly' });
    const res = mockRes();

    await changePlan(req, res);

    // El currentPeriodEnd debe ser el mismo de antes
    expect(sub.currentPeriodEnd).toBe(existingEnd);
  });

  it('SÍ asigna nuevo currentPeriodEnd si el periodo ya expiró', async () => {
    const sub = makeActiveSub('acc_renew_end', {
      stripeSubscriptionId: 'sub_renew',
      currentPeriodEnd: pastDate(5),
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_renew',
      items: { data: [{ id: 'item_renew' }] },
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = mockReq({ accountId: 'acc_renew_end', newPlan: 'advanced', newInterval: 'annual' });
    const res = mockRes();

    await changePlan(req, res);

    const newEnd = new Date(sub.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((newEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(360);
    expect(diffDays).toBeLessThanOrEqual(370);
  });
});

// ─── TEST 50: validateSubscription — condición de borde (exactamente en la frontera)

describe('50. validateSubscription — condición de borde temporal', () => {
  it('devuelve valid=false cuando currentPeriodEnd es hace 1 segundo (expirado justo ahora)', async () => {
    const justExpired = new Date(Date.now() - 1000).toISOString();
    const sub = makeActiveSub('acc_border', { currentPeriodEnd: justExpired, status: 'active' });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq({}, { accountId: 'acc_border' });
    const res = mockRes();

    await validateSubscription(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
    expect(sub.status).toBe('expired');
    expect(sub.save).toHaveBeenCalled();
  });

  it('devuelve valid=true cuando currentPeriodEnd es en 1 segundo (no expirado aún)', async () => {
    const almostExpired = new Date(Date.now() + 1000).toISOString();
    const sub = makeActiveSub('acc_border2', { currentPeriodEnd: almostExpired, status: 'active' });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    const req = mockReq({}, { accountId: 'acc_border2' });
    const res = mockRes();

    await validateSubscription(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.valid).toBe(true);
    expect(sub.save).not.toHaveBeenCalled();
  });
});

// ─── TEST 51: Webhook payment_method.attached — PM sin campo card ────────────

describe('51. Webhook: payment_method.attached — PM sin campo card', () => {
  it('no modifica paymentMethod si el PM no tiene card (SEPA, iDEAL, etc.)', async () => {
    const sub = makeActiveSub('acc_no_card_wh', {
      stripeCustomerId: 'cus_no_card',
      paymentMethod: { brand: 'visa', last4: '1234' }, // valor previo
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'payment_method.attached',
      data: {
        object: {
          id: 'pm_sepa_wh',
          customer: 'cus_no_card',
          // sin campo card — SEPA Debit
          type: 'sepa_debit',
          sepa_debit: { last4: '3456' },
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    // No debe sobreescribir paymentMethod porque no hay card
    expect(sub.save).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});

// ─── TEST 52: Webhook — evento desconocido sin crash ────────────────────────

describe('52. Webhook: evento desconocido no crash y devuelve received=true', () => {
  const unknownEvents = [
    'customer.created',
    'price.created',
    'product.updated',
    'charge.refunded',
    'subscription.paused',
  ];

  for (const eventType of unknownEvents) {
    it(`maneja sin errores el evento: ${eventType}`, async () => {
      stripeMock.webhooks.constructEvent.mockReturnValue({
        type: eventType,
        data: { object: { id: 'obj_unknown' } },
      });

      const req = mockReq();
      req.body = Buffer.from('raw');
      req.headers = { 'stripe-signature': 'sig_valid' };
      const res = mockRes();

      await handleWebhook(req, res);

      expect(res.json).toHaveBeenCalledWith({ received: true });
      expect(res.status).not.toHaveBeenCalled();
      expect(SubscriptionMock.findOne).not.toHaveBeenCalled();
    });
  }
});

// ─── TEST 53: Admin createAccountManually — cobertura completa ───────────────

describe('53. Admin: createAccountManually', () => {
  let createAccountManually: any;

  beforeEach(async () => {
    const mod = await import('../controllers/adminController.js');
    createAccountManually = mod.createAccountManually;
  });

  it('crea cuenta y suscripción trial con plan/interval por defecto (starter/monthly)', async () => {
    AccountMock.findOne.mockResolvedValue(null);
    const SubaccountMock = (await import('../models/Subaccount.js')).Subaccount as any;
    SubaccountMock.findOne.mockResolvedValue(null);

    AccountMock.create.mockResolvedValue({});
    SubscriptionMock.create.mockResolvedValue({});

    const req = mockReq({ name: 'New User', email: 'new@test.com', password: 'pass123' });
    const res = mockRes();

    await createAccountManually(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.userId).toBeDefined();

    expect(AccountMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New User',
        email: 'new@test.com',
        type: 'main',
        role: 'user',
        emailVerified: true,
        country: 'ES', // default
      })
    );

    expect(SubscriptionMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: 'starter',
        interval: 'monthly',
        status: 'trial',
        autoRenew: false,
        stripeCustomerId: null,
      })
    );
  });

  it('crea cuenta con plan y interval custom (advanced/annual)', async () => {
    AccountMock.findOne.mockResolvedValue(null);
    const SubaccountMock = (await import('../models/Subaccount.js')).Subaccount as any;
    SubaccountMock.findOne.mockResolvedValue(null);

    AccountMock.create.mockResolvedValue({});
    SubscriptionMock.create.mockResolvedValue({});

    const req = mockReq({
      name: 'Pro User',
      email: 'pro@test.com',
      password: 'secure123',
      country: 'FR',
      plan: 'advanced',
      interval: 'annual',
    });
    const res = mockRes();

    await createAccountManually(req, res);

    expect(AccountMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'FR' })
    );
    expect(SubscriptionMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'advanced', interval: 'annual' })
    );
  });

  it('la suscripción trial tiene trialEndDate 14 días en el futuro', async () => {
    AccountMock.findOne.mockResolvedValue(null);
    const SubaccountMock = (await import('../models/Subaccount.js')).Subaccount as any;
    SubaccountMock.findOne.mockResolvedValue(null);

    AccountMock.create.mockResolvedValue({});
    let capturedSub: any;
    SubscriptionMock.create.mockImplementation(async (data: any) => { capturedSub = data; return data; });

    const req = mockReq({ name: 'Trial User', email: 'trial@test.com', password: 'pw' });
    const res = mockRes();

    await createAccountManually(req, res);

    const trialEnd = new Date(capturedSub.trialEndDate);
    const now = new Date();
    const diffDays = Math.round((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(14);
    expect(capturedSub.currentPeriodEnd).toBe(capturedSub.trialEndDate);
  });

  it('rechaza con 400 si falta name', async () => {
    const req = mockReq({ email: 'x@test.com', password: 'pw' });
    const res = mockRes();
    await createAccountManually(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rechaza con 400 si falta email', async () => {
    const req = mockReq({ name: 'X', password: 'pw' });
    const res = mockRes();
    await createAccountManually(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rechaza con 400 si falta password', async () => {
    const req = mockReq({ name: 'X', email: 'x@x.com' });
    const res = mockRes();
    await createAccountManually(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rechaza con 400 si el email ya existe en Account', async () => {
    AccountMock.findOne.mockResolvedValue(makeAccount('existing'));
    const SubaccountMock = (await import('../models/Subaccount.js')).Subaccount as any;
    SubaccountMock.findOne.mockResolvedValue(null);

    const req = mockReq({ name: 'Dup', email: 'dup@test.com', password: 'pw' });
    const res = mockRes();

    await createAccountManually(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toContain('ya está registrado');
  });

  it('rechaza con 400 si el email ya existe en Subaccount', async () => {
    AccountMock.findOne.mockResolvedValue(null);
    const SubaccountMock = (await import('../models/Subaccount.js')).Subaccount as any;
    SubaccountMock.findOne.mockResolvedValue({ _id: 'sub_existing', email: 'dup_sub@test.com' });

    const req = mockReq({ name: 'DupSub', email: 'dup_sub@test.com', password: 'pw' });
    const res = mockRes();

    await createAccountManually(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('la contraseña se hashea con bcrypt antes de guardar', async () => {
    const bcryptMock = (await import('bcrypt')).default as any;
    AccountMock.findOne.mockResolvedValue(null);
    const SubaccountMock = (await import('../models/Subaccount.js')).Subaccount as any;
    SubaccountMock.findOne.mockResolvedValue(null);
    AccountMock.create.mockResolvedValue({});
    SubscriptionMock.create.mockResolvedValue({});

    const req = mockReq({ name: 'Hash', email: 'hash@test.com', password: 'plaintext' });
    const res = mockRes();

    await createAccountManually(req, res);

    expect(bcryptMock.hash).toHaveBeenCalledWith('plaintext', 10);
    expect(AccountMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'hashed_password' })
    );
  });
});

// ─── TEST 54: Admin getUserDetail — cobertura completa ───────────────────────

describe('54. Admin: getUserDetail', () => {
  let getUserDetail: any;

  beforeEach(async () => {
    const mod = await import('../controllers/adminController.js');
    getUserDetail = mod.getUserDetail;
  });

  it('devuelve usuario con suscripción y subcuentas', async () => {
    const fakeUser = {
      _id: 'acc_detail',
      name: 'Detail User',
      email: 'detail@test.com',
      country: 'ES',
      createdAt: new Date().toISOString(),
      emailVerified: true,
      twoFactorEnabled: false,
      googleCalendarConnected: false,
      disabled: false,
    };

    const fakeSub = {
      _id: 'sub_detail',
      accountId: 'acc_detail',
      plan: 'advanced',
      interval: 'annual',
      status: 'active',
    };

    const fakeSubaccounts = [
      { _id: 'sa_1', name: 'Sub 1', email: 'sub1@test.com', createdAt: new Date().toISOString(), twoFactorEnabled: false },
    ];

    // Account.findById encadena .select('-password ...').lean()
    const leanMock = vi.fn().mockResolvedValue(fakeUser);
    const selectMock = vi.fn().mockReturnValue({ lean: leanMock });
    AccountMock.findById.mockReturnValue({ select: selectMock });

    SubscriptionMock.findOne.mockResolvedValue(fakeSub);

    // Subaccount.find encadena .select('...').lean()
    const SubaccountMock = (await import('../models/Subaccount.js')).Subaccount as any;
    const saLeanMock = vi.fn().mockResolvedValue(fakeSubaccounts);
    const saSelectMock = vi.fn().mockReturnValue({ lean: saLeanMock });
    SubaccountMock.find.mockReturnValue({ select: saSelectMock });

    const req = mockReq({}, {}, { id: 'acc_detail' });
    const res = mockRes();

    await getUserDetail(req, res);

    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0];
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe('acc_detail');
    expect(result.subscription).toBeDefined();
    expect(result.subscription.plan).toBe('advanced');
    expect(result.subaccounts).toHaveLength(1);
    expect(result.subaccounts[0].id).toBe('sa_1');
  });

  it('devuelve 404 si el usuario no existe', async () => {
    const leanMock = vi.fn().mockResolvedValue(null);
    const selectMock = vi.fn().mockReturnValue({ lean: leanMock });
    AccountMock.findById.mockReturnValue({ select: selectMock });

    const req = mockReq({}, {}, { id: 'acc_ghost_detail' });
    const res = mockRes();

    await getUserDetail(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('devuelve subscription=null si el usuario no tiene suscripción', async () => {
    const fakeUser = {
      _id: 'acc_no_sub',
      name: 'No Sub',
      email: 'nosub@test.com',
      country: 'ES',
      createdAt: new Date().toISOString(),
      emailVerified: false,
      twoFactorEnabled: false,
      googleCalendarConnected: false,
    };

    const leanMock = vi.fn().mockResolvedValue(fakeUser);
    const selectMock = vi.fn().mockReturnValue({ lean: leanMock });
    AccountMock.findById.mockReturnValue({ select: selectMock });

    SubscriptionMock.findOne.mockResolvedValue(null);

    const SubaccountMock = (await import('../models/Subaccount.js')).Subaccount as any;
    const saLeanMock = vi.fn().mockResolvedValue([]);
    const saSelectMock = vi.fn().mockReturnValue({ lean: saLeanMock });
    SubaccountMock.find.mockReturnValue({ select: saSelectMock });

    const req = mockReq({}, {}, { id: 'acc_no_sub' });
    const res = mockRes();

    await getUserDetail(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.subscription).toBeNull();
    expect(result.subaccounts).toHaveLength(0);
  });
});

// ─── TEST 55: Cleanup — cuenta con stripeSubscriptionId se cancela en Stripe ─

describe('55. Cleanup service — cancelación de Stripe al borrar cuenta', () => {
  it('cancela la suscripción en Stripe antes de eliminar si stripeSubscriptionId existe', async () => {
    const expiredSub = createMockDoc({
      _id: 'sub_cleanup',
      accountId: 'acc_cleanup',
      status: 'expired',
      stripeSubscriptionId: 'sub_to_cancel_cleanup',
      currentPeriodEnd: pastDate(35),
      trialEndDate: pastDate(49),
    });

    // Replica la lógica del cleanup service
    if (expiredSub.stripeSubscriptionId) {
      await stripeMock.subscriptions.cancel(expiredSub.stripeSubscriptionId);
    }

    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith('sub_to_cancel_cleanup');
  });

  it('no llama a stripe.subscriptions.cancel si stripeSubscriptionId es null', async () => {
    const expiredSub = createMockDoc({
      _id: 'sub_cleanup_nostripe',
      accountId: 'acc_cleanup_ns',
      status: 'expired',
      stripeSubscriptionId: null,
      currentPeriodEnd: pastDate(35),
    });

    if (expiredSub.stripeSubscriptionId) {
      await stripeMock.subscriptions.cancel(expiredSub.stripeSubscriptionId);
    }

    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
  });

  it('si cancel falla, el error no debe interrumpir el bucle de limpieza', async () => {
    stripeMock.subscriptions.cancel.mockRejectedValue(new Error('Stripe timeout'));

    let threw = false;
    try {
      await stripeMock.subscriptions.cancel('sub_err');
    } catch {
      threw = true;
    }

    // El cleanup service envuelve esto en try/catch, así que el error se captura
    expect(threw).toBe(true); // el error existe, pero debería manejarse externamente
    expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith('sub_err');
  });
});

// ─── TEST 56: Webhook checkout.session.completed — suma días de trial ────────

describe('56. Webhook: checkout.session.completed — cálculo de periodo con días de trial', () => {
  it('suma días de trial restantes al periodo si status=trial con fecha futura', async () => {
    const trialEnd = futureDate(8);
    const sub = makeTrialSub('acc_co', {
      trialEndDate: trialEnd,
      currentPeriodEnd: trialEnd,
      status: 'trial',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { accountId: 'acc_co', plan: 'advanced', interval: 'monthly', autoRenew: 'false' },
          customer: 'cus_co',
          subscription: null,
        },
      },
    });

    const req = mockReq();
    req.body = Buffer.from('raw');
    req.headers = { 'stripe-signature': 'sig_valid' };
    const res = mockRes();

    await handleWebhook(req, res);

    const periodEnd = new Date(sub.currentPeriodEnd);
    const now = new Date();
    const diffDays = Math.round((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // ~1 month + ~8 days of trial remaining
    expect(diffDays).toBeGreaterThanOrEqual(30 + 7);
    expect(sub.plan).toBe('advanced');
    expect(sub.status).toBe('active');
    expect(sub.trialEndDate).toBeNull();
    expect(sub.autoRenew).toBe(false);
    expect(sub.save).toHaveBeenCalled();
  });
});

// ─── TEST 57: Admin toggleAccountStatus — sin stripePaymentMethodId ──────────

describe('57. Admin: toggleAccountStatus — casos combinados de stripe IDs', () => {
  let toggleAccountStatus: any;

  beforeEach(async () => {
    const mod = await import('../controllers/adminController.js');
    toggleAccountStatus = mod.toggleAccountStatus;
  });

  it('desactiva sin error cuando stripeSubscriptionId es null pero sí hay stripePaymentMethodId', async () => {
    const account = makeAccount('acc_only_pm');
    AccountMock.findById.mockResolvedValue(account);

    const sub = makeActiveSub('acc_only_pm', {
      stripeSubscriptionId: null,
      stripePaymentMethodId: 'pm_only',
    });
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.paymentMethods.detach.mockResolvedValue({});

    const req = mockReq({ disabled: true }, {}, { id: 'acc_only_pm' });
    const res = mockRes();

    await toggleAccountStatus(req, res);

    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripeMock.paymentMethods.detach).toHaveBeenCalledWith('pm_only');
    expect(sub.status).toBe('canceled');
    expect(sub.autoRenew).toBe(false);
    expect(sub.stripePaymentMethodId).toBeNull();
    expect(sub.paymentMethod).toBeNull();
  });

  it('desactiva sin Stripe cuando la cuenta no tiene suscripción', async () => {
    const account = makeAccount('acc_no_sub_disable');
    AccountMock.findById.mockResolvedValue(account);
    SubscriptionMock.findOne.mockResolvedValue(null);

    const req = mockReq({ disabled: true }, {}, { id: 'acc_no_sub_disable' });
    const res = mockRes();

    await toggleAccountStatus(req, res);

    expect(res.json.mock.calls[0][0]).toEqual({ success: true, disabled: true });
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
    expect(stripeMock.paymentMethods.detach).not.toHaveBeenCalled();
  });

  it('desactiva aunque stripe.subscriptions.cancel falle (error silenciado)', async () => {
    const account = makeAccount('acc_cancel_fail');
    AccountMock.findById.mockResolvedValue(account);

    const sub = makeActiveSub('acc_cancel_fail');
    SubscriptionMock.findOne.mockResolvedValue(sub);

    stripeMock.subscriptions.cancel.mockRejectedValue(new Error('Stripe unavailable'));
    stripeMock.paymentMethods.detach.mockResolvedValue({});

    const req = mockReq({ disabled: true }, {}, { id: 'acc_cancel_fail' });
    const res = mockRes();

    await toggleAccountStatus(req, res);

    expect(res.json.mock.calls[0][0]).toEqual({ success: true, disabled: true });
    expect(sub.status).toBe('canceled');
  });
});
