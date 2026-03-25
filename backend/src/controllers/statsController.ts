import { Request, Response } from 'express';
import { Stat } from '../models/Stat.js';
import { Client } from '../models/Client.js';
import { verifyOwnership } from '../middleware/auth.js';

// GET /api/stats - Obtener estadísticas de una cuenta
export const getStats = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }

    const aid = accountId as string;

    if (!verifyOwnership(req, aid)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const [accountStats, clientsCount] = await Promise.all([
      Stat.findById(aid),
      Client.countDocuments({ accountId: aid }),
    ]);

    res.json({
      clientsRegistered: clientsCount,
      contractsCreated: accountStats?.contractsCreated || 0,
      defensesCreated: accountStats?.defensesCreated || 0,
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

// POST /api/stats/increment - Incrementar un contador
export const incrementStat = async (req: Request, res: Response) => {
  try {
    const { accountId, stat } = req.body;
    
    if (!accountId || !stat) {
      return res.status(400).json({ error: 'accountId y stat son requeridos' });
    }

    const validStats = ['contractsDownloaded', 'defensesExported', 'contractsCreated', 'defensesCreated'];
    if (!validStats.includes(stat)) {
      return res.status(400).json({ error: 'stat no válido' });
    }

    if (!verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const updated = await Stat.findByIdAndUpdate(
      accountId,
      { $inc: { [stat]: 1 } },
      { upsert: true, returnDocument: 'after' }
    );

    const newValue = (updated as any)[stat];
    res.json({ success: true, newValue });
  } catch (error) {
    console.error('Error al incrementar estadística:', error);
    res.status(500).json({ error: 'Error al incrementar estadística' });
  }
};
