import { Request, Response } from 'express';
import { google } from 'googleapis';
import { Account } from '../models/Account.js';

const createOAuth2Client = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

// GET /api/calendar/auth-url?accountId=xxx
export const getAuthUrl = (req: Request, res: Response) => {
  const { accountId } = req.query;
  if (!accountId) return res.status(400).json({ error: 'accountId requerido' });

  const oauth2Client = createOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: accountId as string,
    prompt: 'consent',
  });

  res.json({ url });
};

// GET /api/calendar/callback?code=xxx&state=accountId  (public - no auth)
export const handleCallback = async (req: Request, res: Response) => {
  const { code, state: accountId } = req.query;
  const frontendUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:8080'
    : (process.env.FRONTEND_URL || 'http://localhost:8080');

  if (!code || !accountId) {
    return res.redirect(`${frontendUrl}/automatizaciones?calendarError=true`);
  }

  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);

    await Account.updateOne(
      { _id: accountId },
      {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleCalendarConnected: true,
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

    const account = await Account.findById(accountId as string);
    if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });

    res.json({
      connected: !!(account as any).googleCalendarConnected,
      email: account.email,
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

    const account = await Account.findById(accountId as string);
    if (!account || !(account as any).googleAccessToken) {
      return res.status(401).json({ error: 'Google Calendar no conectado' });
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: (account as any).googleAccessToken,
      refresh_token: (account as any).googleRefreshToken,
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await Account.updateOne({ _id: accountId }, { googleAccessToken: tokens.access_token });
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json({ events: response.data.items || [] });
  } catch (error: any) {
    console.error('Error al obtener eventos:', error);
    if (error?.code === 401) {
      await Account.updateOne(
        { _id: req.query.accountId },
        { googleCalendarConnected: false, googleAccessToken: null }
      );
      return res.status(401).json({ error: 'Token expirado, reconecta Google Calendar' });
    }
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
};

// POST /api/calendar/events
export const createCalendarEvent = async (req: Request, res: Response) => {
  try {
    const { accountId, title, description, startDateTime, endDateTime, allDay } = req.body;
    if (!accountId || !title || !startDateTime) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const account = await Account.findById(accountId);
    if (!account || !(account as any).googleAccessToken) {
      return res.status(401).json({ error: 'Google Calendar no conectado' });
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: (account as any).googleAccessToken,
      refresh_token: (account as any).googleRefreshToken,
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await Account.updateOne({ _id: accountId }, { googleAccessToken: tokens.access_token });
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    let start: any, end: any;
    // Si no viene hora (startDateTime es solo fecha sin T), tratar como todo el día
    const isEffectivelyAllDay = allDay || !startDateTime.includes('T');
    if (isEffectivelyAllDay) {
      start = { date: startDateTime.split('T')[0] };
      end = { date: (endDateTime || startDateTime).split('T')[0] };
    } else {
      start = { dateTime: startDateTime, timeZone: 'Europe/Madrid' };
      end = { dateTime: endDateTime || startDateTime, timeZone: 'Europe/Madrid' };
    }

    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: { summary: title, description, start, end },
    });

    res.json({ success: true, event: event.data });
  } catch (error: any) {
    console.error('Error al crear evento:', error);
    res.status(500).json({ error: 'Error al crear evento' });
  }
};

// DELETE /api/calendar/events/:eventId?accountId=xxx
export const deleteCalendarEvent = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const { accountId } = req.query;
    if (!accountId || !eventId) return res.status(400).json({ error: 'Faltan parámetros' });

    const account = await Account.findById(accountId as string);
    if (!account || !(account as any).googleAccessToken) {
      return res.status(401).json({ error: 'Google Calendar no conectado' });
    }

    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: (account as any).googleAccessToken,
      refresh_token: (account as any).googleRefreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    await calendar.events.delete({ calendarId: 'primary', eventId });

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

    await Account.updateOne(
      { _id: accountId },
      { googleAccessToken: null, googleRefreshToken: null, googleCalendarConnected: false }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al desconectar' });
  }
};
