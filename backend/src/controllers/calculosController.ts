import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { calcular, DesgloseLine } from '../services/calculosService.js';
import { Calculation } from '../models/Calculation.js';
import { verifyOwnership } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getCalculosByClient = async (req: Request, res: Response) => {
  try {
    const { clientId, accountId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId requerido' });
    if (accountId && !verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    const filter: Record<string, any> = { clientId };
    if (accountId) filter.accountId = accountId;
    const docs = await Calculation.find(filter).sort({ createdAt: -1 });
    return res.json(docs.map(d => d.toJSON()));
  } catch (err) {
    console.error('Error fetching calculos:', err);
    return res.status(500).json({ error: 'Error fetching calculos' });
  }
};

export const getCalculoById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const calculo = await Calculation.findById(id);
    if (!calculo) return res.status(404).json({ error: 'No encontrado' });
    if (calculo.accountId && !verifyOwnership(req, calculo.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    return res.json(calculo.toJSON());
  } catch (err) {
    console.error('Error fetching calculo:', err);
    return res.status(500).json({ error: 'Error fetching calculo' });
  }
};

export const createCalculo = async (req: Request, res: Response) => {
  try {
    const { clientId, clientName, clientType, label, data, resultado, etiquetaTotal, desglose, accountId } = req.body;
    if (!clientId || !clientType) return res.status(400).json({ error: 'Faltan campos requeridos' });
    if (accountId && !verifyOwnership(req, accountId as string)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    const nuevo = new Calculation({
      _id: Date.now().toString(),
      clientId,
      clientName: clientName || '',
      clientType,
      label: label || `Cálculo ${new Date().toLocaleDateString('es-ES')}`,
      createdAt: new Date().toISOString(),
      data: data || {},
      resultado,
      etiquetaTotal,
      desglose,
      accountId: accountId || '',
    });
    await nuevo.save();
    return res.status(201).json(nuevo.toJSON());
  } catch (err) {
    console.error('Error creating calculo:', err);
    return res.status(500).json({ error: 'Error creating calculo' });
  }
};

export const calculateCalculo = (req: Request, res: Response) => {
  const { clientType, data } = req.body;
  if (!clientType || !data) return res.status(400).json({ error: 'Faltan campos requeridos' });
  try {
    const payload = data as Record<string, string>;
    const bodyCountry = typeof req.body.country === 'string' ? req.body.country : '';
    const dataCountry = typeof payload.country === 'string' ? payload.country : '';
    const country = (bodyCountry || dataCountry || '').trim();
    if (!country) {
      return res.status(400).json({ error: 'country es requerido' });
    }
    const result = calcular(clientType as string, payload, country);
    return res.json(result);
  } catch (err: any) {
    console.error('Error calculando:', err);
    const message = err?.message || 'Error en el cálculo';
    if (message.includes('Country is required') || message.includes('No tax config for country')) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: 'Error en el cálculo' });
  }
};

export const getCountryConfig = (req: Request, res: Response) => {
  const country = ((req.query.country as string) || 'ES').toLowerCase().substring(0, 2);
  try {
    const filePath = path.join(__dirname, '../config/taxRates', `${country}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `No tax config for country: ${country}` });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return res.json({
      fields: data.fields || null,
      currency: data.currency || 'EUR',
      country: data.country || country.toUpperCase(),
      code: data.code || country.toUpperCase(),
      vat: data.vat || null,
      clientForm: data.clientForm || null,
    });
  } catch (err) {
    console.error('Error reading country config:', err);
    return res.status(500).json({ error: 'Failed to read country config' });
  }
};

export const deleteCalculo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const calculo = await Calculation.findById(id);
    if (!calculo) return res.status(404).json({ error: 'No encontrado' });
    if (calculo.accountId && !verifyOwnership(req, calculo.accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    await Calculation.deleteOne({ _id: id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting calculo:', err);
    return res.status(500).json({ error: 'Error deleting calculo' });
  }
};
