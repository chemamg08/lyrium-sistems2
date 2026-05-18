import { Automation } from '../models/Automation.js';
import { sendSystemEmail } from './emailService.js';
import { syncWhatsAppSessionValidation } from './whatsappService.js';

const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;

function isSameUtcDay(aIso?: string, b = new Date()): boolean {
  if (!aIso) return false;
  const a = new Date(aIso);
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

async function sendAlert(to: string, subject: string, text: string): Promise<boolean> {
  return sendSystemEmail({ to, subject, text });
}

async function processSession(account: any, session: any): Promise<void> {
  if (!session?.phoneNumberId || !session?.alertEmail) return;

  const validation = await syncWhatsAppSessionValidation(String(account._id), session.phoneNumberId);
  if (!validation) return;

  const latestAccount = await Automation.findById(String(account._id));
  const latestSession = (latestAccount?.whatsappSessions || []).find((s: any) => s.phoneNumberId === session.phoneNumberId);
  if (!latestAccount || !latestSession) return;
  const alertEmail = String(latestSession.alertEmail || '').trim();
  if (!alertEmail) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const phoneLabel = latestSession.phoneNumber || latestSession.phoneNumberId;

  if (latestSession.expiryKnown && latestSession.tokenExpiresAt) {
    const expiresAtMs = new Date(latestSession.tokenExpiresAt).getTime();
    const daysRemaining = Math.floor((expiresAtMs - now.getTime()) / (1000 * 60 * 60 * 24));
    const reminders = [
      { days: 7, field: 'lastExpiryReminder7dAt', subject: 'WhatsApp de Lyrium: tu conexion caduca en 7 dias' },
      { days: 3, field: 'lastExpiryReminder3dAt', subject: 'WhatsApp de Lyrium: tu conexion caduca en 3 dias' },
      { days: 1, field: 'lastExpiryReminder1dAt', subject: 'WhatsApp de Lyrium: tu conexion caduca en 1 dia' },
      { days: 0, field: 'lastExpiryReminder0dAt', subject: 'WhatsApp de Lyrium: tu conexion caduca hoy' },
    ] as const;

    for (const reminder of reminders) {
      if (daysRemaining !== reminder.days) continue;
      if (isSameUtcDay((latestSession as any)[reminder.field], now)) break;

      const sent = await sendAlert(
        alertEmail,
        reminder.subject,
        `La conexion de WhatsApp para ${phoneLabel} caduca en ${reminder.days} dia${reminder.days === 1 ? '' : 's'}. Renuevala desde Automatizaciones para evitar interrupciones.`,
      );
      if (sent) {
        (latestSession as any)[reminder.field] = nowIso;
        await latestAccount.save();
      }
      break;
    }
  }

  if (!validation.connected) {
    if (!latestSession.failureAlertOpen || !isSameUtcDay(latestSession.lastFailureAlertAt, now)) {
      const sent = await sendAlert(
        alertEmail,
        'WhatsApp de Lyrium: hemos detectado un problema en tu numero conectado',
        `Hemos detectado un problema en la conexion de WhatsApp para ${phoneLabel}. Motivo: ${latestSession.lastValidationError || 'conexion no funcional'}. Revisa la conexion en Automatizaciones.`,
      );
      if (sent) {
        latestSession.failureAlertOpen = true;
        latestSession.lastFailureAlertAt = nowIso;
        latestSession.failureFirstDetectedAt = latestSession.failureFirstDetectedAt || nowIso;
        await latestAccount.save();
      }
    }
    return;
  }

  if (latestSession.failureAlertOpen) {
    latestSession.failureAlertOpen = false;
    latestSession.failureResolvedAt = nowIso;
    await latestAccount.save();
  }
}

async function runWhatsAppAlertScheduler(): Promise<void> {
  const accounts = await Automation.find({ 'whatsappSessions.0': { $exists: true } });
  for (const account of accounts) {
    for (const session of account.whatsappSessions || []) {
      try {
        await processSession(account, session);
      } catch (err) {
        console.error('[WA Alert] Error procesando sesion', err);
      }
    }
  }
}

export function startWhatsAppAlertScheduler(): void {
  runWhatsAppAlertScheduler().catch(err => console.error('[WA Alert] Error en ejecucion inicial:', err));
  setInterval(() => {
    runWhatsAppAlertScheduler().catch(err => console.error('[WA Alert] Error en ejecucion periodica:', err));
  }, CHECK_INTERVAL_MS);
}
