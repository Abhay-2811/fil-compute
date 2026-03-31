/**
 * Escrow provider interface. Balance-based: clients pre-fund; signer deducts on job success.
 * getBalance(userId) in CU (or wei); lock is no-op for balance-based; settleSuccess(userId, ...) deducts from user.
 */
export interface IEscrowProvider {
  /** Balance in CU (or wei if documented). Async for EVM (contract read). */
  getBalance(userId?: string): number | Promise<number>;
  /** No-op for balance-based (return true). Legacy: lock per job. */
  lock(
    jobId: string,
    amount: number,
    userId?: string,
    nodePayout?: string
  ): boolean | Promise<boolean>;
  /** Deduct cuUsed from user's balance and pay node. userAddress required for balance-based. */
  settleSuccess(
    jobId: string,
    cuUsed: number,
    nodePayout?: string,
    attemptId?: string,
    userAddress?: string
  ): boolean | Promise<boolean>;
  /** No-op for balance-based. Legacy: refund locked amount. */
  settleRefund(jobId: string): boolean | Promise<boolean>;
}
