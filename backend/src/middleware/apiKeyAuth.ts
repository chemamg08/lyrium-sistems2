import { Request, Response, NextFunction } from 'express';
import { ApiKey, hashApiKey } from '../models/ApiKey.js';

export interface ApiKeyRequest extends Request {
  apiKeyAccountId?: string;
}

export async function apiKeyAuth(req: ApiKeyRequest, res: Response, next: NextFunction) {
  const key = req.headers['x-api-key'] as string;

  if (!key) {
    return res.status(401).json({ error: 'API key required. Include X-API-Key header.' });
  }

  const keyHash = hashApiKey(key);
  const apiKey = await ApiKey.findOne({ keyHash, isActive: true });

  if (!apiKey) {
    return res.status(401).json({ error: 'Invalid or revoked API key.' });
  }

  // Update last used timestamp
  apiKey.lastUsedAt = new Date().toISOString();
  await apiKey.save();

  req.apiKeyAccountId = apiKey.accountId;
  next();
}
