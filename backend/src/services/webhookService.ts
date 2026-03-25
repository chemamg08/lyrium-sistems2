import crypto from 'crypto';
import { Webhook, WebhookEvent } from '../models/Webhook.js';

export async function dispatchWebhook(accountId: string, event: WebhookEvent, payload: Record<string, any>) {
  const webhooks = await Webhook.find({ accountId, isActive: true, events: event });

  for (const webhook of webhooks) {
    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');

    // Fire-and-forget with basic error handling
    fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Lyrium-Signature': signature,
        'X-Lyrium-Event': event,
      },
      body,
      signal: AbortSignal.timeout(10000),
    })
      .then(() => {
        webhook.lastTriggeredAt = new Date().toISOString();
        webhook.save().catch(() => {});
      })
      .catch((err) => {
        console.error(`Webhook delivery failed for ${webhook.url}:`, err.message);
      });
  }
}

export async function sendTestWebhook(webhookId: string, accountId: string) {
  const webhook = await Webhook.findOne({ _id: webhookId, accountId });
  if (!webhook) throw new Error('Webhook not found');

  const body = JSON.stringify({
    event: 'test',
    timestamp: new Date().toISOString(),
    data: { message: 'This is a test webhook from Lyrium' },
  });

  const signature = crypto
    .createHmac('sha256', webhook.secret)
    .update(body)
    .digest('hex');

  const response = await fetch(webhook.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Lyrium-Signature': signature,
      'X-Lyrium-Event': 'test',
    },
    body,
    signal: AbortSignal.timeout(10000),
  });

  webhook.lastTriggeredAt = new Date().toISOString();
  await webhook.save();

  return { status: response.status, ok: response.ok };
}
