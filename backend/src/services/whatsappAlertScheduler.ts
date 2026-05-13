import { Automation } from '../models/Automation.js';
import { sendEmail, sendEmailViaCuenta, type CuentaCorreoConfig } from './emailService.js';
import { decryptPassword } from './emailProcessorService.js';

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas

function toCuentaConfig(cuentaCorreo: any): CuentaCorreoConfig {
  return {
    plataforma: cuentaCorreo.plataforma,
    correo: cuentaCorreo.correo,
    password: decryptPassword(cuentaCorreo.password),
    customSmtpHost: cuentaCorreo.customSmtpHost,
    customSmtpPort: cuentaCorreo.customSmtpPort,
    customImapHost: cuentaCorreo.customImapHost,
    customImapPort: cuentaCorreo.customImapPort,
  };
}

async function sendWhatsAppAlertEmail(account: any, to: string, subject: string, text: string): Promise<boolean> {
  const cuentaCorreo = (account?.cuentasCorreo || [])[0];
  if (cuentaCorreo) {
    try {
      await sendEmailViaCuenta(toCuentaConfig(cuentaCorreo), to, subject, text);
      return true;
    } catch (err) {
      console.error('[WA Alert] Error enviando con cuenta de Automatizaciones, probando fallback legacy:', err);
    }
  }

  return sendEmail(String(account._id), { to, subject, text });
}

async function runWhatsAppAlertScheduler(): Promise<void> {
  try {
    const now = Date.now();
    const accounts = await Automation.find({ 'whatsappSessions.0': { $exists: true } });

    for (const account of accounts) {
      const sessions = account.whatsappSessions || [];
      for (const session of sessions) {
        if (!session.alertEmail || !session.tokenExpiresAt) continue;

        const expiresAt = new Date(session.tokenExpiresAt).getTime();
        const daysRemaining = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));

        // Alerta cuando quedan 7 días o menos, o ya expiró
        if (daysRemaining <= 7) {
          const statusLabel = daysRemaining < 0 ? 'expirado' : daysRemaining === 0 ? 'expira hoy' : `expira en ${daysRemaining} días`;
          const subject = `Alerta: token de WhatsApp ${statusLabel}`;
          const text = `Hola,

El token de acceso de WhatsApp para el número ${session.phoneNumber || session.phoneNumberId} ${statusLabel}.

Por favor, renueva el token desde el panel de Automatizaciones para evitar interrupciones.

Saludos,
Lyrium`;

          try {
            const sent = await sendWhatsAppAlertEmail(account, session.alertEmail, subject, text);
            if (sent) {
              console.log(`[WA Alert] Enviada alerta a ${session.alertEmail} para ${session.phoneNumberId}`);
            } else {
              console.error(`[WA Alert] No se pudo enviar alerta a ${session.alertEmail} para ${session.phoneNumberId}`);
            }
          } catch (err) {
            console.error(`[WA Alert] Error enviando alerta a ${session.alertEmail}:`, err);
          }
        }
      }
    }
  } catch (err) {
    console.error('[WA Alert] Error en scheduler:', err);
  }
}

export function startWhatsAppAlertScheduler(): void {
  runWhatsAppAlertScheduler().catch(err =>
    console.error('[WA Alert] Error en ejecución inicial:', err)
  );

  setInterval(() => {
    runWhatsAppAlertScheduler().catch(err =>
      console.error('[WA Alert] Error en ejecución periódica:', err)
    );
  }, INTERVAL_MS);
}
