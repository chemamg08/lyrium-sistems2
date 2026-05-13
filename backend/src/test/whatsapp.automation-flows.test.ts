import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const whatsappFlowMocks = vi.hoisted(() => {
  const createCompletion = vi.fn();
  const automationFindById = vi.fn();
  const automationFindByIdAndUpdate = vi.fn();
  const automationFindOne = vi.fn();
  const clientFindOne = vi.fn();
  const clientCreate = vi.fn();
  const clientFindByIdAndUpdate = vi.fn();
  const sendEmailViaCuenta = vi.fn();
  const createCaseFromWhatsApp = vi.fn();
  const verifyOwnership = vi.fn(() => true);
  const assignWhatsAppCase = vi.fn();
  const decryptPassword = vi.fn();
  const detectExplicitAssignmentRequest = vi.fn();
  const encryptPassword = vi.fn((value: string) => `enc:${value}`);
  const hasMatchingSpecialist = vi.fn();
  const interpretClientConfirmation = vi.fn();
  const resolveAutomationLanguage = vi.fn();
  const getAutomationMessage = vi.fn();
  const fsExistsSync = vi.fn(() => true);
  const fsMkdirSync = vi.fn();
  const fsWriteFileSync = vi.fn();
  const fsReadFileSync = vi.fn(() => Buffer.from('wa-attachment'));
  const fsUnlinkSync = vi.fn();
  const openAiCtor = vi.fn(() => ({
    chat: {
      completions: {
        create: createCompletion,
      },
    },
  }));
  const fetch = vi.fn();

  return {
    createCompletion,
    automationFindById,
    automationFindByIdAndUpdate,
    automationFindOne,
    clientFindOne,
    clientCreate,
    clientFindByIdAndUpdate,
    sendEmailViaCuenta,
    createCaseFromWhatsApp,
    verifyOwnership,
    assignWhatsAppCase,
    decryptPassword,
    detectExplicitAssignmentRequest,
    encryptPassword,
    hasMatchingSpecialist,
    interpretClientConfirmation,
    resolveAutomationLanguage,
    getAutomationMessage,
    fsExistsSync,
    fsMkdirSync,
    fsWriteFileSync,
    fsReadFileSync,
    fsUnlinkSync,
    openAiCtor,
    fetch,
  };
});

vi.mock('openai', () => ({
  default: whatsappFlowMocks.openAiCtor,
}));

vi.mock('fs', () => ({
  default: {
    existsSync: whatsappFlowMocks.fsExistsSync,
    mkdirSync: whatsappFlowMocks.fsMkdirSync,
    writeFileSync: whatsappFlowMocks.fsWriteFileSync,
    readFileSync: whatsappFlowMocks.fsReadFileSync,
    unlinkSync: whatsappFlowMocks.fsUnlinkSync,
  },
  existsSync: whatsappFlowMocks.fsExistsSync,
  mkdirSync: whatsappFlowMocks.fsMkdirSync,
  writeFileSync: whatsappFlowMocks.fsWriteFileSync,
  readFileSync: whatsappFlowMocks.fsReadFileSync,
  unlinkSync: whatsappFlowMocks.fsUnlinkSync,
}));

vi.mock('../models/Automation.js', () => ({
  Automation: {
    findById: whatsappFlowMocks.automationFindById,
    findByIdAndUpdate: whatsappFlowMocks.automationFindByIdAndUpdate,
    findOne: whatsappFlowMocks.automationFindOne,
  },
}));

vi.mock('../models/Client.js', () => ({
  Client: {
    findOne: whatsappFlowMocks.clientFindOne,
    create: whatsappFlowMocks.clientCreate,
    findByIdAndUpdate: whatsappFlowMocks.clientFindByIdAndUpdate,
  },
}));

vi.mock('../services/emailService.js', () => ({
  sendEmailViaCuenta: whatsappFlowMocks.sendEmailViaCuenta,
}));

vi.mock('../services/casesService.js', () => ({
  createCaseFromWhatsApp: whatsappFlowMocks.createCaseFromWhatsApp,
}));

vi.mock('../middleware/auth.js', () => ({
  verifyOwnership: whatsappFlowMocks.verifyOwnership,
}));

vi.mock('../services/emailProcessorService.js', () => ({
  assignWhatsAppCase: whatsappFlowMocks.assignWhatsAppCase,
  decryptPassword: whatsappFlowMocks.decryptPassword,
  detectExplicitAssignmentRequest: whatsappFlowMocks.detectExplicitAssignmentRequest,
  encryptPassword: whatsappFlowMocks.encryptPassword,
  hasMatchingSpecialist: whatsappFlowMocks.hasMatchingSpecialist,
  interpretClientConfirmation: whatsappFlowMocks.interpretClientConfirmation,
}));

vi.mock('../services/automationMessages.js', () => ({
  resolveAutomationLanguage: whatsappFlowMocks.resolveAutomationLanguage,
  getAutomationMessage: whatsappFlowMocks.getAutomationMessage,
}));

vi.mock('../services/aiService.js', () => ({
  stripThinkTags: (value: string) => value.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
}));

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function createWhatsAppDoc(overrides: Record<string, any> = {}) {
  const doc: any = {
    _id: 'acc-1',
    accountId: 'acc-1',
    documentos: [],
    cuentasCorreo: [
      {
        id: 'mail-1',
        plataforma: 'gmail',
        correo: 'despacho@test.io',
        password: 'plain-secret',
        createdAt: '2026-05-04T10:00:00.000Z',
      },
    ],
    especialidades: [],
    whatsappSwitchActivo: false,
    whatsappSessions: [],
    whatsappSession: null,
    whatsappConversations: [],
    whatsappFolders: [],
    whatsappCorreosConsultas: [],
    whatsappClassifyRules: [],
    whatsappRespondConsultasGenerales: true,
    whatsappRespondSolicitudesServicio: true,
    whatsappSoloContactosConocidos: false,
    autoAssignEnabled: false,
    pendingConsultas: [],
    save: vi.fn(async function save(this: any) {
      return this;
    }),
  };

  Object.assign(doc, cloneValue(overrides));
  return doc;
}

function makeWebhookPayload(text: string, overrides: Record<string, any> = {}) {
  return {
    value: {
      contacts: [
        {
          wa_id: '34600111222',
          profile: { name: 'Ana' },
        },
      ],
      messages: [
        {
          id: 'wam-1',
          from: '34600111222',
          type: 'text',
          text: { body: text },
          ...overrides,
        },
      ],
    },
  };
}

function makeResponse() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  res.sendFile = vi.fn().mockReturnValue(res);
  return res;
}

let currentAutomationDoc: any;

function installAutomationDoc(doc: any) {
  currentAutomationDoc = doc;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('fetch', whatsappFlowMocks.fetch);

  installAutomationDoc(createWhatsAppDoc());

  whatsappFlowMocks.automationFindById.mockImplementation(async () => currentAutomationDoc);
  whatsappFlowMocks.automationFindOne.mockImplementation(async () => currentAutomationDoc);
  whatsappFlowMocks.automationFindByIdAndUpdate.mockImplementation(async (_id: string, update: any) => {
    if (!currentAutomationDoc) return null;
    if (update?.$set) {
      for (const [key, value] of Object.entries(update.$set)) {
        currentAutomationDoc[key] = cloneValue(value);
      }
    }
    if (update?.$push) {
      for (const [key, value] of Object.entries(update.$push)) {
        currentAutomationDoc[key] = [...(currentAutomationDoc[key] || []), cloneValue(value)];
      }
    }
    if (update?.$pull) {
      for (const [key, criteria] of Object.entries(update.$pull)) {
        if (key === 'whatsappConversations' && (criteria as any)?.id) {
          currentAutomationDoc.whatsappConversations = (currentAutomationDoc.whatsappConversations || []).filter(
            (conversation: any) => conversation.id !== (criteria as any).id,
          );
        }
      }
    }
    return currentAutomationDoc;
  });

  whatsappFlowMocks.clientFindOne.mockResolvedValue(null);
  whatsappFlowMocks.clientCreate.mockResolvedValue({ _id: 'client-1' });
  whatsappFlowMocks.clientFindByIdAndUpdate.mockResolvedValue(undefined);
  whatsappFlowMocks.sendEmailViaCuenta.mockResolvedValue(undefined);
  whatsappFlowMocks.createCaseFromWhatsApp.mockResolvedValue(undefined);
  whatsappFlowMocks.verifyOwnership.mockReturnValue(true);
  whatsappFlowMocks.assignWhatsAppCase.mockResolvedValue(true);
  whatsappFlowMocks.decryptPassword.mockReturnValue('meta-token');
  whatsappFlowMocks.detectExplicitAssignmentRequest.mockResolvedValue(false);
  whatsappFlowMocks.hasMatchingSpecialist.mockResolvedValue(true);
  whatsappFlowMocks.interpretClientConfirmation.mockResolvedValue(true);
  whatsappFlowMocks.resolveAutomationLanguage.mockResolvedValue('es');
  whatsappFlowMocks.getAutomationMessage.mockImplementation((_lang: string, key: string, vars?: Record<string, any>) => {
    if (key === 'assignmentAskWhatsApp') {
      return `¿Quieres que te asigne un profesional para ${vars?.espName}?`;
    }
    if (key === 'assignedSpecializedLawyer') {
      return 'Te hemos asignado un abogado especializado.';
    }
    if (key === 'requestUnderReview') {
      return 'Estamos revisando tu solicitud.';
    }
    return key;
  });
  whatsappFlowMocks.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
    text: async () => '',
    arrayBuffer: async () => new ArrayBuffer(0),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('whatsapp automation service flows', () => {
  it('stores the incoming message when WhatsApp automation is disabled', async () => {
    installAutomationDoc(createWhatsAppDoc({
      whatsappSwitchActivo: false,
      whatsappSessions: [
        {
          connected: true,
          phoneNumberId: 'phone-1',
          accessToken: 'enc-token',
        },
      ],
    }));

    const mod = await import('../services/whatsappService.js');
    await mod.processIncomingMessage('phone-1', makeWebhookPayload('Hola, necesito información'));

    expect(currentAutomationDoc.whatsappConversations).toHaveLength(1);
    expect(currentAutomationDoc.whatsappConversations[0]).toMatchObject({
      contactPhone: '34600111222',
      phoneNumberId: 'phone-1',
      unread: 1,
    });
    expect(currentAutomationDoc.whatsappConversations[0].messages).toHaveLength(1);
    expect(currentAutomationDoc.whatsappConversations[0].messages[0].text).toBe('Hola, necesito información');
    expect(whatsappFlowMocks.fetch).not.toHaveBeenCalled();
  });

  it('answers WhatsApp general queries from the knowledge base and appends the assistant message', async () => {
    installAutomationDoc(createWhatsAppDoc({
      whatsappSwitchActivo: true,
      documentos: [
        {
          id: 'doc-1',
          nombre: 'FAQ',
          filename: 'faq.txt',
          extractedText: 'El despacho atiende de lunes a viernes de 9 a 18.',
        },
      ],
      whatsappSessions: [
        {
          connected: true,
          phoneNumberId: 'phone-1',
          accessToken: 'enc-token',
          instanceName: 'lyrium_acc-1',
        },
      ],
      whatsappSession: {
        connected: true,
        phoneNumberId: 'phone-1',
        accessToken: 'enc-token',
        instanceName: 'lyrium_acc-1',
      },
    }));
    whatsappFlowMocks.createCompletion
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"type":"consulta_general"}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Atendemos de lunes a viernes de 9 a 18.' } }] });

    const mod = await import('../services/whatsappService.js');
    await mod.processIncomingMessage('phone-1', makeWebhookPayload('¿Cuál es vuestro horario?'));

    expect(whatsappFlowMocks.fetch).toHaveBeenCalledTimes(1);
    expect(String(whatsappFlowMocks.fetch.mock.calls[0][0])).toContain('/phone-1/messages');
    expect(currentAutomationDoc.whatsappConversations).toHaveLength(1);
    expect(currentAutomationDoc.whatsappConversations[0].messages).toHaveLength(2);
    expect(currentAutomationDoc.whatsappConversations[0].messages[1]).toMatchObject({
      sent: true,
      text: 'Atendemos de lunes a viernes de 9 a 18.',
    });
    expect(whatsappFlowMocks.createCaseFromWhatsApp).not.toHaveBeenCalled();
  });

  it('creates a pending assignment confirmation flow for WhatsApp service requests', async () => {
    installAutomationDoc(createWhatsAppDoc({
      whatsappSwitchActivo: true,
      autoAssignEnabled: true,
      especialidades: [
        { id: 'esp-1', nombre: 'Laboral', descripcion: 'Despidos y contratos' },
      ],
      whatsappSessions: [
        {
          connected: true,
          phoneNumberId: 'phone-1',
          accessToken: 'enc-token',
          instanceName: 'lyrium_acc-1',
        },
      ],
      whatsappSession: {
        connected: true,
        phoneNumberId: 'phone-1',
        accessToken: 'enc-token',
        instanceName: 'lyrium_acc-1',
      },
    }));
    whatsappFlowMocks.createCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: '{"type":"solicitud_servicio","especialidadId":"esp-1"}' } }],
    });
    whatsappFlowMocks.detectExplicitAssignmentRequest.mockResolvedValue(false);
    whatsappFlowMocks.hasMatchingSpecialist.mockResolvedValue(true);

    const mod = await import('../services/whatsappService.js');
    await mod.processIncomingMessage('phone-1', makeWebhookPayload('Necesito un abogado laboralista para un despido'));

    expect(whatsappFlowMocks.createCaseFromWhatsApp).toHaveBeenCalledWith(
      'acc-1',
      currentAutomationDoc,
      'Ana',
      '34600111222',
      expect.any(String),
      'Necesito un abogado laboralista para un despido',
      'esp-1',
      'solicitud_servicio',
      'pending',
      undefined,
      undefined,
      'client-1',
    );
    expect(currentAutomationDoc.pendingConsultas).toHaveLength(1);
    expect(currentAutomationDoc.pendingConsultas[0]).toMatchObject({
      type: 'confirmacion_asignacion',
      especialidadId: 'esp-1',
      channel: 'whatsapp',
    });
    expect(currentAutomationDoc.whatsappConversations[0].messages[1].text).toBe(
      '¿Quieres que te asigne un profesional para Laboral?',
    );
  });
});

describe('whatsapp controller contracts', () => {
  it('cleans temporary uploads and blocks manual sends outside the 24-hour Meta window', async () => {
    installAutomationDoc(createWhatsAppDoc({
      whatsappSession: {
        connected: true,
        instanceName: 'lyrium_acc-1',
      },
      whatsappConversations: [
        {
          id: 'conv-1',
          contactPhone: '34600111222',
          messages: [],
          unread: 0,
        },
      ],
    }));

    const waService = await import('../services/whatsappService.js');
    vi.spyOn(waService, 'isWhatsAppConversationOutside24h').mockReturnValue(true);
    const controller = await import('../controllers/whatsappController.js');
    const res = makeResponse();

    await controller.sendWhatsAppMessage(
      {
        body: { accountId: 'acc-1', phone: '34600111222', text: 'Hola' },
        params: { id: 'conv-1' },
        files: [
          {
            path: 'C:/tmp/wa-file.txt',
            filename: 'wa-file.txt',
            originalname: 'wa-file.txt',
            mimetype: 'text/plain',
            size: 12,
          },
        ],
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(whatsappFlowMocks.fsUnlinkSync).toHaveBeenCalledWith('C:/tmp/wa-file.txt');
  });

  it('should expose the frontend session contract from getWhatsAppStatus', async () => {
    installAutomationDoc(createWhatsAppDoc({
      whatsappSessions: [
        {
          connected: true,
          phoneNumberId: 'phone-1',
          phoneNumber: '+34 600 11 12 22',
          name: 'Despacho principal',
          tokenExpiresAt: '2026-06-01T00:00:00.000Z',
          alertEmail: 'ops@test.io',
        },
      ],
      whatsappSession: {
        connected: true,
        phoneNumberId: 'phone-1',
        phoneNumber: '+34 600 11 12 22',
        instanceName: 'lyrium_acc-1',
      },
    }));

    const waService = await import('../services/whatsappService.js');
    vi.spyOn(waService, 'getInstanceStatus').mockResolvedValue({ connected: true, phoneNumber: '+34 600 11 12 22' });
    const controller = await import('../controllers/whatsappController.js');
    const res = makeResponse();

    await controller.getWhatsAppStatus({ query: { accountId: 'acc-1' } } as any, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      whatsappSessions: [
        expect.objectContaining({
          phoneNumberId: 'phone-1',
          alertEmail: 'ops@test.io',
          connected: true,
        }),
      ],
    }));
  });

  it('should reject WhatsApp token refresh when ownership validation fails', async () => {
    whatsappFlowMocks.verifyOwnership.mockReturnValue(false);

    const waService = await import('../services/whatsappService.js');
    const refreshSpy = vi.spyOn(waService, 'refreshWhatsAppToken').mockResolvedValue({
      success: true,
      newExpiresAt: '2026-06-01T00:00:00.000Z',
      daysRemaining: 28,
    });
    const controller = await import('../controllers/whatsappController.js');
    const res = makeResponse();

    await controller.refreshWhatsAppToken(
      { body: { accountId: 'acc-1', phoneNumberId: 'phone-1' } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('should reject token status queries when ownership validation fails', async () => {
    whatsappFlowMocks.verifyOwnership.mockReturnValue(false);

    const waService = await import('../services/whatsappService.js');
    const statusSpy = vi.spyOn(waService, 'getTokenStatus').mockResolvedValue({
      phoneNumberId: 'phone-1',
      connected: true,
      tokenType: 'long',
      expiresAt: '2026-06-01T00:00:00.000Z',
      daysRemaining: 28,
      status: 'ok',
      alertEmail: 'ops@test.io',
    });
    const controller = await import('../controllers/whatsappController.js');
    const res = makeResponse();

    await controller.getTokenStatus(
      { query: { accountId: 'acc-1', phoneNumberId: 'phone-1' } } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(statusSpy).not.toHaveBeenCalled();
  });
});