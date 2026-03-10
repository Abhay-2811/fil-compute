import type { IEscrowProvider } from "../escrow/types.js";

/**
 * In-memory escrow for v0. Supports balance-based (no lock): getBalance(userId), settleSuccess(..., userAddress) deducts from user.
 * Legacy: lock() reserves amount; settleSuccess without userAddress uses locked entry; settleRefund returns locked amount.
 */
const DEFAULT_USER = "default";
const initialBalance = 100_000; // CU

const balance = new Map<string, number>([[DEFAULT_USER, initialBalance]]);
const lockedByJob = new Map<string, { userId: string; amount: number }>();

export function getBalance(userId: string = DEFAULT_USER): number {
  return balance.get(userId) ?? 0;
}

/** Lock max_cost_cu for job (legacy). Balance-based flow uses lock as no-op (caller returns true without calling this). */
export function lock(jobId: string, amount: number, userId: string = DEFAULT_USER): boolean {
  const available = balance.get(userId) ?? 0;
  if (amount > available) return false;
  balance.set(userId, available - amount);
  lockedByJob.set(jobId, { userId, amount });
  return true;
}

/** On SUCCESS: charge cu_used. If userAddress provided (balance-based), deduct from that user. Else legacy: release from locked entry. */
export function settleSuccess(
  jobId: string,
  cuUsed: number,
  _nodePayout?: string,
  _attemptId?: string,
  userAddress?: string
): boolean {
  if (userAddress != null && userAddress !== "") {
    const current = balance.get(userAddress) ?? 0;
    if (cuUsed > current) return false;
    balance.set(userAddress, current - cuUsed);
    return true;
  }
  const entry = lockedByJob.get(jobId);
  if (!entry) return false;
  lockedByJob.delete(jobId);
  const release = entry.amount - cuUsed;
  const current = balance.get(entry.userId) ?? 0;
  balance.set(entry.userId, current + release);
  return true;
}

/** On FAILED_NODE / FAILED_PREFLIGHT: full refund (legacy only; balance-based has no lock to refund). */
export function settleRefund(jobId: string): boolean {
  const entry = lockedByJob.get(jobId);
  if (!entry) return false;
  lockedByJob.delete(jobId);
  const current = balance.get(entry.userId) ?? 0;
  balance.set(entry.userId, current + entry.amount);
  return true;
}

export const memoryEscrow: IEscrowProvider = {
  getBalance: (userId = DEFAULT_USER) => getBalance(userId),
  lock: (jobId, amount, userId = DEFAULT_USER, _nodePayout?: string) =>
    lock(jobId, amount, userId),
  settleSuccess: (jobId, cuUsed, nodePayout?: string, attemptId?: string, userAddress?: string) =>
    settleSuccess(jobId, cuUsed, nodePayout, attemptId, userAddress),
  settleRefund,
};
