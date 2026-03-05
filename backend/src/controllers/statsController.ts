import { Request, Response } from 'express';
import { Stat } from '../models/Stat.js';
import { Client } from '../models/Client.js';

// GET /api/stats - Obtener estadísticas de una cuenta
export const getStats = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.query;
    
    if (!accountId) {
      return res.status(400).json({ error: 'accountId es requerido' });
    }

    // Leer estadísticas
    const accountStats = await Stat.findById(accountId as string);

    // Contar clientes registrados
    let clientsCount = 0;
    try {
      clientsCount = await Client.countDocuments({ accountId: accountId as string });
    } catch (error) {
      console.error('Error al leer clientes:', error);
    }

    res.json({
      clientsRegistered: clientsCount,
      contractsCreated: accountStats?.contractsDownloaded || 0,
      defensesCreated: accountStats?.defensesExported || 0
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

    if (stat !== 'contractsDownloaded' && stat !== 'defensesExported') {
      return res.status(400).json({ error: 'stat debe ser contractsDownloaded o defensesExported' });
    }

    const updated = await Stat.findByIdAndUpdate(
      accountId,
      { $inc: { [stat]: 1 }, $setOnInsert: { accountId } },
      { upsert: true, returnDocument: 'after' }
    );

    const newValue = stat === 'contractsDownloaded' ? updated!.contractsDownloaded : updated!.defensesExported;
    res.json({ success: true, newValue });
  } catch (error) {
    console.error('Error al incrementar estadística:', error);
    res.status(500).json({ error: 'Error al incrementar estadística' });
  }
};
