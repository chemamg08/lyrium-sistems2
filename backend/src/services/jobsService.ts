import { Job } from '../models/Job.js';

const API_BASE_URL = process.env.BACKEND_INTERNAL_BASE_URL || `http://localhost:${process.env.PORT || 3000}/api`;

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed' | 'canceled';

export interface HttpJobRequest {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

export interface JobRecord {
  id: string;
  type: 'http';
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  accountId?: string;
  chatId?: string;
  request: HttpJobRequest;
  result?: any;
  error?: string;
}

let workerRunning = false;
let processing = false;

function makeId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureSafeEndpoint(endpoint: string): void {
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error('endpoint inválido');
  }
  if (!endpoint.startsWith('/')) {
    throw new Error('endpoint debe empezar por /');
  }
  if (endpoint.startsWith('/jobs')) {
    throw new Error('No se permite encadenar jobs');
  }
}

export async function createHttpJob(params: {
  endpoint: string;
  method?: HttpJobRequest['method'];
  body?: any;
  headers?: Record<string, string>;
  accountId?: string;
  chatId?: string;
}): Promise<JobRecord> {
  ensureSafeEndpoint(params.endpoint);

  const job = await Job.create({
    _id: makeId(),
    type: 'http',
    status: 'queued',
    createdAt: new Date().toISOString(),
    accountId: params.accountId || '',
    request: {
      endpoint: params.endpoint,
      method: params.method || 'POST',
      body: params.body,
      headers: params.headers || {}
    }
  });

  void processNextJob();
  return job.toJSON() as any;
}

export async function getJobById(jobId: string): Promise<JobRecord | null> {
  const job = await Job.findById(jobId);
  return job ? (job.toJSON() as any) : null;
}

export async function listJobs(filter: { accountId?: string; chatId?: string; status?: JobStatus } = {}): Promise<JobRecord[]> {
  const query: any = {};
  if (filter.accountId) query.accountId = filter.accountId;
  if (filter.status) query.status = filter.status;

  const jobs = await Job.find(query).sort({ createdAt: -1 });
  return jobs.map(j => j.toJSON() as any);
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const result = await Job.findOneAndUpdate(
    { _id: jobId, status: 'queued' },
    { status: 'canceled', finishedAt: new Date().toISOString() }
  );
  return !!result;
}

async function processNextJob(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    const next = await Job.findOneAndUpdate(
      { status: 'queued' },
      { status: 'processing', startedAt: new Date().toISOString() },
      { returnDocument: 'after' }
    );

    if (!next) return;

    try {
      const targetUrl = `${API_BASE_URL}${next.request.endpoint}`;
      const jobSecret = process.env.INTERNAL_JOB_SECRET;
      if (!jobSecret) {
        throw new Error('INTERNAL_JOB_SECRET not configured');
      }
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-internal-job': jobSecret,
        ...next.request.headers
      };

      const response = await fetch(targetUrl, {
        method: next.request.method,
        headers,
        body: next.request.method === 'GET' ? undefined : JSON.stringify(next.request.body || {})
      });

      const text = await response.text();
      let parsed: any = text;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { raw: text };
      }

      if (!response.ok) {
        throw new Error(parsed?.error || `HTTP ${response.status}`);
      }

      await Job.findByIdAndUpdate(next._id, {
        status: 'done',
        result: parsed,
        finishedAt: new Date().toISOString(),
        error: null
      });
    } catch (error: any) {
      await Job.findByIdAndUpdate(next._id, {
        status: 'failed',
        error: error?.message || 'Error desconocido',
        finishedAt: new Date().toISOString()
      });
    }
  } finally {
    processing = false;
  }

  // Trigger subsequent queued jobs
  const pendingCount = await Job.countDocuments({ status: 'queued' });
  if (pendingCount > 0) {
    void processNextJob();
  }
}

export function startJobsWorker(): void {
  if (workerRunning) return;
  workerRunning = true;

  setInterval(() => {
    void processNextJob();
  }, 1000);

  void processNextJob();
}
