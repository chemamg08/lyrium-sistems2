import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const emailFlowMocks = vi.hoisted(() => {
  const createCompletion = vi.fn();
  const fetchUnreadEmails = vi.fn();
  const markEmailsAsSeen = vi.fn();
  const sendEmailViaCuenta = vi.fn();
  const replyToEmail = vi.fn();
  const automationFindById = vi.fn();
  const automationFindByIdAndUpdate = vi.fn();
  const automationCreate = vi.fn();
  const automationFind = vi.fn();
  const clientFindOne = vi.fn();
  const clientCreate = vi.fn();
  const clientFind = vi.fn();
  const clientFindById = vi.fn();
  const clientFindByIdAndUpdate = vi.fn();
  const clientDeleteOne = vi.fn();
  const subaccountFind = vi.fn();
  const createCaseFromEmail = vi.fn();
  const runWithDistributedLock = vi.fn();
  const resolveAutomationLanguage = vi.fn();
  const getAutomationMessage = vi.fn();
  const sanitizeFilename = vi.fn((value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_'));
  const hasAssignedSubaccount = vi.fn((client: any, subaccountId: string) => {
    const ids = client?.assignedSubaccountIds || (client?.assignedSubaccountId ? [client.assignedSubaccountId] : []);
    return ids.includes(subaccountId);
  });
  const buildAssignedSubaccountFields = vi.fn((_ids: string[], subaccountId: string) => ({
    assignedSubaccountId: subaccountId,
    assignedSubaccountIds: [subaccountId],
  }));
  const readAssignedSubaccountIds = vi.fn((client: any) => client?.assignedSubaccountIds || []);
  const fsExistsSync = vi.fn(() => true);
  const fsMkdirSync = vi.fn();
  const fsWriteFileSync = vi.fn();
  const fsReadFileSync = vi.fn(() => Buffer.from('attachment'));
  const fsUnlinkSync = vi.fn();
  const openAiCtor = vi.fn(() => ({
    chat: {
      completions: {
        create: createCompletion,
      },
    },
  }));

  return {
    createCompletion,
    fetchUnreadEmails,
    markEmailsAsSeen,
    sendEmailViaCuenta,
    replyToEmail,
    automationFindById,
    automationFindByIdAndUpdate,
    automationCreate,
    automationFind,
    clientFindOne,
    clientCreate,
    clientFind,
    clientFindById,
    clientFindByIdAndUpdate,
    clientDeleteOne,
    subaccountFind,
    createCaseFromEmail,
    runWithDistributedLock,
    resolveAutomationLanguage,
    getAutomationMessage,
    sanitizeFilename,
    hasAssignedSubaccount,
    buildAssignedSubaccountFields,
    readAssignedSubaccountIds,
    fsExistsSync,
    fsMkdirSync,
    fsWriteFileSync,
    fsReadFileSync,
    fsUnlinkSync,
    openAiCtor,
  };
});

vi.mock('openai', () => ({
  default: emailFlowMocks.openAiCtor,
}));

vi.mock('fs', () => ({
  default: {
    existsSync: emailFlowMocks.fsExistsSync,
    mkdirSync: emailFlowMocks.fsMkdirSync,
    writeFileSync: emailFlowMocks.fsWriteFileSync,
    readFileSync: emailFlowMocks.fsReadFileSync,
    unlinkSync: emailFlowMocks.fsUnlinkSync,
  },
  existsSync: emailFlowMocks.fsExistsSync,
  mkdirSync: emailFlowMocks.fsMkdirSync,
  writeFileSync: emailFlowMocks.fsWriteFileSync,
  readFileSync: emailFlowMocks.fsReadFileSync,
  unlinkSync: emailFlowMocks.fsUnlinkSync,
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
  readFile: vi.fn(),
}));

vi.mock('../services/emailService.js', () => ({
  fetchUnreadEmails: emailFlowMocks.fetchUnreadEmails,
  markEmailsAsSeen: emailFlowMocks.markEmailsAsSeen,
  sendEmailViaCuenta: emailFlowMocks.sendEmailViaCuenta,
  replyToEmail: emailFlowMocks.replyToEmail,
}));

vi.mock('../models/Automation.js', () => ({
  Automation: {
    findById: emailFlowMocks.automationFindById,
    findByIdAndUpdate: emailFlowMocks.automationFindByIdAndUpdate,
    create: emailFlowMocks.automationCreate,
    find: emailFlowMocks.automationFind,
  },
}));

vi.mock('../models/Client.js', () => ({
  Client: {
    findOne: emailFlowMocks.clientFindOne,
    create: emailFlowMocks.clientCreate,
    find: emailFlowMocks.clientFind,
    findById: emailFlowMocks.clientFindById,
    findByIdAndUpdate: emailFlowMocks.clientFindByIdAndUpdate,
    deleteOne: emailFlowMocks.clientDeleteOne,
  },
}));

vi.mock('../models/Subaccount.js', () => ({
  Subaccount: {
    find: emailFlowMocks.subaccountFind,
  },
}));

vi.mock('../utils/sanitizeFilename.js', () => ({
  sanitizeFilename: emailFlowMocks.sanitizeFilename,
}));

vi.mock('../utils/clientAssignments.js', () => ({
  hasAssignedSubaccount: emailFlowMocks.hasAssignedSubaccount,
  buildAssignedSubaccountFields: emailFlowMocks.buildAssignedSubaccountFields,
  readAssignedSubaccountIds: emailFlowMocks.readAssignedSubaccountIds,
}));

vi.mock('../services/automationMessages.js', () => ({
  resolveAutomationLanguage: emailFlowMocks.resolveAutomationLanguage,
  getAutomationMessage: emailFlowMocks.getAutomationMessage,
}));

vi.mock('../services/casesService.js', () => ({
  createCaseFromEmail: emailFlowMocks.createCaseFromEmail,
}));

vi.mock('../services/distributedLockService.js', () => ({
  runWithDistributedLock: emailFlowMocks.runWithDistributedLock,
}));

vi.mock('../services/aiService.js', () => ({
  stripThinkTags: (value: string) => value.replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
}));

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function makeCuentaCorreo(overrides: Record<string, any> = {}) {
  return {
    id: 'mail-1',
    plataforma: 'gmail',
    correo: 'despacho@test.io',
    password: 'plain-secret',
    createdAt: '2026-05-04T10:00:00.000Z',
    ...overrides,
  };
}

function createAutomationDoc(overrides: Record<string, any> = {}) {
  const doc: any = {
    _id: 'acc-1',
    accountId: 'acc-1',
    especialidades: [],
    cuentasCorreo: [makeCuentaCorreo()],
    correosConsultas: ['consultas@test.io'],
    documentos: [],
    switchActivo: true,
    respondConsultasGenerales: true,
    respondSolicitudesServicio: true,
    soloContactosConocidos: false,
    autoAssignEnabled: false,
    subcuentaEspecialidades: {},
    sortByCarga: false,
    emailConversations: [],
    pendingConsultas: [],
    emailFolders: [],
    emailClassifyRules: [],
    pendingReplies: [],
    whatsappCorreosConsultas: [],
    whatsappConversations: [],
  };

  Object.assign(doc, cloneValue(overrides));

  doc.toObject = () => cloneValue({
    ...doc,
    toObject: undefined,
    toJSON: undefined,
  });
  doc.toJSON = () => doc.toObject();

  return doc;
}

function makeIncomingEmail(overrides: Record<string, any> = {}) {
  return {
    from: 'ana@example.com',
    fromName: 'Ana',
    to: 'despacho@test.io',
    subject: 'Consulta',
    body: 'Hola, necesito información',
    date: new Date('2026-05-04T10:00:00.000Z'),
    messageId: 'msg-1',
    references: '',
    uid: 100,
    attachments: [],
    ...overrides,
  };
}

let currentAutomationDoc: any;

function installAutomationDoc(doc: any) {
  currentAutomationDoc = doc;
}

function findPendingReplyPush() {
  return emailFlowMocks.automationFindByIdAndUpdate.mock.calls.find(([, update]) => update?.$push?.pendingReplies);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-04T10:00:00.000Z'));
  vi.resetModules();
  vi.clearAllMocks();

  installAutomationDoc(createAutomationDoc());

  emailFlowMocks.automationFindById.mockImplementation(async () => currentAutomationDoc);
  emailFlowMocks.automationCreate.mockImplementation(async (data: any) => {
    installAutomationDoc(createAutomationDoc(data));
    return currentAutomationDoc;
  });
  emailFlowMocks.automationFind.mockResolvedValue([]);
  emailFlowMocks.automationFindByIdAndUpdate.mockImplementation(async (_id: string, update: any) => {
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

    if (update?.$pull?.pendingReplies?.id?.$in) {
      const ids = update.$pull.pendingReplies.id.$in;
      currentAutomationDoc.pendingReplies = (currentAutomationDoc.pendingReplies || []).filter(
        (reply: any) => !ids.includes(reply.id),
      );
    }

    return currentAutomationDoc;
  });

  emailFlowMocks.fetchUnreadEmails.mockResolvedValue([]);
  emailFlowMocks.markEmailsAsSeen.mockResolvedValue(undefined);
  emailFlowMocks.sendEmailViaCuenta.mockResolvedValue(undefined);
  emailFlowMocks.replyToEmail.mockResolvedValue(undefined);
  emailFlowMocks.clientFindOne.mockResolvedValue(null);
  emailFlowMocks.clientCreate.mockResolvedValue({ _id: 'client-1' });
  emailFlowMocks.clientFind.mockResolvedValue([]);
  emailFlowMocks.clientFindById.mockResolvedValue({ _id: 'client-1', assignedSubaccountIds: [] });
  emailFlowMocks.clientFindByIdAndUpdate.mockResolvedValue(undefined);
  emailFlowMocks.clientDeleteOne.mockResolvedValue({ deletedCount: 1 });
  emailFlowMocks.subaccountFind.mockResolvedValue([]);
  emailFlowMocks.createCaseFromEmail.mockResolvedValue(undefined);
  emailFlowMocks.runWithDistributedLock.mockImplementation(async (_key: string, _ttl: number, fn: () => Promise<any>) => fn());
  emailFlowMocks.resolveAutomationLanguage.mockResolvedValue('es');
  emailFlowMocks.getAutomationMessage.mockImplementation((_lang: string, key: string, vars?: Record<string, any>) => {
    if (key === 'assignmentAskEmail') {
      return `¿Quieres que te asigne un profesional de ${vars?.espName}?`;
    }
    if (key === 'assignedSpecializedLawyer') {
      return 'Te hemos asignado un abogado especializado.';
    }
    if (key === 'futureNeedServices') {
      return 'Quedamos a tu disposición para futuras necesidades.';
    }
    return key;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('email automation flow coverage', () => {
  it('stores grouped incoming emails and marks every UID as seen when auto replies are disabled', async () => {
    installAutomationDoc(createAutomationDoc({
      switchActivo: false,
      emailConversations: [],
    }));
    emailFlowMocks.fetchUnreadEmails.mockResolvedValue([
      makeIncomingEmail({ uid: 11, subject: 'Primero', body: 'Primer mensaje' }),
      makeIncomingEmail({ uid: 12, subject: 'Segundo', body: 'Segundo mensaje' }),
    ]);

    const mod = await import('../services/emailProcessorService.js');
    const processed = await mod.processIncomingEmails('acc-1');

    expect(processed).toBe(2);
    expect(currentAutomationDoc.emailConversations).toHaveLength(1);
    expect(currentAutomationDoc.emailConversations[0].messages).toHaveLength(2);
    expect(currentAutomationDoc.emailConversations[0].messages[0].text).toBe('Primer mensaje');
    expect(currentAutomationDoc.emailConversations[0].messages[1].text).toBe('Segundo mensaje');
    expect(emailFlowMocks.markEmailsAsSeen).toHaveBeenNthCalledWith(1, expect.any(Object), [11]);
    expect(emailFlowMocks.markEmailsAsSeen).toHaveBeenNthCalledWith(2, expect.any(Object), [12]);
  });

  it('queues a delayed KB reply for general questions it can answer', async () => {
    installAutomationDoc(createAutomationDoc({
      switchActivo: true,
      documentos: [
        {
          id: 'doc-1',
          nombre: 'FAQ',
          filename: 'faq.txt',
          extractedText: 'Nuestro horario es de lunes a viernes de 9 a 18.',
          uploadedAt: '2026-05-04T09:00:00.000Z',
        },
      ],
    }));
    emailFlowMocks.fetchUnreadEmails.mockResolvedValue([
      makeIncomingEmail({ uid: 21, subject: 'Horario del despacho', body: '¿Cuál es vuestro horario?' }),
    ]);
    emailFlowMocks.createCompletion
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"type":"consulta_general"}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'Nuestro horario es de lunes a viernes de 9 a 18.' } }] });

    const mod = await import('../services/emailProcessorService.js');
    const processed = await mod.processIncomingEmails('acc-1');
    const pendingReplyCall = findPendingReplyPush();

    expect(processed).toBe(1);
    expect(currentAutomationDoc.emailConversations).toHaveLength(1);
    expect(currentAutomationDoc.emailConversations[0].messages).toHaveLength(1);
    expect(emailFlowMocks.sendEmailViaCuenta).not.toHaveBeenCalled();
    expect(pendingReplyCall?.[1]?.$push?.pendingReplies).toMatchObject({
      to: 'ana@example.com',
      subject: 'Horario del despacho',
      text: 'Nuestro horario es de lunes a viernes de 9 a 18.',
      accountId: 'acc-1',
      conversationId: currentAutomationDoc.emailConversations[0].id,
      cuentaCorreoId: 'mail-1',
    });
    expect(emailFlowMocks.markEmailsAsSeen).toHaveBeenCalledWith(expect.any(Object), [21]);
  });

  it('creates a pending confirmation flow before assigning service requests by email', async () => {
    installAutomationDoc(createAutomationDoc({
      switchActivo: true,
      autoAssignEnabled: true,
      especialidades: [
        { id: 'esp-1', nombre: 'Laboral', descripcion: 'Despidos y contratos' },
      ],
      subcuentaEspecialidades: { 'sub-1': 'esp-1' },
    }));
    emailFlowMocks.subaccountFind.mockResolvedValue([
      { _id: 'sub-1', name: 'Laura', email: 'laura@test.io' },
    ]);
    emailFlowMocks.fetchUnreadEmails.mockResolvedValue([
      makeIncomingEmail({
        uid: 31,
        subject: 'Necesito un abogado laboralista',
        body: 'Tengo un despido y quiero saber si podéis ayudarme.',
      }),
    ]);
    emailFlowMocks.createCompletion
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"type":"solicitud_servicio","especialidadId":"esp-1"}' } }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"explicit": false}' } }] });

    const mod = await import('../services/emailProcessorService.js');
    await mod.processIncomingEmails('acc-1');

    expect(emailFlowMocks.createCaseFromEmail).toHaveBeenCalledWith(
      'acc-1',
      currentAutomationDoc,
      expect.objectContaining({ from: 'ana@example.com' }),
      expect.any(String),
      'esp-1',
      'solicitud_servicio',
      'pending',
      undefined,
      undefined,
      'client-1',
    );
    expect(currentAutomationDoc.pendingConsultas).toHaveLength(1);
    expect(currentAutomationDoc.pendingConsultas[0]).toMatchObject({
      originalFrom: 'ana@example.com',
      type: 'confirmacion_asignacion',
      especialidadId: 'esp-1',
      channel: 'email',
    });

    const pendingReplyCall = findPendingReplyPush();
    expect(pendingReplyCall?.[1]?.$push?.pendingReplies.text).toBe('¿Quieres que te asigne un profesional de Laboral?');
  });

  it('rolls back the conversation message when sending a manual email fails', async () => {
    installAutomationDoc(createAutomationDoc({
      emailConversations: [
        {
          id: 'conv-1',
          contactName: 'Ana',
          contactEmail: 'ana@example.com',
          subject: 'Consulta abierta',
          messages: [],
          lastMessageTime: '2026-05-04T10:00:00.000Z',
          unread: 0,
          cuentaCorreoId: 'mail-1',
          cuentaCorreoEmail: 'despacho@test.io',
        },
      ],
    }));
    emailFlowMocks.replyToEmail.mockRejectedValue(new Error('smtp down'));

    const mod = await import('../services/emailProcessorService.js');
    const sent = await mod.sendManualEmail('acc-1', 'conv-1', 'Respuesta manual', [
      {
        id: 'att-1',
        filename: 'adjunto.pdf',
        originalName: 'adjunto.pdf',
        mimeType: 'application/pdf',
        size: 128,
        path: 'C:/tmp/adjunto.pdf',
      },
    ]);

    expect(sent).toBe(false);
    expect(currentAutomationDoc.emailConversations[0].messages).toHaveLength(0);
    expect(emailFlowMocks.fsUnlinkSync).toHaveBeenCalledWith('C:/tmp/adjunto.pdf');
  });

  it('removes related pending consultas and the auto-created client when deleting a conversation', async () => {
    installAutomationDoc(createAutomationDoc({
      emailConversations: [
        {
          id: 'conv-1',
          contactName: 'Ana',
          contactEmail: 'ana@example.com',
          subject: 'Consulta abierta',
          messages: [],
          lastMessageTime: '2026-05-04T10:00:00.000Z',
          unread: 0,
          autoClientId: 'client-1',
        },
      ],
      pendingConsultas: [
        {
          id: 'pending-1',
          conversationId: 'conv-1',
          type: 'consulta_general',
        },
      ],
    }));

    const mod = await import('../services/emailProcessorService.js');
    await mod.deleteConversation('acc-1', 'conv-1');

    expect(currentAutomationDoc.emailConversations).toHaveLength(0);
    expect(currentAutomationDoc.pendingConsultas).toHaveLength(0);
    expect(emailFlowMocks.clientDeleteOne).toHaveBeenCalledWith({ _id: 'client-1' });
  });
});