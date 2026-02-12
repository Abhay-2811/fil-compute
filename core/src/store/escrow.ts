import type { IEscrowProvider } from "../escrow/types.js";

/**
 * In-memory escrow for v0. Single user "default".
 * Lock on PREFLIGHT success; settle on COMPLETE (charge cu_used) or refund on FAILED_NODE.
 */
const DEFAULT_USER = "default";
const initialBalance = 100_000; // CU

const balance = new Map<string, number>([[DEFAULT_USER, initialBalance]]);
const lockedByJob = new Map<string, { userId: string; amount: number }>();

export function getBalance(userId: string = DEFAULT_USER): number {
  return balance.get(userId) ?? 0;
}

/** Lock max_cost_cu for job. Returns false if insufficient balance. */
export function lock(jobId: string, amount: number, userId: string = DEFAULT_USER): boolean {
  const available = balance.get(userId) ?? 0;
  if (amount > available) return false;
  balance.set(userId, available - amount);
  lockedByJob.set(jobId, { userId, amount });
  return true;
}

/** On SUCCESS or CONTAINER_ERROR: charge cu_used, release remainder. Exactly-once per job. */
export function settleSuccess(jobId: string, cuUsed: number): boolean {
  const entry = lockedByJob.get(jobId);
  if (!entry) return false;
  lockedByJob.delete(jobId);
  const release = entry.amount - cuUsed;
  const current = balance.get(entry.userId) ?? 0;
  balance.set(entry.userId, current + release);
  return true;
}

/** On FAILED_NODE / FAILED_PREFLIGHT: full refund. Exactly-once per job. */
export function settleRefund(jobId: string): boolean {
  const entry = lockedByJob.get(jobId);
  if (!entry) return false;
  lockedByJob.delete(jobId);
  const current = balance.get(entry.userId) ?? 0;
  balance.set(entry.userId, current + entry.amount);
  return true;
}

/** In-memory implementation of IEscrowProvider for local dev and tests. */
export const memoryEscrow: IEscrowProvider = {
  getBalance: (userId = DEFAULT_USER) => getBalance(userId),
  lock: (jobId, amount, userId = DEFAULT_USER, _nodePayout?: string) =>
    lock(jobId, amount, userId),
  settleSuccess: (jobId, cuUsed, _nodePayout?: string, _attemptId?: string) =>
    settleSuccess(jobId, cuUsed),
  settleRefund,
};
