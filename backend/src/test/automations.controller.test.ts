import { beforeEach, describe, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => {
  const automationFindById = vi.fn();
  const automationFindByIdAndUpdate = vi.fn();
  const subaccountFind = vi.fn();
  const subaccountFindById = vi.fn();
  const accountFindById = vi.fn();
  const accountFindOne = vi.fn();
  const accountUpdateOne = vi.fn();
  const calendarEventFind = vi.fn();
  const verifyOwnership = vi.fn(() => true);
  const startPolling = vi.fn();
  const encryptPassword = vi.fn((value: string) => `encrypted:${value}`);
  const syncAccountCalendar = vi.fn();

  function Automation(this: any, data: Record<string, any>) {
    Object.assign(this, data);
    this.toJSON = () => ({ ...this });
  }

  (Automation as any).findById = automationFindById;
  (Automation as any).findByIdAndUpdate = automationFindByIdAndUpdate;

  return {
    Automation,
    automationFindById,
    automationFindByIdAndUpdate,
    subaccountFind,
    subaccountFindById,
    accountFindById,
    accountFindOne,
    accountUpdateOne,
    calendarEventFind,
    verifyOwnership,
    startPolling,
    encryptPassword,
    syncAccountCalendar,
  };
});

vi.mock('../services/emailProcessorService.js', () => ({
  startPolling: controllerMocks.startPolling,
  stopPolling: vi.fn(),
  isPollingActive: vi.fn(),
  processIncomingEmails: vi.fn(),
  getEmailConversations: vi.fn(),
  getPendingConsultas: vi.fn(),
  markConversationRead: vi.fn(),
  deleteConversation: vi.fn(),
  toggleConversationAutoReply: vi.fn(),
  sendManualEmail: vi.fn(),
  encryptPassword: controllerMocks.encryptPassword,
}));

vi.mock('../models/Automation.js', () => ({
  Automation: controllerMocks.Automation,
}));

vi.mock('../models/Subaccount.js', () => ({
  Subaccount: {
    find: controllerMocks.subaccountFind,
    findById: controllerMocks.subaccountFindById,
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../models/Account.js', () => ({
  Account: {
    findById: controllerMocks.accountFindById,
    findOne: controllerMocks.accountFindOne,
    updateOne: controllerMocks.accountUpdateOne,
  },
}));

vi.mock('../models/CalendarEvent.js', () => ({
  CalendarEvent: {
    find: controllerMocks.calendarEventFind,
  },
}));

vi.mock('../middleware/auth.js', () => ({
  verifyOwnership: controllerMocks.verifyOwnership,
}));

vi.mock('../jobs/calendarSyncJob.js', () => ({
  syncAccountCalendar: controllerMocks.syncAccountCalendar,
}));

vi.mock('../services/webhookService.js', () => ({
  dispatchWebhook: vi.fn(),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(() => ({
        setCredentials: vi.fn(),
        on: vi.fn(),
        generateAuthUrl: vi.fn(),
      })),
    },
    calendar: vi.fn(),
  },
}));

function makeResponse() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe('automatizacionesController', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    controllerMocks.verifyOwnership.mockReturnValue(true);
  });

  it('returns 400 when getData is called without accountId', async () => {
    const mod = await import('../controllers/automatizacionesController.js');
    const res = makeResponse();

    await mod.getData({ query: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(controllerMocks.automationFindById).not.toHaveBeenCalled();
  });

  it('returns 403 when getData ownership check fails', async () => {
    controllerMocks.verifyOwnership.mockReturnValue(false);
    const mod = await import('../controllers/automatizacionesController.js');
    const res = makeResponse();

    await mod.getData({ query: { accountId: 'acc-1' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acceso denegado' });
  });

  it('returns serialized automation data for a valid account', async () => {
    const accountDoc = {
      toJSON: vi.fn(() => ({ accountId: 'acc-1', switchActivo: true, cuentasCorreo: [] })),
    };
    controllerMocks.automationFindById.mockResolvedValue(accountDoc);
    const mod = await import('../controllers/automatizacionesController.js');
    const res = makeResponse();

    await mod.getData({ query: { accountId: 'acc-1' } } as any, res);

    expect(res.json).toHaveBeenCalledWith({ accountId: 'acc-1', switchActivo: true, cuentasCorreo: [] });
  });

  it('creates a new specialty and persists the updated list', async () => {
    const accountDoc = { especialidades: [] as any[] };
    controllerMocks.automationFindById.mockResolvedValue(accountDoc);
    const mod = await import('../controllers/automatizacionesController.js');
    const res = makeResponse();

    await mod.createEspecialidad(
      { body: { accountId: 'acc-1', nombre: 'Laboral', descripcion: 'Despidos' } } as any,
      res,
    );

    expect(accountDoc.especialidades).toHaveLength(1);
    expect(accountDoc.especialidades[0]).toMatchObject({
      nombre: 'Laboral',
      descripcion: 'Despidos',
    });
    expect(controllerMocks.automationFindByIdAndUpdate).toHaveBeenCalledWith(
      'acc-1',
      {
        $set: {
          especialidades: accountDoc.especialidades,
          accountId: 'acc-1',
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    expect(res.json).toHaveBeenCalledWith(accountDoc.especialidades[0]);
  });

  it('rejects custom mailboxes without both custom SMTP and IMAP hosts', async () => {
    const mod = await import('../controllers/automatizacionesController.js');
    const res = makeResponse();

    await mod.createCuentaCorreo(
      {
        body: {
          accountId: 'acc-1',
          plataforma: 'custom',
          correo: 'custom@example.com',
        },
      } as any,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(controllerMocks.startPolling).not.toHaveBeenCalled();
  });

  it('stores encrypted custom mailbox credentials and starts polling', async () => {
    const accountDoc = { cuentasCorreo: [] as any[] };
    controllerMocks.automationFindById.mockResolvedValue(accountDoc);
    const mod = await import('../controllers/automatizacionesController.js');
    const res = makeResponse();

    await mod.createCuentaCorreo(
      {
        body: {
          accountId: 'acc-1',
          plataforma: 'custom',
          correo: 'custom@example.com',
          password: 'secret',
          customSmtpHost: 'smtp.example.com',
          customSmtpPort: '2525',
          customImapHost: 'imap.example.com',
          customImapPort: '1993',
        },
      } as any,
      res,
    );

    expect(controllerMocks.encryptPassword).toHaveBeenCalledWith('secret');
    expect(accountDoc.cuentasCorreo).toHaveLength(1);
    expect(accountDoc.cuentasCorreo[0]).toMatchObject({
      plataforma: 'custom',
      correo: 'custom@example.com',
      password: 'encrypted:secret',
      customSmtpHost: 'smtp.example.com',
      customSmtpPort: 2525,
      customImapHost: 'imap.example.com',
      customImapPort: 1993,
    });
    expect(controllerMocks.startPolling).toHaveBeenCalledWith('acc-1');
    expect(res.json).toHaveBeenCalledWith(accountDoc.cuentasCorreo[0]);
  });

  it('returns only subaccounts for the requested parent account', async () => {
    controllerMocks.subaccountFind.mockResolvedValue([
      { toJSON: () => ({ id: 'sub-1', email: 'one@example.com' }) },
      { toJSON: () => ({ id: 'sub-2', email: 'two@example.com' }) },
    ]);
    const mod = await import('../controllers/automatizacionesController.js');
    const res = makeResponse();

    await mod.getSubcuentas({ query: { accountId: 'acc-1' } } as any, res);

    expect(controllerMocks.subaccountFind).toHaveBeenCalledWith({ parentAccountId: 'acc-1' });
    expect(res.json).toHaveBeenCalledWith([
      { id: 'sub-1', email: 'one@example.com' },
      { id: 'sub-2', email: 'two@example.com' },
    ]);
  });
});

describe('calendarController', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    controllerMocks.verifyOwnership.mockReturnValue(true);
  });

  it('returns 400 when getEvents is called without accountId', async () => {
    const mod = await import('../controllers/calendarController.js');
    const res = makeResponse();

    await mod.getEvents({ query: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(controllerMocks.calendarEventFind).not.toHaveBeenCalled();
  });

  it('returns calendar events sorted by startDateTime for the requested account', async () => {
    const sort = vi.fn().mockResolvedValue([
      { id: 'evt-1', title: 'Vista oral', startDateTime: '2026-05-10T09:00:00.000Z' },
      { id: 'evt-2', title: 'Llamada', startDateTime: '2026-05-11T10:00:00.000Z' },
    ]);
    controllerMocks.calendarEventFind.mockReturnValue({ sort });
    const mod = await import('../controllers/calendarController.js');
    const res = makeResponse();

    await mod.getEvents({ query: { accountId: 'acc-1' } } as any, res);

    expect(controllerMocks.calendarEventFind).toHaveBeenCalledWith({ accountId: 'acc-1', deleted: false });
    expect(sort).toHaveBeenCalledWith({ startDateTime: 1 });
    expect(res.json).toHaveBeenCalledWith({
      events: [
        { id: 'evt-1', title: 'Vista oral', startDateTime: '2026-05-10T09:00:00.000Z' },
        { id: 'evt-2', title: 'Llamada', startDateTime: '2026-05-11T10:00:00.000Z' },
      ],
    });
  });

  it('rejects manual sync requests when accountId is missing', async () => {
    const mod = await import('../controllers/calendarController.js');
    const res = makeResponse();

    await mod.syncCalendar({ body: {} } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(controllerMocks.syncAccountCalendar).not.toHaveBeenCalled();
  });

  it('runs the manual sync job and returns a success payload', async () => {
    const mod = await import('../controllers/calendarController.js');
    const res = makeResponse();

    await mod.syncCalendar({ body: { accountId: 'acc-1' } } as any, res);

    expect(controllerMocks.syncAccountCalendar).toHaveBeenCalledWith('acc-1');
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Sincronización completada' });
  });
});