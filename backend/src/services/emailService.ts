import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import nodemailer from 'nodemailer';
import { EmailConfig } from '../models/EmailConfig.js';

// ============= FISCAL EMAIL CONFIG (legacy) =============

interface EmailConfigData {
  accountId: string;
  smtpServer: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
}

export async function getEmailConfig(accountId: string): Promise<EmailConfigData | null> {
  try {
    const doc = await EmailConfig.findOne({ accountId });
    if (!doc) return null;
    return {
      accountId: doc.accountId,
      smtpServer: doc.smtpServer,
      smtpPort: doc.smtpPort,
      smtpUser: doc.smtpUser,
      smtpPassword: doc.smtpPassword,
    };
  } catch {
    return null;
  }
}

export async function saveEmailConfig(config: EmailConfigData): Promise<void> {
  await EmailConfig.findOneAndUpdate(
    { accountId: config.accountId },
    {
      $set: {
        accountId: config.accountId,
        smtpServer: config.smtpServer,
        smtpPort: config.smtpPort,
        smtpUser: config.smtpUser,
        smtpPassword: config.smtpPassword,
      },
      $setOnInsert: { _id: config.accountId },
    },
    { upsert: true, returnDocument: 'after' },
  );
}

// Platform configs (host/port pre-saved per platform)
export const PLATFORM_CONFIGS: Record<string, { imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; secure?: boolean }> = {
  gmail:     { imapHost: 'imap.gmail.com',           imapPort: 993, smtpHost: 'smtp.gmail.com',             smtpPort: 587 },
  outlook:   { imapHost: 'outlook.office365.com',     imapPort: 993, smtpHost: 'smtp.office365.com',           smtpPort: 587 },
  yahoo:     { imapHost: 'imap.mail.yahoo.com',       imapPort: 993, smtpHost: 'smtp.mail.yahoo.com',          smtpPort: 587 },
  icloud:    { imapHost: 'imap.mail.me.com',           imapPort: 993, smtpHost: 'smtp.mail.me.com',             smtpPort: 587 },
  zoho:      { imapHost: 'imap.zoho.com',              imapPort: 993, smtpHost: 'smtp.zoho.com',                smtpPort: 587 },
  hostinger: { imapHost: 'imap.hostinger.com',         imapPort: 993, smtpHost: 'smtp.hostinger.com',           smtpPort: 465, secure: true },
  ionos:     { imapHost: 'imap.ionos.es',              imapPort: 993, smtpHost: 'smtp.ionos.es',                smtpPort: 587 },
  ovh:       { imapHost: 'ssl0.ovh.net',               imapPort: 993, smtpHost: 'ssl0.ovh.net',                 smtpPort: 465, secure: true },
  godaddy:   { imapHost: 'imap.secureserver.net',      imapPort: 993, smtpHost: 'smtpout.secureserver.net',     smtpPort: 465, secure: true },
};

export interface CuentaCorreoConfig {
  plataforma: string;
  correo: string;
  password: string;
}

export interface IncomingEmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  content: Buffer;
}

export interface IncomingEmail {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
  date: Date;
  messageId: string;
  references?: string;
  inReplyTo?: string;
  attachments?: IncomingEmailAttachment[];
}

interface PlatformConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  secure?: boolean;
}

function getPlatformConfig(plataforma: string, custom?: { smtpHost?: string; smtpPort?: number; imapHost?: string; imapPort?: number }): PlatformConfig {
  const key = plataforma.toLowerCase().replace(/\s+/g, '');
  if (key === 'custom' && custom) {
    return {
      imapHost: custom.imapHost || '',
      imapPort: custom.imapPort || 993,
      smtpHost: custom.smtpHost || '',
      smtpPort: custom.smtpPort || 587,
    };
  }
  return PLATFORM_CONFIGS[key] ?? PLATFORM_CONFIGS['gmail'];
}

// Fetch unread emails via IMAP
export function fetchUnreadEmails(cuenta: CuentaCorreoConfig): Promise<IncomingEmail[]> {
  const config = getPlatformConfig(cuenta.plataforma);

  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: cuenta.correo,
      password: cuenta.password,
      host: config.imapHost,
      port: config.imapPort,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
    });

    const emails: IncomingEmail[] = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) { imap.end(); return reject(err); }

        // Gmail: try primary category first, fallback to UNSEEN if it fails
        const isGmail = config.imapHost === 'imap.gmail.com';

        const doSearch = (criteria: any[]) => {
          imap.search(criteria, (searchErr, uids) => {
            if (searchErr) {
              // If Gmail X-GM-RAW fails, fallback to plain UNSEEN
              if (isGmail && criteria.length > 1) {
                console.warn('[Email] Gmail X-GM-RAW failed, falling back to UNSEEN');
                doSearch(['UNSEEN']);
                return;
              }
              imap.end(); return reject(searchErr);
            }
            handleUids(uids);
          });
        };

        const handleUids = (uids: number[]) => {
          if (!uids || uids.length === 0) { imap.end(); return resolve([]); }

          const f = imap.fetch(uids, { bodies: '', markSeen: true });
          let pending = uids.length;

          f.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream as any, (parseErr: Error | null, parsed: ParsedMail) => {
                if (!parseErr) {
                  const fromAddr = parsed.from?.value?.[0];
                  // Extract attachments (skip files > 10MB)
                  const incomingAttachments: IncomingEmailAttachment[] = [];
                  const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
                  if (parsed.attachments && parsed.attachments.length > 0) {
                    for (const att of parsed.attachments) {
                      if (att.content && att.filename && att.size <= MAX_ATTACHMENT_SIZE) {
                        incomingAttachments.push({
                          filename: att.filename,
                          mimeType: att.contentType || 'application/octet-stream',
                          size: att.size,
                          content: att.content,
                        });
                      } else if (att.size > MAX_ATTACHMENT_SIZE) {
                        console.warn(`[Email] Skipping attachment ${att.filename} (${(att.size / 1024 / 1024).toFixed(1)}MB > 10MB limit)`);
                      }
                    }
                  }
                  emails.push({
                    from: fromAddr?.address || '',
                    fromName: fromAddr?.name || fromAddr?.address || '',
                    to: cuenta.correo,
                    subject: parsed.subject || '(Sin asunto)',
                    body: parsed.text || (parsed.html ? parsed.html.replace(/<[^>]*>/g, '') : ''),
                    date: parsed.date || new Date(),
                    messageId: parsed.messageId || '',
                    references: typeof parsed.references === 'string'
                      ? parsed.references
                      : Array.isArray(parsed.references) ? parsed.references.join(' ') : undefined,
                    inReplyTo: parsed.inReplyTo as string | undefined,
                    attachments: incomingAttachments.length > 0 ? incomingAttachments : undefined,
                  });
                }
                pending--;
                if (pending === 0) { imap.end(); }
              });
            });
          });

          f.once('end', () => {
            setTimeout(() => { if (pending === 0) resolve(emails); }, 300);
          });

          f.once('error', (fetchErr: Error) => { imap.end(); reject(fetchErr); });
        };

        doSearch(isGmail ? [['X-GM-RAW', 'category:primary'], 'UNSEEN'] : ['UNSEEN']);
      });
    });

    imap.once('error', (imapErr: Error) => reject(imapErr));
    imap.once('end', () => { resolve(emails); });
    imap.connect();
  });
}

// Send email via SMTP (automation - uses CuentaCorreoConfig)
export async function sendEmailViaCuenta(
  cuenta: CuentaCorreoConfig,
  to: string,
  subject: string,
  body: string,
): Promise<string> {
  const config = getPlatformConfig(cuenta.plataforma);
  const useSecure = config.secure === true || config.smtpPort === 465;

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: useSecure,
    auth: { user: cuenta.correo, pass: cuenta.password },
  });

  try {
    const info = await transporter.sendMail({
      from: cuenta.correo,
      to,
      subject,
      text: body + '\n\n\u2014 Asistente del despacho',
    });
    return info.messageId;
  } finally {
    transporter.close();
  }
}

// Reply to an existing email thread
export async function replyToEmail(
  cuenta: CuentaCorreoConfig,
  to: string,
  subject: string,
  body: string,
  inReplyTo?: string,
  references?: string,
  attachments?: Array<{ filename: string; path: string }>,
): Promise<string> {
  const config = getPlatformConfig(cuenta.plataforma);
  const useSecure = config.secure === true || config.smtpPort === 465;

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: useSecure,
    auth: { user: cuenta.correo, pass: cuenta.password },
  });

  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  const headers: Record<string, string> = {};
  if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
  if (references) headers['References'] = references;

  try {
    const info = await transporter.sendMail({
      from: cuenta.correo,
      to,
      subject: replySubject,
      text: body + '\n\n\u2014 Asistente del despacho',
      headers,
      attachments: attachments?.map(a => ({ filename: a.filename, path: a.path })),
    });
    return info.messageId;
  } finally {
    transporter.close();
  }
}

// Send email via fiscal config (legacy - uses email_config.json)
export async function sendEmail(
  accountId: string,
  options: { to: string | string[]; subject: string; text: string; html?: string },
): Promise<boolean> {
  try {
    const config = await getEmailConfig(accountId);
    if (!config) {
      console.error('No email configuration found for account:', accountId);
      return false;
    }
    const transporter = nodemailer.createTransport({
      host: config.smtpServer,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: { user: config.smtpUser, pass: config.smtpPassword },
    });
    await transporter.sendMail({
      from: config.smtpUser,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return true;
  } catch (error) {
    console.error('Error sending email (fiscal):', error);
    return false;
  }
}