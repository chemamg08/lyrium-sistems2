import cron from 'node-cron';
import { google } from 'googleapis';
import crypto from 'crypto';
import { CalendarEvent } from '../models/CalendarEvent.js';
import { Account } from '../models/Account.js';
import { Subaccount } from '../models/Subaccount.js';
import { runWithDistributedLock } from '../services/distributedLockService.js';

const ENCRYPTION_KEY = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '';
const CALENDAR_SYNC_LOCK_TTL_MS = 10 * 60 * 1000;
const DEFAULT_CALENDAR_SYNC_CONCURRENCY = 4;

let runInProgress = false;

const createOAuth2Client = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

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

type CalendarRecord = any;
type CalendarSyncTarget = { record: CalendarRecord; isSubaccount: boolean };

function parseCalendarSyncConcurrency(): number {
  const rawValue = Number(process.env.CALENDAR_SYNC_CONCURRENCY || '');
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return DEFAULT_CALENDAR_SYNC_CONCURRENCY;
  }

  return Math.max(1, Math.floor(rawValue));
}

async function runWithConcurrencyLimit<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) {
        return;
      }

      await worker(item);
    }
  });

  await Promise.all(workers);
}

const mapGoogleEvent = (event: any, accountId: string) => {
  const isAllDay = !event.start?.dateTime && event.start?.date;
  const startDateTime = event.start?.dateTime || event.start?.date || '';
  const endDateTime = event.end?.dateTime || event.end?.date || '';

  const attendees = (event.attendees || [])
    .filter((a: any) => a.email)
    .map((a: any) => a.email);

  return {
    accountId,
    googleEventId: event.id,
    title: event.summary || 'Untitled Event',
    description: event.description || '',
    startDateTime,
    endDateTime,
    allDay: isAllDay,
    source: 'google' as const,
    lastSyncedAt: new Date().toISOString(),
    deleted: false,
    location: event.location || '',
    attendees,
    colorId: event.colorId || '',
    recurrence: event.recurrence || [],
    updatedAt: event.updated || new Date().toISOString(),
  };
};

export async function syncAccountCalendar(accountId: string) {
  const account = await Account.findById(accountId);
  if (account) {
    await syncAccountCalendarRecord(account, false);
    return;
  }
  const subaccount = await Subaccount.findById(accountId);
  if (subaccount) {
    await syncAccountCalendarRecord(subaccount, true);
  }
}

const syncAccountCalendarRecord = async (record: CalendarRecord, isSubaccount: boolean) => {
  const Model = isSubaccount ? Subaccount : Account;
  const accountId = record._id.toString();

  await runWithDistributedLock(`calendar-sync:${accountId}`, CALENDAR_SYNC_LOCK_TTL_MS, async () => {
    try {
      if (!record.googleAccessToken) {
        console.log(`[CalendarSync] Skipping ${accountId}: no access token`);
        return;
      }

      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({
        access_token: decrypt(record.googleAccessToken),
        refresh_token: record.googleRefreshToken ? decrypt(record.googleRefreshToken) : undefined,
      });

      oauth2Client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
          await (Model as any).updateOne({ _id: accountId }, { googleAccessToken: encrypt(tokens.access_token) });
        }
        if (tokens.refresh_token) {
          await (Model as any).updateOne({ _id: accountId }, { googleRefreshToken: encrypt(tokens.refresh_token) });
        }
      });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const syncToken = record.googleCalendarSyncToken || null;

      const fetchEvents = async (token?: string) => {
        const params: any = {
          calendarId: 'primary',
          maxResults: 2500,
          singleEvents: false,
        };

        if (token) {
          params.syncToken = token;
          params.showDeleted = true;
        }

        return await calendar.events.list(params);
      };

      let response;
      try {
        response = await fetchEvents(syncToken || undefined);
      } catch (error: any) {
        if (error?.code === 410) {
          console.log(`[CalendarSync] Sync token expired for ${accountId}, performing full sync`);
          response = await fetchEvents();
        } else {
          throw error;
        }
      }

      const events = response.data.items || [];
      const nextSyncToken = response.data.nextSyncToken;

      for (const event of events) {
        if (event.status === 'cancelled') {
          await CalendarEvent.updateOne(
            { accountId, googleEventId: event.id },
            { deleted: true, lastSyncedAt: new Date().toISOString() }
          );
          continue;
        }

        const data = mapGoogleEvent(event, accountId);
        const _id = `${accountId}_${event.id}`;

        await CalendarEvent.findOneAndUpdate(
          { accountId, googleEventId: event.id },
          { ...data, _id },
          { upsert: true, returnDocument: 'after' }
        );
      }

      const updateData: any = {
        googleCalendarLastSyncedAt: new Date().toISOString(),
      };
      if (nextSyncToken) {
        updateData.googleCalendarSyncToken = nextSyncToken;
      }

      await (Model as any).updateOne({ _id: accountId }, updateData);

      console.log(`[CalendarSync] Synced ${events.length} events for ${accountId}`);
    } catch (error: any) {
      console.error(`[CalendarSync] Failed to sync calendar for ${accountId}:`, error.message);
    }
  });
};

const runCalendarSync = async () => {
  if (runInProgress) {
    console.log('[CalendarSync] Previous run still in progress, skipping tick');
    return;
  }

  runInProgress = true;
  console.log('[CalendarSync] Starting sync job...');

  try {
    const accounts = await Account.find({ googleCalendarConnected: true }).lean();
    const subaccounts = await Subaccount.find({ googleCalendarConnected: true }).lean();
    const concurrency = parseCalendarSyncConcurrency();
    const targets: CalendarSyncTarget[] = [
      ...accounts.map((record) => ({ record, isSubaccount: false })),
      ...subaccounts.map((record) => ({ record, isSubaccount: true })),
    ];

    console.log(`[CalendarSync] Found ${accounts.length} accounts and ${subaccounts.length} subaccounts to sync`);

    await runWithConcurrencyLimit(targets, concurrency, async ({ record, isSubaccount }) => {
      await syncAccountCalendarRecord(record, isSubaccount);
    });

    console.log('[CalendarSync] Sync job completed');
  } catch (error: any) {
    console.error('[CalendarSync] Sync job failed:', error.message);
  } finally {
    runInProgress = false;
  }
};

export const startCalendarSyncJob = () => {
  cron.schedule('*/5 * * * *', runCalendarSync);
  console.log('[CalendarSync] Cron job scheduled (every 5 minutes)');
};
