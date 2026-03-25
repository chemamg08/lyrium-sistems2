import { Request, Response } from 'express';
import { google } from 'googleapis';
import crypto from 'crypto';
import { Account } from '../models/Account.js';
import { Subaccount } from '../models/Subaccount.js';
import { verifyOwnership } from '../middleware/auth.js';
import { dispatchWebhook } from '../services/webhookService.js';

const ENCRYPTION_KEY = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '';

const createOAuth2Client = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

// ── Token encryption (AES-256-GCM) ──────────────────
const encrypt = (text: string): string => {
  if (!ENCRYPTION_KEY || !text) return text;
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

const decrypt = (data: string): string => {
  if (!ENCRYPTION_KEY || !data || !data.includes(':')) return data;
  try {
    const parts = data.split(':');
    if (parts.length !== 3) return data;
    const [ivHex, tagHex, encHex] = parts;
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(encHex, 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    return data;
  }
};

// ── Country → timezone ───────────────────────────────
const COUNTRY_TIMEZONE: Record<string, string> = {
  ES: 'Europe/Madrid', MX: 'America/Mexico_City', AR: 'America/Argentina/Buenos_Aires',
  CO: 'America/Bogota', PE: 'America/Lima', CL: 'America/Santiago',
  EC: 'America/Guayaquil', BO: 'America/La_Paz',
  PY: 'America/Asuncion', UY: 'America/Montevideo', US: 'America/New_York',
  GB: 'Europe/London', FR: 'Europe/Paris', DE: 'Europe/Berlin',
  IT: 'Europe/Rome', PT: 'Europe/Lisbon', BR: 'America/Sao_Paulo',
  AU: 'Australia/Sydney', CA: 'America/Toronto',
  PA: 'America/Panama', DO: 'America/Santo_Domingo',
  CR: 'America/Costa_Rica', GT: 'America/Guatemala', HN: 'America/Tegucigalpa',
  SV: 'America/El_Salvador', NI: 'America/Managua',
  MC: 'Europe/Monaco', LI: 'Europe/Vaduz', NZ: 'Pacific/Auckland', SG: 'Asia/Singapore',
  AT: 'Europe/Vienna', CH: 'Europe/Zurich', BE: 'Europe/Brussels',
  NL: 'Europe/Amsterdam', PL: 'Europe/Warsaw', SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo', DK: 'Europe/Copenhagen', FI: 'Europe/Helsinki',
  GR: 'Europe/Athens', CZ: 'Europe/Prague', HU: 'Europe/Budapest',
  RO: 'Europe/Bucharest', BG: 'Europe/Sofia', HR: 'Europe/Zagreb',
  SK: 'Europe/Bratislava', SI: 'Europe/Ljubljana', LT: 'Europe/Vilnius',
  LV: 'Europe/Riga', EE: 'Europe/Tallinn', IE: 'Europe/Dublin',
  LU: 'Europe/Luxembourg', CY: 'Asia/Nicosia', MT: 'Europe/Malta',
};

// ── Helper: find user record in Account or Subaccount ──
const findUserRecord = async (id: string) => {
  const account = await Account.findById(id);
  if (account) return { record: account, isSubaccount: false };
  const sub = await Subaccount.findById(id);
  if (sub) return { record: sub, isSubaccount: true };
  return null;
};

const getModel = (isSubaccount: boolean): any => isSubaccount ? Subaccount : Account;

// ── Helper: setup authenticated OAuth client ─────────
const setupOAuth = async (accountId: string) => {
  const result = await findUserRecord(accountId);
  if (!result || !(result.record as any).googleAccessToken) return null;

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: decrypt((result.record as any).googleAccessToken),
    refresh_token: (result.record as any).googleRefreshToken ? decrypt((result.record as any).googleRefreshToken) : undefined,
  });

  const Model = getModel(result.isSubaccount);
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await Model.updateOne({ _id: accountId }, { googleAccessToken: encrypt(tokens.access_token) });
    }
  });

  // For timezone: subaccounts don't have country — get from parent
  let country = 'ES';
  if (result.isSubaccount) {
    const parent = await Account.findById((result.record as any).parentAccountId).select('country').lean();
    country = (parent as any)?.country || 'ES';
  } else {
    country = (result.record as any).country || 'ES';
  }

  return { oauth2Client, account: { ...(result.record as any).toObject(), country } };
};

// ── Helper: build start/end objects ──────────────────
const buildStartEnd = (startDateTime: string, endDateTime: string | undefined, allDay: boolean, tz: string) => {
  const isEffectivelyAllDay = allDay || !startDateTime.includes('T');
  if (isEffectivelyAllDay) {
    const startDate = startDateTime.split('T')[0];
    let endDate = (endDateTime || startDateTime).split('T')[0];
    if (endDate <= startDate) {
      const d = new Date(startDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      endDate = d.toISOString().split('T')[0];
    }
    return {
      start: { date: startDate },
      end: { date: endDate },
    };
  }
  return {
    start: { dateTime: startDateTime, timeZone: tz },
    end: { dateTime: endDateTime || startDateTime, timeZone: tz },
  };
};

// GET /api/calendar/auth-url?accountId=xxx
export const getAuthUrl = async (req: Request, res: Response) => {
  const { accountId } = req.query;
  if (!accountId) return res.status(400).json({ error: 'accountId requerido' });

  if (!verifyOwnership(req, accountId as string)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  try {
    const stateToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const result = await findUserRecord(accountId as string);
    if (!result) return res.status(404).json({ error: 'Cuenta no encontrada' });
    const Model = getModel(result.isSubaccount);
    await Model.updateOne(
      { _id: accountId },
      { calendarOAuthState: stateToken, calendarOAuthStateExpires: expires }
    );

    const oauth2Client = createOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      state: stateToken,
      prompt: 'consent',
    });

    res.json({ url });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Error al generar URL de autenticación' });
  }
};

// GET /api/calendar/callback?code=xxx&state=stateToken  (public - no auth)
export const handleCallback = async (req: Request, res: Response) => {
  const { code, state } = req.query;
  const frontendUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:8080'
    : (process.env.FRONTEND_URL || 'https://lyrium.io');

  if (!code || !state) {
    return res.redirect(`${frontendUrl}/automatizaciones?calendarError=true`);
  }

  try {
    // Search both Account and Subaccount for the OAuth state
    let record: any = await Account.findOne({
      calendarOAuthState: state as string,
      calendarOAuthStateExpires: { $gt: new Date().toISOString() },
    });
    let Model: any = Account;

    if (!record) {
      record = await Subaccount.findOne({
        calendarOAuthState: state as string,
        calendarOAuthStateExpires: { $gt: new Date().toISOString() },
      });
      Model = Subaccount;
    }

    if (!record) {
      return res.redirect(`${frontendUrl}/automatizaciones?calendarError=true`);
    }

    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);

    await Model.updateOne(
      { _id: record._id },
      {
        googleAccessToken: encrypt(tokens.access_token || ''),
        googleRefreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : record.googleRefreshToken,
        googleCalendarConnected: true,
        calendarOAuthState: null,
        calendarOAuthStateExpires: null,
      }
    );

    res.redirect(`${frontendUrl}/automatizaciones?calendarConnected=true`);
  } catch (error) {
    console.error('Error en callback Google Calendar:', error);
    res.redirect(`${frontendUrl}/automatizaciones?calendarError=true`);
  }
};

// GET /api/calendar/status?accountId=xxx
export const getCalendarStatus = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });

    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const result = await findUserRecord(accountId as string);
    if (!result) return res.status(404).json({ error: 'Cuenta no encontrada' });

    res.json({
      connected: !!(result.record as any).googleCalendarConnected,
      email: result.record.email,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener estado' });
  }
};

// GET /api/calendar/events?accountId=xxx
export const getEvents = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });

    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const setup = await setupOAuth(accountId as string);
    if (!setup) return res.status(401).json({ error: 'Google Calendar no conectado' });

    const calendar = google.calendar({ version: 'v3', auth: setup.oauth2Client });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: today.toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json({ events: response.data.items || [] });
  } catch (error: any) {
    console.error('Error al obtener eventos:', error);
    if (error?.code === 401) {
      const result = await findUserRecord(req.query.accountId as string);
      if (result) {
        const Model = getModel(result.isSubaccount);
        await Model.updateOne(
          { _id: req.query.accountId },
          { googleCalendarConnected: false, googleAccessToken: null }
        );
      }
      return res.status(401).json({ error: 'Token expirado, reconecta Google Calendar' });
    }
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
};

// POST /api/calendar/events
export const createCalendarEvent = async (req: Request, res: Response) => {
  try {
    const { accountId, title, description, startDateTime, endDateTime, allDay, recurrence, colorId } = req.body;
    if (!accountId || !title || !startDateTime) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    if (!verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const setup = await setupOAuth(accountId);
    if (!setup) return res.status(401).json({ error: 'Google Calendar no conectado' });

    const tz = COUNTRY_TIMEZONE[setup.account.country] || 'Europe/Madrid';
    const calendar = google.calendar({ version: 'v3', auth: setup.oauth2Client });
    const { start, end } = buildStartEnd(startDateTime, endDateTime, allDay, tz);

    const requestBody: any = { summary: title, description, start, end };
    if (colorId) requestBody.colorId = colorId;
    if (recurrence) requestBody.recurrence = [recurrence];

    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody,
    });

    dispatchWebhook(accountId, 'calendar_event_created', { eventId: event.data.id, title, startDateTime }).catch(() => {});

    res.json({ success: true, event: event.data });
  } catch (error: any) {
    console.error('Error al crear evento:', error);
    res.status(500).json({ error: 'Error al crear evento' });
  }
};

// PUT /api/calendar/events/:eventId
export const updateCalendarEvent = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const { accountId, title, description, startDateTime, endDateTime, allDay, recurrence, colorId } = req.body;
    if (!accountId || !eventId) return res.status(400).json({ error: 'Faltan parámetros' });

    if (!verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const setup = await setupOAuth(accountId);
    if (!setup) return res.status(401).json({ error: 'Google Calendar no conectado' });

    const tz = COUNTRY_TIMEZONE[setup.account.country] || 'Europe/Madrid';
    const calendar = google.calendar({ version: 'v3', auth: setup.oauth2Client });

    const requestBody: any = {};
    if (title !== undefined) requestBody.summary = title;
    if (description !== undefined) requestBody.description = description;
    if (startDateTime) {
      const { start, end } = buildStartEnd(startDateTime, endDateTime, allDay, tz);
      requestBody.start = start;
      requestBody.end = end;
    }
    if (colorId !== undefined) requestBody.colorId = colorId;
    if (recurrence !== undefined) requestBody.recurrence = recurrence ? [recurrence] : [];

    const event = await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody,
    });
    dispatchWebhook(accountId, 'calendar_event_updated', { eventId, title: event.data.summary, start: event.data.start });

    res.json({ success: true, event: event.data });
  } catch (error: any) {
    console.error('Error al actualizar evento:', error);
    res.status(500).json({ error: 'Error al actualizar evento' });
  }
};

// DELETE /api/calendar/events/:eventId?accountId=xxx
export const deleteCalendarEvent = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const { accountId } = req.query;
    if (!accountId || !eventId) return res.status(400).json({ error: 'Faltan parámetros' });

    if (!verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const setup = await setupOAuth(accountId as string);
    if (!setup) return res.status(401).json({ error: 'Google Calendar no conectado' });

    const calendar = google.calendar({ version: 'v3', auth: setup.oauth2Client });
    await calendar.events.delete({ calendarId: 'primary', eventId });
    dispatchWebhook(accountId as string, 'calendar_event_deleted', { eventId });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar evento:', error);
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
};

// POST /api/calendar/disconnect
export const disconnectCalendar = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.body;
    if (!accountId) return res.status(400).json({ error: 'accountId requerido' });

    if (!verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const result = await findUserRecord(accountId);
    if (!result) return res.status(404).json({ error: 'Cuenta no encontrada' });
    const Model = getModel(result.isSubaccount);
    await Model.updateOne(
      { _id: accountId },
      { googleAccessToken: null, googleRefreshToken: null, googleCalendarConnected: false }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al desconectar' });
  }
};
