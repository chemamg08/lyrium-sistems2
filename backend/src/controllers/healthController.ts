import { Request, Response } from 'express';

export const healthCheck = (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    message: 'Backend funcionando correctamente',
    timestamp: new Date().toISOString()
  });
};
