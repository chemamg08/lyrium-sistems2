import { sendEmail } from './emailService.js';
import { FiscalAlert } from '../models/FiscalAlert.js';

const INTERVAL_MS = 20 * 60 * 60 * 1000; // 20 horas

async function runAlertScheduler(): Promise<void> {
  try {
    const alerts = await FiscalAlert.find().lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueAlerts = alerts.filter(a => {
      if (a.estado === 'enviado' && a.repeticion === 'una vez') return false;
      const fechaEnvio = new Date(a.fechaEnvio);
      fechaEnvio.setHours(0, 0, 0, 0);
      return fechaEnvio <= today && a.estado === 'pendiente';
    });

    if (dueAlerts.length === 0) {
      console.log('[alertScheduler] No hay alertas pendientes.');
      return;
    }

    let sent = 0;
    let failed = 0;

    for (const alert of dueAlerts) {
      const emails = alert.destinatarios.map(d => d.email);

      const success = await sendEmail(alert.accountId, {
        to: emails,
        subject: alert.asunto,
        text: alert.mensaje,
        html: `<p>${alert.mensaje.replace(/\n/g, '<br>')}</p>`,
      });

      const update: Record<string, any> = { updatedAt: new Date().toISOString() };

      if (success) {
        sent++;
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
        failed++;
        update.estado = 'error';
      }

      await FiscalAlert.findByIdAndUpdate(alert._id, update);
    }

    console.log(`[alertScheduler] Enviadas: ${sent}, Fallidas: ${failed}, Total: ${dueAlerts.length}`);
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

  console.log('[alertScheduler] Scheduler de alertas iniciado (cada 20h).');
}
