import { Account } from '../models/Account.js';
import { Subaccount } from '../models/Subaccount.js';
import { Client } from '../models/Client.js';
import { hasAssignedSubaccount } from '../utils/clientAssignments.js';

export type AutomationWorkspaceOwnerType = 'main' | 'subaccount';

export interface AutomationAssignableCandidate {
  id: string;
  name: string;
  email: string;
  kind: 'main' | 'subaccount' | 'self';
  load: number;
}

export async function resolveWorkspaceOwner(
  workspaceId: string,
): Promise<{ ownerType: AutomationWorkspaceOwnerType; record: any } | null> {
  const mainAccount = await Account.findById(workspaceId).lean();
  if (mainAccount) {
    return { ownerType: 'main', record: mainAccount };
  }

  const subaccount = await Subaccount.findById(workspaceId).lean();
  if (subaccount) {
    return { ownerType: 'subaccount', record: subaccount };
  }

  return null;
}

function candidateLoadFromClients(clients: any[], candidateId: string): number {
  return clients.filter((client: any) => {
    if (!candidateId) return false;
    if (client?.assignedSubaccountId === candidateId) return true;
    return hasAssignedSubaccount(client, candidateId);
  }).length;
}

export async function listAssignableCandidates(workspaceId: string): Promise<AutomationAssignableCandidate[]> {
  const owner = await resolveWorkspaceOwner(workspaceId);
  if (!owner) return [];

  const clients = await Client.find({ accountId: workspaceId, status: 'abierto' }).lean();

  if (owner.ownerType === 'subaccount') {
    return [{
      id: String(owner.record._id),
      name: owner.record.name || owner.record.email || 'Mi cuenta',
      email: owner.record.email || '',
      kind: 'self',
      load: candidateLoadFromClients(clients, String(owner.record._id)),
    }];
  }

  const subs = await Subaccount.find({ parentAccountId: workspaceId }).lean();
  const candidates: AutomationAssignableCandidate[] = [{
    id: String(owner.record._id),
    name: owner.record.name || owner.record.email || 'Cuenta principal',
    email: owner.record.email || '',
    kind: 'main',
    load: candidateLoadFromClients(clients, String(owner.record._id)),
  }];

  for (const sub of subs) {
    candidates.push({
      id: String(sub._id),
      name: sub.name || sub.email || 'Subcuenta',
      email: sub.email || '',
      kind: 'subaccount',
      load: candidateLoadFromClients(clients, String(sub._id)),
    });
  }

  return candidates;
}

export async function findAssignableCandidate(
  workspaceId: string,
  candidateId: string,
): Promise<AutomationAssignableCandidate | null> {
  const candidates = await listAssignableCandidates(workspaceId);
  return candidates.find((candidate) => candidate.id === candidateId) || null;
}

export async function selectBestAssignableCandidate(
  workspaceId: string,
  assignedSpecialties: Record<string, string>,
  especialidadId?: string,
): Promise<AutomationAssignableCandidate | null> {
  const candidates = await listAssignableCandidates(workspaceId);
  if (candidates.length === 0) return null;

  const compatible = especialidadId
    ? candidates.filter((candidate) => assignedSpecialties[candidate.id] === especialidadId)
    : candidates;

  const pool = compatible.length > 0 ? compatible : candidates;
  const minLoad = Math.min(...pool.map((candidate) => candidate.load));
  const tied = pool.filter((candidate) => candidate.load === minLoad);
  if (tied.length === 0) return null;
  if (tied.length === 1) return tied[0];

  const randomIndex = Math.floor(Math.random() * tied.length);
  return tied[randomIndex];
}

