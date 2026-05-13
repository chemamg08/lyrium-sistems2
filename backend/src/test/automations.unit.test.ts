import { beforeEach, describe, expect, it, vi } from 'vitest';

const automationModuleMocks = vi.hoisted(() => {
  const createCompletion = vi.fn();
  const findById = vi.fn();
  const openAiCtor = vi.fn(() => ({
    chat: {
      completions: {
        create: createCompletion,
      },
    },
  }));

  return {
    createCompletion,
    findById,
    openAiCtor,
  };
});

const whatsappControllerMocks = vi.hoisted(() => {
  return {
    refreshWhatsAppToken: vi.fn(),
    getTokenStatus: vi.fn(),
  };
});

const authMocks = vi.hoisted(() => ({
  verifyOwnership: vi.fn(() => true),
}));

vi.mock('openai', () => ({
  default: automationModuleMocks.openAiCtor,
}));

vi.mock('../models/Account.js', () => ({
  Account: {
    findById: automationModuleMocks.findById,
  },
}));

vi.mock('../services/aiService.js', () => ({
  stripThinkTags: (value: string) => value.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
}));

vi.mock('../services/whatsappService.js', () => ({
  WA_ATTACHMENTS_DIR: 'C:/tmp/wa-attachments',
  refreshWhatsAppToken: whatsappControllerMocks.refreshWhatsAppToken,
  getTokenStatus: whatsappControllerMocks.getTokenStatus,
}));

vi.mock('../models/Automation.js', () => ({
  Automation: {
    findById: vi.fn(),
  },
}));

vi.mock('../middleware/auth.js', () => ({
  verifyOwnership: authMocks.verifyOwnership,
}));

function makeResponse() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

function mockAccountCountry(country?: string) {
  const lean = vi.fn().mockResolvedValue(country ? { country } : null);
  const select = vi.fn().mockReturnValue({ lean });
  automationModuleMocks.findById.mockReturnValue({ select });
  return { lean, select };
}

describe('automationMessages', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ATLAS_API_KEY = 'test-atlas-key';
  });

  it('maps known countries and defaults unknown ones to Spanish', async () => {
    const mod = await import('../services/automationMessages.js');

    expect(mod.getLanguageForCountry('BR')).toBe('pt');
    expect(mod.getLanguageForCountry('DE')).toBe('de');
    expect(mod.getLanguageForCountry('unknown')).toBe('es');
  });

  it('interpolates specialization names and falls back to Spanish templates', async () => {
    const mod = await import('../services/automationMessages.js');

    expect(
      mod.getAutomationMessage('es', 'assignmentAskEmail', { espName: 'laboral' }),
    ).toContain('laboral');
    expect(mod.getAutomationMessage('xx' as any, 'requestUnderReview')).toBe(
      'Hemos recibido su solicitud. La estamos revisando y le responderemos en breve.',
    );
  });

  it('detects supported languages through the automation model and caches the result', async () => {
    automationModuleMocks.createCompletion.mockResolvedValue({
      choices: [{ message: { content: 'EN' } }],
    });
    const mod = await import('../services/automationMessages.js');

    await expect(mod.resolveAutomationLanguage('acc-1', 'Hello, I need legal help')).resolves.toBe('en');
    await expect(mod.resolveAutomationLanguage('acc-1', 'Hello, I need legal help')).resolves.toBe('en');
    expect(automationModuleMocks.createCompletion).toHaveBeenCalledTimes(1);
    expect(automationModuleMocks.openAiCtor).toHaveBeenCalledTimes(1);
  });

  it('falls back to the account country when AI detection returns an unsupported code', async () => {
    automationModuleMocks.createCompletion.mockResolvedValue({
      choices: [{ message: { content: 'spanish' } }],
    });
    const accountCountry = mockAccountCountry('BR');
    const mod = await import('../services/automationMessages.js');

    await expect(mod.resolveAutomationLanguage('acc-2', 'Preciso de ajuda com um contrato')).resolves.toBe('pt');
    expect(automationModuleMocks.findById).toHaveBeenCalledWith('acc-2');
    expect(accountCountry.select).toHaveBeenCalledWith('country');
  });

  it('falls back to Spanish when both AI detection and account lookup fail', async () => {
    automationModuleMocks.createCompletion.mockRejectedValue(new Error('atlas unavailable'));
    const lean = vi.fn().mockRejectedValue(new Error('db unavailable'));
    const select = vi.fn().mockReturnValue({ lean });
    automationModuleMocks.findById.mockReturnValue({ select });
    const mod = await import('../services/automationMessages.js');

    await expect(mod.resolveAutomationLanguage('acc-3', 'Hallo, ich brauche Hilfe')).resolves.toBe('es');
  });
});

describe('whatsappController token handlers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects token refresh requests without accountId and phoneNumberId', async () => {
    const mod = await import('../controllers/whatsappController.js');
    const res = makeResponse();

    await mod.refreshWhatsAppToken({ body: { accountId: 'acc-1' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(whatsappControllerMocks.refreshWhatsAppToken).not.toHaveBeenCalled();
  });

  it('returns the service error when token refresh fails', async () => {
    whatsappControllerMocks.refreshWhatsAppToken.mockResolvedValue({
      success: false,
      error: 'token invalid',
    });
    const mod = await import('../controllers/whatsappController.js');
    const res = makeResponse();

    await mod.refreshWhatsAppToken({ body: { accountId: 'acc-1', phoneNumberId: 'pn-1' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'token invalid' });
  });

  it('returns the normalized refresh payload on success', async () => {
    whatsappControllerMocks.refreshWhatsAppToken.mockResolvedValue({
      success: true,
      newExpiresAt: '2026-06-01T00:00:00.000Z',
      daysRemaining: 48,
    });
    const mod = await import('../controllers/whatsappController.js');
    const res = makeResponse();

    await mod.refreshWhatsAppToken({ body: { accountId: 'acc-1', phoneNumberId: 'pn-1' } } as any, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      newExpiresAt: '2026-06-01T00:00:00.000Z',
      daysRemaining: 48,
    });
  });

  it('rejects token status requests without both identifiers', async () => {
    const mod = await import('../controllers/whatsappController.js');
    const res = makeResponse();

    await mod.getTokenStatus({ query: { accountId: 'acc-1' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(whatsappControllerMocks.getTokenStatus).not.toHaveBeenCalled();
  });

  it('returns 404 when the requested WhatsApp session is missing', async () => {
    whatsappControllerMocks.getTokenStatus.mockResolvedValue(null);
    const mod = await import('../controllers/whatsappController.js');
    const res = makeResponse();

    await mod.getTokenStatus({ query: { accountId: 'acc-1', phoneNumberId: 'pn-1' } } as any, res);

    expect(whatsappControllerMocks.getTokenStatus).toHaveBeenCalledWith('acc-1', 'pn-1');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Sesión no encontrada' });
  });

  it('returns the raw status payload when the WhatsApp session exists', async () => {
    whatsappControllerMocks.getTokenStatus.mockResolvedValue({
      phoneNumberId: 'pn-1',
      connected: true,
      status: 'ok',
      daysRemaining: 21,
    });
    const mod = await import('../controllers/whatsappController.js');
    const res = makeResponse();

    await mod.getTokenStatus({ query: { accountId: 'acc-1', phoneNumberId: 'pn-1' } } as any, res);

    expect(res.json).toHaveBeenCalledWith({
      phoneNumberId: 'pn-1',
      connected: true,
      status: 'ok',
      daysRemaining: 21,
    });
  });
});