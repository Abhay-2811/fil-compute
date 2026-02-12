import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import type { IEscrowProvider } from "./types.js";

const RPC_URL = process.env.ESCROW_RPC_URL ?? "";
const CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS ?? "";
const SIGNER_PRIVATE_KEY = process.env.ESCROW_SIGNER_PRIVATE_KEY ?? "";
/** CU to wei scale (1 CU = CU_TO_WEI wei). Default 1e12. */
const CU_TO_WEI = Number(process.env.ESCROW_CU_TO_WEI) || 1e12;

const ABI = [
  "function lock(bytes32 jobId, address nodePayout) payable",
  "function settleSuccess(bytes32 jobId, bytes32 attemptId, uint256 cuUsed, address nodePayout)",
  "function refund(bytes32 jobId)",
  "function locks(bytes32) view returns (address user, address nodePayout, uint256 amountCu, bool settled)",
];

function stringToBytes32(s: string): string {
  return keccak256(toUtf8Bytes(s));
}

function getContract() {
  if (!RPC_URL || !CONTRACT_ADDRESS || !SIGNER_PRIVATE_KEY) {
    throw new Error(
      "EVM escrow requires ESCROW_RPC_URL, ESCROW_CONTRACT_ADDRESS, ESCROW_SIGNER_PRIVATE_KEY"
    );
  }
  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new Wallet(SIGNER_PRIVATE_KEY, provider);
  return new Contract(CONTRACT_ADDRESS, ABI, signer);
}

/** Get signer address for balance (v0: single relayer/signer). */
async function getSignerAddress(): Promise<string> {
  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new Wallet(SIGNER_PRIVATE_KEY, provider);
  return signer.getAddress();
}

export const evmEscrow: IEscrowProvider = {
  getBalance(_userId?: string): number {
    if (!RPC_URL || !SIGNER_PRIVATE_KEY) {
      throw new Error("EVM escrow not configured; use ESCROW_PROVIDER=memory");
    }
    // Sync balance read not supported in adapter; use async or cache. For compatibility return 0 and document.
    return 0;
  },

  async lock(
    jobId: string,
    amount: number,
    _userId?: string,
    nodePayout?: string
  ): Promise<boolean> {
    if (!nodePayout || !nodePayout.startsWith("0x")) {
      throw new Error("EVM lock requires nodePayout (address)");
    }
    const contract = getContract();
    const jobIdBytes32 = stringToBytes32(jobId);
    const valueWei = BigInt(Math.ceil(amount * CU_TO_WEI));
    try {
      const tx = await contract.lock(jobIdBytes32, nodePayout, { value: valueWei });
      await tx.wait();
      return true;
    } catch {
      return false;
    }
  },

  async settleSuccess(
    jobId: string,
    cuUsed: number,
    nodePayout?: string,
    attemptId?: string
  ): Promise<boolean> {
    if (!nodePayout || !nodePayout.startsWith("0x")) {
      throw new Error("EVM settleSuccess requires nodePayout (address)");
    }
    const contract = getContract();
    const jobIdBytes32 = stringToBytes32(jobId);
    const attemptIdBytes32 = attemptId
      ? stringToBytes32(attemptId)
      : "0x0000000000000000000000000000000000000000000000000000000000000000";
    try {
      const tx = await contract.settleSuccess(
        jobIdBytes32,
        attemptIdBytes32,
        BigInt(Math.floor(cuUsed)),
        nodePayout
      );
      await tx.wait();
      return true;
    } catch {
      return false;
    }
  },

  async settleRefund(jobId: string): Promise<boolean> {
    const contract = getContract();
    const jobIdBytes32 = stringToBytes32(jobId);
    try {
      const tx = await contract.refund(jobIdBytes32);
      await tx.wait();
      return true;
    } catch {
      return false;
    }
  },
};
