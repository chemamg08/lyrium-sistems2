import { sendEmail } from './emailService.js';
import { FiscalAlert } from '../models/FiscalAlert.js';

const INTERVAL_MS = 1 * 60 * 1000; // 1 minuto
const PROCESSING_STALE_MS = 10 * 60 * 1000; // 10 minutos
const MAX_ALERTS_PER_TICK = 50;

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

async function claimNextDueAlert(today: string): Promise<any | null> {
  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS).toISOString();

  return FiscalAlert.findOneAndUpdate(
    {
      fechaEnvio: { $lte: today },
      $or: [
        { estado: 'pendiente' },
        { estado: 'processing', updatedAt: { $lt: staleBefore } },
      ],
    },
    {
      $set: {
        estado: 'processing',
        updatedAt: nowIso,
      },
    },
    {
      sort: { fechaEnvio: 1, updatedAt: 1 },
      returnDocument: 'after',
    }
  );
}

async function processClaimedAlert(alert: any): Promise<boolean> {
  const emails = alert.destinatarios.map((d: any) => d.email);

  const success = await sendEmail(alert.accountId, {
    to: emails,
    subject: alert.asunto,
    text: alert.mensaje,
    html: `<p>${alert.mensaje.replace(/\n/g, '<br>')}</p>`,
  });

  const update: Record<string, any> = { updatedAt: new Date().toISOString() };

  if (success) {
    if (alert.repeticion === 'una vez') {
      update.estado = 'enviado';
    } else {
      const next = new Date(alert.fechaEnvio);
      if (alert.repeticion === 'diaria') next.setDate(next.getDate() + 1);
      else if (alert.repeticion === 'semanal') next.setDate(next.getDate() + 7);
      else if (alert.repeticion === 'mensual') next.setMonth(next.getMonth() + 1);
      else if (alert.repeticion === 'trimestral') next.setMonth(next.getMonth() + 3);
      else if (alert.repeticion === 'anual') next.setFullYear(next.getFullYear() + 1);
      update.fechaEnvio = next.toISOString().split('T')[0];
      update.estado = 'pendiente';
    }
  } else {
    update.estado = 'error';
  }

  await FiscalAlert.findByIdAndUpdate(alert._id, update);
  return success;
}

async function runAlertScheduler(): Promise<void> {
  try {
    const today = todayIso();

    let processed = 0;
    while (processed < MAX_ALERTS_PER_TICK) {
      const claimedAlert = await claimNextDueAlert(today);
      if (!claimedAlert) {
        break;
      }

      await processClaimedAlert(claimedAlert);
      processed += 1;
    }

  } catch (err) {
    console.error('[alertScheduler] Error:', err);
  }
}

export function startAlertScheduler(): void {
  runAlertScheduler().catch(err =>
    console.error('[alertScheduler] Error en ejecución inicial:', err)
  );

  setInterval(() => {
    runAlertScheduler().catch(err =>
      console.error('[alertScheduler] Error en ejecución periódica:', err)
    );
  }, INTERVAL_MS);

}
