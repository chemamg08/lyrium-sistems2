import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const accountFindById = vi.fn();
const subscriptionFindOne = vi.fn();

vi.mock('../models/Account.js', () => ({
  Account: {
    findById: accountFindById,
  },
}));

vi.mock('../models/Subscription.js', () => ({
  Subscription: {
    findOne: subscriptionFindOne,
  },
}));

import { authMiddleware, generateToken } from '../middleware/auth.js';

function buildAccountQuery(disabled = false) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ disabled }),
    }),
  };
}

function mockResponse() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountFindById.mockReturnValue(buildAccountQuery(false));
  });

  it('permite activar el plan sin cargo con suscripción expirada', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    subscriptionFindOne.mockResolvedValue({
      plan: 'starter',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date().toISOString(),
      save,
    });

    const token = generateToken({
      userId: 'acc_free_auth_1',
      email: 'free-auth@lyrium.io',
      type: 'main',
    });

    const req: any = {
      cookies: { authToken: token },
      headers: {},
      originalUrl: '/api/accounts/activate-free',
    };
    const res = mockResponse();
    const next = vi.fn();

    authMiddleware(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('sigue bloqueando otras rutas cuando la suscripción está expirada', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    subscriptionFindOne.mockResolvedValue({
      plan: 'starter',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date().toISOString(),
      save,
    });

    const token = generateToken({
      userId: 'acc_free_auth_2',
      email: 'free-auth-2@lyrium.io',
      type: 'main',
    });

    const req: any = {
      cookies: { authToken: token },
      headers: {},
      originalUrl: '/api/accounts/me',
    };
    const res = mockResponse();
    const next = vi.fn();

    authMiddleware(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Tu suscripción ha caducado. Renueva tu plan para continuar.',
    });
  });
});
