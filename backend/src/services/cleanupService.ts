import Stripe from 'stripe';
import dotenv from 'dotenv';
import { Subscription } from '../models/Subscription.js';
import { Account } from '../models/Account.js';
import { Client } from '../models/Client.js';
import { Chat } from '../models/Chat.js';
import { AssistantChat } from '../models/AssistantChat.js';
import { FiscalChat } from '../models/FiscalChat.js';
import { ContractChat } from '../models/ContractChat.js';
import { DefenseChat } from '../models/DefenseChat.js';
import { DocumentSummariesChat } from '../models/DocumentSummariesChat.js';
import { Automation } from '../models/Automation.js';
import { FiscalAlert } from '../models/FiscalAlert.js';
import { Stat } from '../models/Stat.js';
import { Subaccount } from '../models/Subaccount.js';
import { Job } from '../models/Job.js';
import { Calculation } from '../models/Calculation.js';
import { FiscalProfile } from '../models/FiscalProfile.js';
import { Contract } from '../models/Contract.js';
import { GeneratedContract } from '../models/GeneratedContract.js';
import { EmailConfig } from '../models/EmailConfig.js';
import { WritingText } from '../models/WritingText.js';
import { SpecialtiesSettings } from '../models/SpecialtiesSettings.js';
import { SharedFile } from '../models/SharedFile.js';

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-02-25.clover',
});

const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
const INTERVAL_MS     = 20 * 60 * 60 * 1000;       // 20 horas

function isExpiredForDeletion(record: Record<string, any>): boolean {
  const now = Date.now();

  // Suscripción de pago vencida (status !== 'active' o period expirado)
  if (record.currentPeriodEnd) {
    const periodEnd = new Date(record.currentPeriodEnd).getTime();
    const isPaymentExpired =
      record.status !== 'active' && now - periodEnd > GRACE_PERIOD_MS;
    if (isPaymentExpired) return true;
  }

  // Periodo de prueba gratuito vencido
  if (record.trialEndDate) {
    const trialEnd = new Date(record.trialEndDate).getTime();
    const isTrialExpired =
      record.status !== 'active' && now - trialEnd > GRACE_PERIOD_MS;
    if (isTrialExpired) return true;
  }

  return false;
}

async function runCleanup(): Promise<void> {

  const subscriptions = await Subscription.find().lean();
  const expiredAccountIds = new Set<string>(
    subscriptions
      .filter(isExpiredForDeletion)
      .map((s) => s.accountId as string)
  );

  if (expiredAccountIds.size === 0) {
    return;
  }

  const ids = [...expiredAccountIds];

  // Cancel active Stripe subscriptions before deleting
  const expiredSubscriptions = subscriptions.filter(
    (s) => expiredAccountIds.has(s.accountId as string)
  );
  for (const sub of expiredSubscriptions) {
    if (sub.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      } catch (err: any) {
        // Ignore if already cancelled or not found
      }
    }
  }

  // Eliminar subscriptions expiradas
  await Subscription.deleteMany({ accountId: { $in: ids } });

  // Eliminar cuenta principal
  await Account.deleteMany({ _id: { $in: ids } });

  // Eliminar subaccounts (campo real es parentAccountId, no accountId)
  await Subaccount.deleteMany({
    $or: [
      { parentAccountId: { $in: ids } },
      { _id: { $in: ids } },
    ],
  });

  // Buscar clientIds de las cuentas eliminadas para borrar chats (Chat no tiene accountId, solo clientId)
  const clients = await Client.find({ accountId: { $in: ids } }).select('_id').lean();
  const clientIds = clients.map((c) => String(c._id));

  // Buscar contractChatIds para borrar GeneratedContracts (vinculados por chatId)
  const contractChats = await ContractChat.find({ accountId: { $in: ids } }).select('_id').lean();
  const contractChatIds = contractChats.map((c) => String(c._id));

  // Eliminar datos con campo accountId directo
  await Promise.all([
    Client.deleteMany({ accountId: { $in: ids } }),
    Chat.deleteMany({ clientId: { $in: clientIds } }),
    AssistantChat.deleteMany({ accountId: { $in: ids } }),
    FiscalChat.deleteMany({ accountId: { $in: ids } }),
    ContractChat.deleteMany({ accountId: { $in: ids } }),
    DefenseChat.deleteMany({ accountId: { $in: ids } }),
    DocumentSummariesChat.deleteMany({ accountId: { $in: ids } }),
    Automation.deleteMany({ accountId: { $in: ids } }),
    Calculation.deleteMany({ accountId: { $in: ids } }),
    FiscalProfile.deleteMany({ accountId: { $in: ids } }),
    FiscalAlert.deleteMany({ accountId: { $in: ids } }),
    Stat.deleteMany({ _id: { $in: ids } }),
    Job.deleteMany({ accountId: { $in: ids } }),
    Contract.deleteMany({ accountId: { $in: ids } }),
    GeneratedContract.deleteMany({ chatId: { $in: contractChatIds } }),
    EmailConfig.deleteMany({ accountId: { $in: ids } }),
    WritingText.deleteMany({ accountId: { $in: ids } }),
    SpecialtiesSettings.deleteMany({ accountId: { $in: ids } }),
    SharedFile.deleteMany({ senderId: { $in: ids } }),
  ]);

}

export function startCleanupWorker(): void {
  // Primera ejecución al arrancar el servidor
  runCleanup().catch((err) =>
    console.error('[cleanupService] Error en limpieza inicial:', err)
  );

  // Repetir cada 20 horas
  setInterval(() => {
    runCleanup().catch((err) =>
      console.error('[cleanupService] Error en limpieza periódica:', err)
    );
  }, INTERVAL_MS);
}
