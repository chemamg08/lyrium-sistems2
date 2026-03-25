import { Request, Response } from 'express';
import { cancelJob, createHttpJob, getJobById, listJobs } from '../services/jobsService.js';
import { verifyOwnership } from '../middleware/auth.js';

export async function createJob(req: Request, res: Response) {
  try {
    const { endpoint, method, body, headers, accountId, chatId } = req.body || {};

    if (!endpoint) {
      return res.status(400).json({ error: 'endpoint es requerido' });
    }

    if (accountId && !verifyOwnership(req, accountId)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const job = await createHttpJob({
      endpoint,
      method,
      body,
      headers,
      accountId,
      chatId
    });

    res.status(201).json({
      id: job.id,
      status: job.status,
      createdAt: job.createdAt
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'No se pudo crear job' });
  }
}

export async function getJob(req: Request, res: Response) {
  const { id } = req.params;
  const job = await getJobById(id);
  if (!job) {
    return res.status(404).json({ error: 'Job no encontrado' });
  }
  if (job.accountId && !verifyOwnership(req, job.accountId)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  res.json(job);
}

export async function getJobs(req: Request, res: Response) {
  const accountId = req.query.accountId as string | undefined;
  const chatId = req.query.chatId as string | undefined;
  const status = req.query.status as any;

  if (accountId && !verifyOwnership(req, accountId)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const jobs = await listJobs({ accountId, chatId, status });
  res.json(jobs);
}

export async function deleteJob(req: Request, res: Response) {
  const { id } = req.params;
  const job = await getJobById(id);
  if (!job) {
    return res.status(404).json({ error: 'Job no encontrado' });
  }
  if (job.accountId && !verifyOwnership(req, job.accountId)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const canceled = await cancelJob(id);
  if (!canceled) {
    return res.status(409).json({ error: 'No se pudo cancelar el job (puede estar en ejecución o no existir)' });
  }
  res.json({ success: true, id });
}
