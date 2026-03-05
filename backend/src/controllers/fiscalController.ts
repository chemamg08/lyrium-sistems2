import { Request, Response } from 'express';
import { sendEmail, getEmailConfig, saveEmailConfig } from '../services/emailService.js';
import { callFiscalAI, streamFiscalAI, getAiClient } from '../services/aiService.js';
import { generateFiscalReportPDF } from '../services/pdfService.js';
import { getAccountSpecialties } from '../services/specialtiesService.js';
import { getLegalContextForAccount, buildCountryLegalSystemPrompt , getAccountCountry } from '../services/legalKnowledgeService.js';
import { hasLegalIntent } from '../services/legalIntentService.js';
import { FiscalProfile } from '../models/FiscalProfile.js';
import { FiscalAlert } from '../models/FiscalAlert.js';
import { FiscalChat } from '../models/FiscalChat.js';
import { Calculation } from '../models/Calculation.js';
import { Client } from '../models/Client.js';

// Country code → name map for fiscal AI
const COUNTRY_NAMES: Record<string, string> = {
  ES: 'España', DE: 'Alemania', FR: 'Francia', IT: 'Italia', PT: 'Portugal',
  NL: 'Países Bajos', BE: 'Bélgica', AT: 'Austria', CH: 'Suiza', PL: 'Polonia',
  CZ: 'República Checa', SK: 'Eslovaquia', HU: 'Hungría', HR: 'Croacia',
  DK: 'Dinamarca', SE: 'Suecia', NO: 'Noruega', FI: 'Finlandia',
  IE: 'Irlanda', LU: 'Luxemburgo', CY: 'Chipre', MT: 'Malta',
  LV: 'Letonia', AU: 'Australia', CA: 'Canadá', GB: 'Reino Unido',
};

function getCountryName(code: string): string {
  return COUNTRY_NAMES[(code || 'ES').toUpperCase()] || code;
}

// ============= FISCAL PROFILES =============

export async function getAllProfiles(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const profiles = await FiscalProfile.find({ accountId });
    res.json(profiles.map(p => p.toJSON()));
  } catch (error) {
    console.error('Error reading profiles:', error);
    res.status(500).json({ error: 'Failed to read profiles' });
  }
}

export async function getProfileByClientId(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { clientId } = req.params;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const profile = await FiscalProfile.findOne({ clientId, accountId });
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json(profile.toJSON());
  } catch (error) {
    console.error('Error reading profile:', error);
    res.status(500).json({ error: 'Failed to read profile' });
  }
}

export async function createOrUpdateProfile(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const now = new Date().toISOString();
    const existing = await FiscalProfile.findOne({
      clientId: req.body.clientId,
      accountId,
    });

    if (existing) {
      // Update existing profile
      Object.assign(existing, req.body, { accountId, updatedAt: now });
      await existing.save();
      res.json(existing.toJSON());
    } else {
      // Create new profile
      const newProfile = await FiscalProfile.create({
        _id: Date.now().toString(),
        ...req.body,
        accountId,
        createdAt: now,
        updatedAt: now,
      });
      res.status(201).json(newProfile.toJSON());
    }
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({ error: 'Failed to save profile' });
  }
}

export async function deleteProfile(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { id } = req.params;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    await FiscalProfile.deleteOne({ _id: id, accountId });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting profile:', error);
    res.status(500).json({ error: 'Failed to delete profile' });
  }
}

// ============= FISCAL ALERTS =============

export async function getAllAlerts(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const alerts = await FiscalAlert.find({ accountId });
    res.json(alerts.map(a => a.toJSON()));
  } catch (error) {
    console.error('Error reading alerts:', error);
    res.status(500).json({ error: 'Failed to read alerts' });
  }
}

export async function getAlertById(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { id } = req.params;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const alert = await FiscalAlert.findOne({ _id: id, accountId });
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json(alert.toJSON());
  } catch (error) {
    console.error('Error reading alert:', error);
    res.status(500).json({ error: 'Failed to read alert' });
  }
}

export async function createAlert(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const now = new Date().toISOString();
    const newAlert = await FiscalAlert.create({
      _id: Date.now().toString(),
      ...req.body,
      accountId,
      estado: 'pendiente',
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json(newAlert.toJSON());
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
}

export async function updateAlert(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { id } = req.params;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const alert = await FiscalAlert.findOne({ _id: id, accountId });
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const now = new Date().toISOString();
    Object.assign(alert, req.body, { _id: id, accountId, updatedAt: now });
    await alert.save();

    res.json(alert.toJSON());
  } catch (error) {
    console.error('Error updating alert:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
}

export async function deleteAlert(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { id } = req.params;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    await FiscalAlert.deleteOne({ _id: id, accountId });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
}

export async function sendAlertNow(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { id } = req.params;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const alert = await FiscalAlert.findOne({ _id: id, accountId });
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const emails = alert.destinatarios.map(d => d.email);

    const success = await sendEmail(accountId, {
      to: emails,
      subject: alert.asunto,
      text: alert.mensaje,
      html: `<p>${alert.mensaje.replace(/\n/g, '<br>')}</p>`,
    });

    if (success) {
      alert.estado = 'enviado';
      alert.updatedAt = new Date().toISOString();
      await alert.save();
      res.json({ success: true, message: 'Alert sent successfully' });
    } else {
      alert.estado = 'error';
      alert.updatedAt = new Date().toISOString();
      await alert.save();
      res.status(500).json({ error: 'Failed to send email' });
    }
  } catch (error) {
    console.error('Error sending alert:', error);
    res.status(500).json({ error: 'Failed to send alert' });
  }
}

// ============= REVIEW TODAY ALERTS =============

export async function reviewTodayAlerts(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const alerts = await FiscalAlert.find({ accountId });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueAlerts = alerts.filter(a => {
      if (a.estado === 'enviado' && a.repeticion === 'una vez') return false;
      const fechaEnvio = new Date(a.fechaEnvio);
      fechaEnvio.setHours(0, 0, 0, 0);
      return fechaEnvio <= today && a.estado === 'pendiente';
    });

    let sent = 0;
    let failed = 0;

    for (const alert of dueAlerts) {
      const emails = alert.destinatarios.map(d => d.email);

      const success = await sendEmail(accountId, {
        to: emails,
        subject: alert.asunto,
        text: alert.mensaje,
        html: `<p>${alert.mensaje.replace(/\n/g, '<br>')}</p>`,
      });

      if (success) {
        sent++;
        if (alert.repeticion === 'una vez') {
          alert.estado = 'enviado';
        } else {
          const next = new Date(alert.fechaEnvio);
          if (alert.repeticion === 'diaria') next.setDate(next.getDate() + 1);
          else if (alert.repeticion === 'semanal') next.setDate(next.getDate() + 7);
          else if (alert.repeticion === 'mensual') next.setMonth(next.getMonth() + 1);
          else if (alert.repeticion === 'trimestral') next.setMonth(next.getMonth() + 3);
          else if (alert.repeticion === 'anual') next.setFullYear(next.getFullYear() + 1);
          alert.fechaEnvio = next.toISOString().split('T')[0];
          alert.estado = 'pendiente';
        }
      } else {
        failed++;
        alert.estado = 'error';
      }
      alert.updatedAt = new Date().toISOString();
      await alert.save();
    }

    res.json({ success: true, sent, failed, total: dueAlerts.length });
  } catch (error) {
    console.error('Error reviewing alerts:', error);
    res.status(500).json({ error: 'Failed to review alerts' });
  }
}

// ============= EMAIL CONFIG =============

export async function getEmailConfigHandler(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const config = await getEmailConfig(accountId);
    if (!config) {
      return res.status(404).json({ error: 'Email configuration not found' });
    }

    res.json(config);
  } catch (error) {
    console.error('Error reading email config:', error);
    res.status(500).json({ error: 'Failed to read email config' });
  }
}

export async function saveEmailConfigHandler(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const config = {
      accountId,
      ...req.body,
    };

    await saveEmailConfig(config);
    res.json({ success: true, config });
  } catch (error) {
    console.error('Error saving email config:', error);
    res.status(500).json({ error: 'Failed to save email config' });
  }
}

// ============= FISCAL CHATS =============

// Account-level chat (no client required)
export async function getAccountChat(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const clientId = 'general'; // Fixed identifier for account-level chat
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    let chat = await FiscalChat.findOne({ clientId, accountId });
    
    if (!chat) {
      const user = (req as any).user;
      chat = await FiscalChat.create({
        _id: Date.now().toString(),
        clientId,
        accountId,
        createdBy: user?.userId || '',
        title: '',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    
    res.json(chat.toJSON());
  } catch (error) {
    console.error('Error reading account chat:', error);
    res.status(500).json({ error: 'Failed to read chat' });
  }
}

export async function sendAccountMessage(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const clientId = 'general';
    const { message } = req.body;
    
    if (!accountId || !message) {
      return res.status(400).json({ error: 'Account ID and message are required' });
    }

    let chat = await FiscalChat.findOne({ clientId, accountId });
    
    if (!chat) {
      chat = await FiscalChat.create({
        _id: Date.now().toString(),
        clientId,
        accountId,
        title: '',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const userMessage = {
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
    };
    chat.messages.push(userMessage);

    const selectedSpecialties = await getAccountSpecialties(accountId);
    let legalCountryPrompt = '';
    if (hasLegalIntent(message, selectedSpecialties)) {
      const legalContext = await getLegalContextForAccount(accountId, message, selectedSpecialties, 5000, 'fiscal');
      legalCountryPrompt = buildCountryLegalSystemPrompt(legalContext.country, legalContext.context);
    }

    const aiResponse = await callFiscalAI(
      null,
      chat.messages as any,
      selectedSpecialties,
      legalCountryPrompt || undefined,
      undefined,
      getCountryName(await getAccountCountry(accountId))
    );

    const aiMessage = {
      role: 'assistant' as const,
      content: aiResponse,
      timestamp: new Date().toISOString(),
    };
    chat.messages.push(aiMessage);
    chat.updatedAt = new Date().toISOString();

    await chat.save();
    res.json(aiMessage);
  } catch (error) {
    console.error('Error sending account message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
}

export async function clearAccountChat(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const clientId = 'general';
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const chat = await FiscalChat.findOne({ clientId, accountId });
    
    if (chat) {
      chat.messages = [];
      chat.updatedAt = new Date().toISOString();
      await chat.save();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing account chat:', error);
    res.status(500).json({ error: 'Failed to clear chat' });
  }
}

export async function getChatByClientId(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { clientId } = req.params;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    let chat = await FiscalChat.findOne({ clientId, accountId });
    
    if (!chat) {
      // Create new empty chat
      chat = await FiscalChat.create({
        _id: Date.now().toString(),
        clientId,
        accountId,
        title: '',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    
    res.json(chat.toJSON());
  } catch (error) {
    console.error('Error reading chat:', error);
    res.status(500).json({ error: 'Failed to read chat' });
  }
}

export async function sendMessage(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { clientId } = req.params;
    const { message } = req.body;
    
    if (!accountId || !message) {
      return res.status(400).json({ error: 'Account ID and message are required' });
    }

    // Get fiscal profile for context
    const profile = await FiscalProfile.findOne({ clientId, accountId });

    // Get or create chat
    let chat = await FiscalChat.findOne({ clientId, accountId });
    
    if (!chat) {
      chat = await FiscalChat.create({
        _id: Date.now().toString(),
        clientId,
        accountId,
        title: '',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Add user message
    const userMessage = {
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
    };
    chat.messages.push(userMessage);

    const selectedSpecialties = await getAccountSpecialties(accountId);
    let legalCountryPrompt = '';
    if (hasLegalIntent(message, selectedSpecialties)) {
      const legalContext = await getLegalContextForAccount(accountId, message, selectedSpecialties, 5000, 'fiscal');
      legalCountryPrompt = buildCountryLegalSystemPrompt(legalContext.country, legalContext.context);
    }

    // Get AI response
    const aiResponse = await callFiscalAI(
      profile || null,
      chat.messages as any,
      selectedSpecialties,
      legalCountryPrompt || undefined,
      undefined,
      getCountryName(await getAccountCountry(accountId))
    );

    // Add AI message
    const aiMessage = {
      role: 'assistant' as const,
      content: aiResponse,
      timestamp: new Date().toISOString(),
    };
    chat.messages.push(aiMessage);
    chat.updatedAt = new Date().toISOString();

    await chat.save();
    res.json(aiMessage);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
}

export async function clearChat(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { clientId } = req.params;
    
    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const chat = await FiscalChat.findOne({ clientId, accountId });
    
    if (chat) {
      chat.messages = [];
      chat.updatedAt = new Date().toISOString();
      await chat.save();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing chat:', error);
    res.status(500).json({ error: 'Failed to clear chat' });
  }
}

// ============= FISCAL CHATS (multi-chat system) =============

export async function listFiscalChats(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const clientIdParam = req.query.clientId as string | undefined;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const isGeneral = !clientIdParam || clientIdParam === 'null' || clientIdParam === '';
    let filter: any = { accountId };
    const user = (req as any).user;
    if (user?.type === 'subaccount') {
      filter.createdBy = user.userId;
    }
    if (isGeneral) {
      filter.$or = [
        { clientId: { $exists: false } },
        { clientId: null },
        { clientId: '' },
        { clientId: 'general' },
      ];
    } else {
      filter.clientId = clientIdParam;
    }

    const chats = await FiscalChat.find(filter).sort({ updatedAt: -1 });

    const listItems = chats.map(c => ({
      id: c._id,
      title: c.title || new Date(c.createdAt).toLocaleDateString('es-ES'),
      clientId: c.clientId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
    }));

    res.json(listItems);
  } catch (error) {
    console.error('Error listing fiscal chats:', error);
    res.status(500).json({ error: 'Failed to list chats' });
  }
}

export async function createFiscalChat(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { clientId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const effectiveClientId: string = clientId || 'general';
    const dateStr = new Date().toLocaleDateString('es-ES');

    const existingChats = await FiscalChat.find({
      accountId,
      clientId: effectiveClientId,
    });
    const sameDaySameClient = existingChats.filter(c => {
      const t = c.title || '';
      return t === dateStr || t.startsWith(dateStr + ' (');
    });

    const finalTitle = sameDaySameClient.length === 0
      ? dateStr
      : `${dateStr} (${sameDaySameClient.length + 1})`;

    const user = (req as any).user;
    const newChat = await FiscalChat.create({
      _id: Date.now().toString(),
      accountId,
      createdBy: user?.userId || '',
      clientId: effectiveClientId,
      title: finalTitle,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.status(201).json({
      id: newChat._id,
      title: newChat.title,
      clientId: newChat.clientId,
      createdAt: newChat.createdAt,
      updatedAt: newChat.updatedAt,
      messageCount: 0,
    });
  } catch (error) {
    console.error('Error creating fiscal chat:', error);
    res.status(500).json({ error: 'Failed to create chat' });
  }
}

export async function getFiscalChatById(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { id } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const chat = await FiscalChat.findOne({ _id: id, accountId });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json(chat.toJSON());
  } catch (error) {
    console.error('Error getting fiscal chat:', error);
    res.status(500).json({ error: 'Failed to get chat' });
  }
}

export async function deleteFiscalChat(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { id } = req.params;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const result = await FiscalChat.deleteOne({ _id: id, accountId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting fiscal chat:', error);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
}

export async function sendFiscalChatMessage(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { id } = req.params;
    const { message } = req.body;

    if (!accountId || !message) {
      return res.status(400).json({ error: 'Account ID and message are required' });
    }

    const chat = await FiscalChat.findOne({ _id: id, accountId });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const userMessage = {
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
    };
    chat.messages.push(userMessage);

    // Build client context if a client is linked to this chat
    let clientContext: string | undefined;
    if (chat.clientId && chat.clientId !== 'general') {
      try {
        const client = await Client.findById(chat.clientId);

        if (client) {
          const typeLabels: Record<string, string> = {
            asalariado: 'Employee',
            autonomo: 'Autonomo',
            empresa: 'Company',
          };

          const fieldLabels: Record<string, string> = {
            salarioBruto: 'Salario bruto anual',
            retencionesEmpresa: 'Retenciones empresa',
            planPensiones: 'Plan de pensiones',
            facturacionTotal: 'Facturacion total anual',
            gastosDeducibles: 'Gastos deducibles',
            ivaRepercutido: 'Output VAT',
            ivaSoportado: 'Input VAT',
            ingresosTotal: 'Ingresos totales',
            gastosTotal: 'Gastos totales',
            ivaRepercutidoEmp: 'IVA repercutido empresa',
            ivaSoportadoEmp: 'IVA soportado empresa',
          };

          let ctx = 'INFORMACION DEL CLIENTE ACTIVO:\n';
          ctx += `- Nombre: ${client.name}\n`;
          if (client.email) ctx += `- Email: ${client.email}\n`;
          if (client.clientType) {
            ctx += `- Tipo: ${typeLabels[client.clientType] || client.clientType}\n`;
          }

          if (client.fiscalInfo && Object.keys(client.fiscalInfo).length > 0) {
            ctx += '- Datos fiscales guardados:\n';
            for (const [k, v] of Object.entries(client.fiscalInfo)) {
              if (v !== null && v !== undefined && v !== '') {
                const label = fieldLabels[k] || k;
                ctx += `  * ${label}: ${v} EUR\n`;
              }
            }
          }

          // Load calculos for this client (last 3 most recent)
          try {
            const clientCalculos = await Calculation.find({ clientId: chat.clientId })
              .sort({ createdAt: -1 })
              .limit(3);

            if (clientCalculos.length > 0) {
              ctx += '\nCALCULOS FISCALES GUARDADOS (mas recientes):\n';
              for (const calc of clientCalculos) {
                const fecha = new Date(calc.createdAt).toLocaleDateString('es-ES');
                ctx += `\n* ${calc.label || 'Calculo'} (${fecha})\n`;
                if (calc.resultado !== undefined && calc.etiquetaTotal) {
                  const signo = calc.resultado > 0 ? '+' : '';
                  ctx += `  Resultado - ${calc.etiquetaTotal}: ${signo}${calc.resultado.toFixed(2)} EUR\n`;
                }
                if (Array.isArray(calc.desglose) && calc.desglose.length > 0) {
                  ctx += '  Desglose:\n';
                  for (const line of calc.desglose) {
                    if (line.valor !== 0) {
                      const signo = line.valor > 0 ? '+' : '';
                      ctx += `    - ${line.concepto}: ${signo}${line.valor.toFixed(2)} EUR\n`;
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error('Error loading calculos for context:', e);
          }

          ctx += '\nUsa esta informacion para personalizar tu asesoramiento fiscal a este cliente.';
          clientContext = ctx;
        }
      } catch (e) {
        console.error('Error loading client context:', e);
      }
    }

    const selectedSpecialties = await getAccountSpecialties(accountId);
    let legalCountryPrompt = '';
    if (hasLegalIntent(message, selectedSpecialties)) {
      const legalContext = await getLegalContextForAccount(
        accountId, message, selectedSpecialties, 5000, 'fiscal'
      );
      legalCountryPrompt = buildCountryLegalSystemPrompt(legalContext.country, legalContext.context);
    }

    const aiResponse = await callFiscalAI(
      null,
      chat.messages as any,
      selectedSpecialties,
      legalCountryPrompt || undefined,
      clientContext,
      getCountryName(await getAccountCountry(accountId))
    );

    const aiMessage = {
      role: 'assistant' as const,
      content: aiResponse,
      timestamp: new Date().toISOString(),
    };
    chat.messages.push(aiMessage);
    chat.updatedAt = new Date().toISOString();

    await chat.save();
    res.json(aiMessage);
  } catch (error) {
    console.error('Error sending fiscal chat message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
}

export async function streamFiscalChatMessage(req: Request, res: Response) {
  try {
    const accountId = req.headers['x-account-id'] as string;
    const { id } = req.params;
    const { message } = req.body;
    if (!accountId || !message) return res.status(400).json({ error: 'Account ID and message are required' });

    const chat = await FiscalChat.findOne({ _id: id, accountId });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const userMessage = { role: 'user' as const, content: message, timestamp: new Date().toISOString() };
    chat.messages.push(userMessage);
    await chat.save();

    const accountCountry = await getAccountCountry(accountId);
    const accountCountryName = getCountryName(accountCountry);

    // Fiscal info field labels grouped by category
    const FISCAL_FIELD_LABELS: Record<string, { label: string; category: string; isMoney?: boolean }> = {
      // Identification
      nif: { label: 'NIF / Tax ID', category: 'Identificación' },
      comunidadAutonoma: { label: 'Comunidad Autónoma / Region', category: 'Identificación' },
      fechaNacimiento: { label: 'Fecha de nacimiento', category: 'Identificación' },
      // Employment
      tipoContrato: { label: 'Tipo de contrato', category: 'Situación laboral' },
      // Self-employed activity
      fechaAltaHacienda: { label: 'Fecha alta en Hacienda / Tax Authority', category: 'Actividad' },
      altaRETA: { label: 'Alta RETA / Self-employed registration', category: 'Actividad' },
      fechaAltaRETA: { label: 'Fecha alta RETA', category: 'Actividad' },
      epigrafeIAE: { label: 'Epígrafe IAE / Activity code', category: 'Actividad' },
      descripcionActividad: { label: 'Descripción de actividad', category: 'Actividad' },
      variasActividades: { label: 'Varias actividades', category: 'Actividad' },
      cnae: { label: 'CNAE', category: 'Actividad' },
      // Tax regime
      regimenIRPF: { label: 'Régimen IRPF / Income Tax regime', category: 'Régimen fiscal' },
      regimenIVA: { label: 'Régimen IVA / VAT regime', category: 'Régimen fiscal' },
      prorrata: { label: 'Prorrata', category: 'Régimen fiscal' },
      frecuenciaIVA: { label: 'Frecuencia IVA / VAT frequency', category: 'Régimen fiscal' },
      modelo130: { label: 'Modelo 130 / Quarterly income tax', category: 'Régimen fiscal' },
      retencionesFacturas: { label: 'Retenciones en facturas / Invoice withholdings', category: 'Régimen fiscal' },
      retencionesProfesionales: { label: 'Retenciones profesionales', category: 'Régimen fiscal' },
      // Operations
      tieneTrabajadores: { label: 'Tiene trabajadores', category: 'Operaciones' },
      operacionesIntracomunitarias: { label: 'Operaciones intracomunitarias / EU operations', category: 'Operaciones' },
      // Personal situation
      estadoCivil: { label: 'Estado civil', category: 'Situación personal' },
      numHijos: { label: 'Número de hijos', category: 'Situación personal' },
      discapacidad: { label: 'Discapacidad', category: 'Situación personal' },
      pctDiscapacidad: { label: 'Porcentaje discapacidad', category: 'Situación personal' },
      declaracionConjunta: { label: 'Declaración conjunta / Joint filing', category: 'Situación personal' },
      rentasCapital: { label: 'Rentas de capital / Capital income', category: 'Situación personal', isMoney: true },
      // Company data
      tipoSociedad: { label: 'Tipo de sociedad / Company type', category: 'Datos empresa' },
      fechaConstitucion: { label: 'Fecha constitución', category: 'Datos empresa' },
      fechaInicioActividad: { label: 'Fecha inicio actividad', category: 'Datos empresa' },
      cnaeEmpresa: { label: 'CNAE empresa', category: 'Datos empresa' },
      descripcionActividadEmpresa: { label: 'Descripción actividad empresa', category: 'Datos empresa' },
      variasActividadesEmpresa: { label: 'Varias actividades empresa', category: 'Datos empresa' },
      numEmpleados: { label: 'Número de empleados', category: 'Datos empresa' },
      tipoIS: { label: 'Tipo IS / Corporate tax type', category: 'Datos empresa' },
      reducidaDimension: { label: 'Entidad reducida dimensión / SME', category: 'Datos empresa' },
      grupoEmpresarial: { label: 'Grupo empresarial', category: 'Datos empresa' },
      consolidacionFiscal: { label: 'Consolidación fiscal', category: 'Datos empresa' },
      perdidasAnteriores: { label: 'Pérdidas anteriores / Prior losses', category: 'Datos empresa' },
      concurso: { label: 'Concurso de acreedores / Insolvency', category: 'Datos empresa' },
      regimenIVAEmpresa: { label: 'Régimen IVA empresa', category: 'Datos empresa' },
      proEmpresa: { label: 'Prorrata empresa', category: 'Datos empresa' },
      intracomEmpresa: { label: 'Op. intracomunitarias empresa', category: 'Datos empresa' },
      frecuenciaIVAEmpresa: { label: 'Frecuencia IVA empresa', category: 'Datos empresa' },
      trabajadoresEmpresa: { label: 'Trabajadores empresa', category: 'Datos empresa' },
      retencionesModelo111: { label: 'Retenciones Modelo 111', category: 'Datos empresa' },
      reparteDividendos: { label: 'Reparte dividendos', category: 'Datos empresa' },
      observaciones: { label: 'Observaciones', category: 'Notas' },
    };

    let clientContext: string | undefined;
    if (chat.clientId && chat.clientId !== 'general') {
      try {
        const client = await Client.findById(chat.clientId);
        if (client) {
          const typeLabels: Record<string, string> = {
            asalariado: 'Asalariado / Employee',
            autonomo: 'Autónomo / Self-employed',
            empresa: 'Empresa / Company',
            particular: 'Particular / Individual',
          };
          let ctx = `INFORMACION DEL CLIENTE ACTIVO:\n- Nombre: ${client.name}\n`;
          if (client.email) ctx += `- Email: ${client.email}\n`;
          if (client.clientType) ctx += `- Tipo: ${typeLabels[client.clientType] || client.clientType}\n`;

          if (client.fiscalInfo && typeof client.fiscalInfo === 'object') {
            const grouped: Record<string, string[]> = {};
            for (const [k, v] of Object.entries(client.fiscalInfo)) {
              if (v === null || v === undefined || v === '') continue;
              const meta = FISCAL_FIELD_LABELS[k];
              const label = meta?.label || k;
              const category = meta?.category || 'Otros';
              if (!grouped[category]) grouped[category] = [];
              grouped[category].push(`  * ${label}: ${v}`);
            }
            if (Object.keys(grouped).length > 0) {
              ctx += '- Información fiscal del cliente:\n';
              for (const [cat, lines] of Object.entries(grouped)) {
                ctx += `  [${cat}]\n${lines.join('\n')}\n`;
              }
            }
          }

          ctx += `\nUsa esta información para personalizar tu asesoramiento fiscal. País de la cuenta: ${accountCountryName}.`;
          clientContext = ctx;
        }
      } catch (e) { /* ignore */ }
    }

    const selectedSpecialties = await getAccountSpecialties(accountId);
    let legalCountryPrompt = '';
    if (hasLegalIntent(message, selectedSpecialties)) {
      const legalContext = await getLegalContextForAccount(accountId, message, selectedSpecialties, 5000, 'fiscal');
      legalCountryPrompt = buildCountryLegalSystemPrompt(legalContext.country, legalContext.context);
    }

    const fullText = await streamFiscalAI(res, null, chat.messages as any, selectedSpecialties, legalCountryPrompt || undefined, clientContext, accountCountryName, accountCountry);

    const aiMessage = { role: 'assistant' as const, content: fullText, timestamp: new Date().toISOString() };
    chat.messages.push(aiMessage);
    chat.updatedAt = new Date().toISOString();
    await chat.save();
  } catch (error) {
    console.error('Error streaming fiscal chat:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to send message' });
  }
}

// ============= FISCAL PDF EXPORT =============
export async function exportFiscalChatPDF(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const accountId = (req.headers['x-account-id'] as string) || (req.query.accountId as string);
    if (!accountId) return res.status(401).json({ error: 'No account ID provided' });

    // Load chat
    const chat = await FiscalChat.findOne({ _id: id, accountId });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    // Load client info if available
    let clientName = '';
    let clientType = '';
    if (chat.clientId && chat.clientId !== 'general') {
      try {
        const client = await Client.findById(chat.clientId);
        if (client) {
          clientName = client.name || '';
          const typeLabels: Record<string, string> = {
            asalariado: 'Asalariado', autonomo: 'Autónomo', empresa: 'Empresa', particular: 'Particular',
          };
          clientType = typeLabels[client.clientType] || client.clientType || '';
        }
      } catch { /* ignore */ }
    }

    const accountCountry = await getAccountCountry(accountId);
    const countryName = getCountryName(accountCountry);

    // Ask AI to extract structured fiscal data from the conversation
    const extractionPrompt = `Analiza TODA la conversación fiscal anterior y extrae un resumen estructurado de TODOS los cálculos de impuestos realizados, usando las ÚLTIMAS cifras corregidas por el usuario (si hubo correcciones, ignora las cifras anteriores).

Devuelve SOLO un JSON válido con esta estructura exacta (sin texto adicional, sin markdown, sin \`\`\`json):
{
  "fiscalYear": "2025",
  "summary": "Breve resumen de la situación fiscal analizada",
  "sections": [
    {
      "title": "Nombre del impuesto o sección (ej: Impuesto de Sociedades, IRPF Nóminas, IVA, Seguridad Social, etc.)",
      "items": [
        { "concept": "Nombre del concepto", "base": "Base imponible (con moneda)", "rate": "Tipo o porcentaje aplicado", "amount": "Cuota/Importe resultante (con moneda)", "note": "Nota opcional breve" }
      ],
      "subtotal": "Subtotal de la sección (con moneda)"
    }
  ],
  "totalTaxes": "Total de todos los impuestos (con moneda)",
  "netResult": "Resultado neto final si aplica (con moneda)",
  "recommendations": ["Recomendación 1", "Recomendación 2"]
}

IMPORTANTE:
- Incluye TODAS las secciones de impuestos calculados en la conversación
- Usa las cifras más recientes si el usuario hizo correcciones
- Cada sección es un tipo de impuesto o cálculo diferente
- Si se calcularon nóminas, incluye detalles por empleado o agregados
- Incluye la moneda en los importes`;

    const messages = [
      ...chat.messages.map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: extractionPrompt }
    ];

    const response = await getAiClient().chat.completions.create({
      model: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
      messages: [
        { role: 'system', content: `Eres un asistente que extrae datos fiscales de conversaciones y los devuelve en JSON estructurado. País: ${countryName}. Responde SOLO con JSON válido, sin ningún otro texto, sin bloques de código markdown.` },
        ...messages
      ],
      max_tokens: 4000,
      temperature: 0.1
    });

    let rawContent = (response.choices[0].message.content || '').trim();
    
    // Strip markdown code blocks if present
    if (rawContent.startsWith('```')) {
      rawContent = rawContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    // Strip <think> blocks if present
    rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    let reportData: any;
    try {
      reportData = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error('Failed to parse AI fiscal report JSON:', rawContent);
      return res.status(500).json({ error: 'Failed to generate structured report' });
    }

    // Generate PDF
    const pdfDoc = generateFiscalReportPDF({
      clientName,
      clientType,
      country: countryName,
      countryCode: accountCountry,
      fiscalYear: reportData.fiscalYear || String(new Date().getFullYear()),
      summary: reportData.summary,
      sections: reportData.sections || [],
      totalTaxes: reportData.totalTaxes,
      netResult: reportData.netResult,
      recommendations: reportData.recommendations,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fiscal_report_${id}.pdf"`);
    pdfDoc.pipe(res);
  } catch (error) {
    console.error('Error exporting fiscal PDF:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to export PDF' });
  }
}
