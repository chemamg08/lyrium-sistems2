import { Router, Request, Response } from 'express';
import { ApiKey, generateApiKey } from '../models/ApiKey.js';
import { verifyOwnership } from '../middleware/auth.js';

const router = Router();

// GET /api/integrations/keys — List all API keys for the account
router.get('/', async (req: Request, res: Response) => {
  try {
    const accountId = req.query.accountId as string;
    if (!accountId || !verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const keys = await ApiKey.find({ accountId }).sort({ createdAt: -1 });
    res.json(keys);
  } catch (error) {
    console.error('Error listing API keys:', error);
    res.status(500).json({ error: 'Error listing API keys' });
  }
});

// POST /api/integrations/keys — Generate a new API key
router.post('/', async (req: Request, res: Response) => {
  try {
    const { accountId, name } = req.body;
    if (!accountId || !name || !verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Limit to 10 keys per account
    const count = await ApiKey.countDocuments({ accountId });
    if (count >= 10) {
      return res.status(400).json({ error: 'Maximum 10 API keys per account' });
    }

    const { raw, hash, prefix } = generateApiKey();

    const apiKey = await ApiKey.create({
      _id: `ak_${Date.now()}`,
      accountId,
      name,
      keyHash: hash,
      keyPrefix: prefix,
      permissions: ['all'],
      isActive: true,
    });

    // Return the raw key only on creation — it won't be shown again
    res.status(201).json({
      id: apiKey._id,
      name: apiKey.name,
      key: raw,
      keyPrefix: prefix,
      createdAt: apiKey.createdAt,
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Error creating API key' });
  }
});

// DELETE /api/integrations/keys/:id — Revoke an API key
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const accountId = req.query.accountId as string;
    if (!accountId || !verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const apiKey = await ApiKey.findOne({ _id: id, accountId });
    if (!apiKey) return res.status(404).json({ error: 'API key not found' });

    await ApiKey.deleteOne({ _id: id });
    res.json({ message: 'API key revoked' });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Error revoking API key' });
  }
});

export default router;
