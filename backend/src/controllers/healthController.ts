import { Request, Response } from 'express';
import mongoose from 'mongoose';

export const healthCheck = (req: Request, res: Response) => {
  const dbReady = mongoose.connection.readyState === 1;
  const status = dbReady ? 'OK' : 'DEGRADED';
  const code = dbReady ? 200 : 503;

  res.status(code).json({
    status,
    database: dbReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
};
