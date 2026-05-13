import crypto from 'crypto';
import { DistributedLock } from '../models/DistributedLock.js';

const INSTANCE_ID = `${process.env.HOSTNAME || 'local'}:${process.pid}:${crypto.randomUUID()}`;

function nowIso(): string {
  return new Date().toISOString();
}

export function getDistributedLockOwnerId(): string {
  return INSTANCE_ID;
}

export async function tryAcquireDistributedLock(lockId: string, ttlMs: number): Promise<boolean> {
  const acquiredAt = nowIso();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  try {
    const lock = await DistributedLock.findOneAndUpdate(
      {
        _id: lockId,
        $or: [
          { expiresAt: { $lt: acquiredAt } },
          { ownerId: INSTANCE_ID },
        ],
      },
      {
        $set: {
          ownerId: INSTANCE_ID,
          expiresAt,
          updatedAt: acquiredAt,
        },
        $setOnInsert: {
          createdAt: acquiredAt,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
      }
    );

    return !!lock && lock.ownerId === INSTANCE_ID;
  } catch (error: any) {
    if (error?.code === 11000) {
      return false;
    }

    throw error;
  }
}

export async function releaseDistributedLock(lockId: string): Promise<void> {
  await DistributedLock.deleteOne({ _id: lockId, ownerId: INSTANCE_ID });
}

export async function runWithDistributedLock<T>(
  lockId: string,
  ttlMs: number,
  task: () => Promise<T>,
): Promise<T | null> {
  const acquired = await tryAcquireDistributedLock(lockId, ttlMs);
  if (!acquired) {
    return null;
  }

  try {
    return await task();
  } finally {
    await releaseDistributedLock(lockId);
  }
}