/**
 * Escrow provider interface. Implementations: in-memory (dev/tests) or EVM contract adapter.
 * For EVM, nodePayout (address) is required at lock time; userId is optional (relayer/signer used when not provided).
 * lock/settleSuccess/settleRefund are async for EVM (submit tx).
 */
export interface IEscrowProvider {
  getBalance(userId?: string): number;
  lock(
    jobId: string,
    amount: number,
    userId?: string,
    nodePayout?: string
  ): boolean | Promise<boolean>;
  settleSuccess(
    jobId: string,
    cuUsed: number,
    nodePayout?: string,
    attemptId?: string
  ): boolean | Promise<boolean>;
  settleRefund(jobId: string): boolean | Promise<boolean>;
}
