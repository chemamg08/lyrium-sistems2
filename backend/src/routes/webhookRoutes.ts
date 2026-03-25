import { Router, Request, Response } from 'express';
import { Webhook, WEBHOOK_EVENTS, generateWebhookSecret } from '../models/Webhook.js';
import { verifyOwnership } from '../middleware/auth.js';
import { sendTestWebhook } from '../services/webhookService.js';

const router = Router();

// GET /api/integrations/webhooks/events — List available events (MUST be before /:id)
router.get('/events', (_req: Request, res: Response) => {
  res.json(WEBHOOK_EVENTS);
});

// GET /api/integrations/webhooks — List webhooks
router.get('/', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string;
    if (!accountId || !verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const webhooks = await Webhook.find({ accountId }).sort({ createdAt: -1 });
    res.json(webhooks);
  } catch (error) {
    console.error('Error listing webhooks:', error);
    res.status(500).json({ error: 'Error listing webhooks' });
  }
});

// POST /api/integrations/webhooks — Create webhook
router.post('/', async (req: Request, res: Response) => {
  try {
    const { accountId, url, events, description } = req.body;
    if (!accountId || !url || !verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Validate events
    const validEvents = (events || []).filter((e: string) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (validEvents.length === 0) {
      return res.status(400).json({ error: 'At least one valid event is required', validEvents: WEBHOOK_EVENTS });
    }

    // Limit to 10 webhooks per account
    const count = await Webhook.countDocuments({ accountId });
    if (count >= 10) {
      return res.status(400).json({ error: 'Maximum 10 webhooks per account' });
    }

    const secret = generateWebhookSecret();

    const webhook = await Webhook.create({
      _id: `wh_${Date.now()}`,
      accountId,
      url,
      events: validEvents,
      secret,
      description: description || '',
      isActive: true,
    });

    res.status(201).json(webhook);
  } catch (error) {
    console.error('Error creating webhook:', error);
    res.status(500).json({ error: 'Error creating webhook' });
  }
});

// PUT /api/integrations/webhooks/:id — Update webhook
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { accountId, url, events, isActive, description } = req.body;
    if (!accountId || !verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const webhook = await Webhook.findOne({ _id: id, accountId });
    if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

    if (url !== undefined) {
      try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL format' }); }
      webhook.url = url;
    }
    if (events !== undefined) {
      webhook.events = events.filter((e: string) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
    }
    if (isActive !== undefined) webhook.isActive = isActive;
    if (description !== undefined) webhook.description = description;

    await webhook.save();
    res.json(webhook);
  } catch (error) {
    console.error('Error updating webhook:', error);
    res.status(500).json({ error: 'Error updating webhook' });
  }
});

// DELETE /api/integrations/webhooks/:id — Delete webhook
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const accountId = req.query.accountId as string;
    if (!accountId || !verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const webhook = await Webhook.findOne({ _id: id, accountId });
    if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

    await Webhook.deleteOne({ _id: id });
    res.json({ message: 'Webhook deleted' });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({ error: 'Error deleting webhook' });
  }
});

// POST /api/integrations/webhooks/:id/test — Send test event
router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const accountId = req.query.accountId as string;
    if (!accountId || !verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await sendTestWebhook(id, accountId);
    res.json(result);
  } catch (error: any) {
    console.error('Error testing webhook:', error);
    res.status(500).json({ error: error.message || 'Error testing webhook' });
  }
});

export default router;
