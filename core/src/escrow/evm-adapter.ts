import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import type { IEscrowProvider } from "./types.js";

const RPC_URL = process.env.ESCROW_RPC_URL ?? "";
const CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS ?? "";
const SIGNER_PRIVATE_KEY = process.env.ESCROW_SIGNER_PRIVATE_KEY ?? "";
/** CU to wei scale (1 CU = CU_TO_WEI wei). Default 1e12. */
const CU_TO_WEI = Number(process.env.ESCROW_CU_TO_WEI) || 1e12;

const ABI = [
  "function deposit() payable",
  "function balanceOf(address user) view returns (uint256)",
  "function settleSuccess(address user, bytes32 jobId, bytes32 attemptId, uint256 cuUsed, address nodePayout)",
  "function lock(bytes32 jobId, address nodePayout) payable",
  "function settleSuccessLegacy(bytes32 jobId, bytes32 attemptId, uint256 cuUsed, address nodePayout)",
  "function refund(bytes32 jobId)",
  "function locks(bytes32) view returns (address user, address nodePayout, uint256 amountCu, bool settled)",
];

function stringToBytes32(s: string): string {
  return keccak256(toUtf8Bytes(s));
}

function getContract(signer?: Wallet) {
  if (!RPC_URL || !CONTRACT_ADDRESS) {
    throw new Error("EVM escrow requires ESCROW_RPC_URL, ESCROW_CONTRACT_ADDRESS");
  }
  const provider = new JsonRpcProvider(RPC_URL);
  const s = signer ?? new Wallet(SIGNER_PRIVATE_KEY || "0x", provider);
  return new Contract(CONTRACT_ADDRESS, ABI, s);
}

function getReadOnlyContract(): Contract {
  if (!RPC_URL || !CONTRACT_ADDRESS) {
    throw new Error("EVM escrow requires ESCROW_RPC_URL, ESCROW_CONTRACT_ADDRESS");
  }
  return new Contract(CONTRACT_ADDRESS, ABI, new JsonRpcProvider(RPC_URL));
}

export const evmEscrow: IEscrowProvider = {
  async getBalance(userId?: string): Promise<number> {
    if (!RPC_URL || !CONTRACT_ADDRESS) {
      throw new Error("EVM escrow not configured; use ESCROW_PROVIDER=memory");
    }
    if (!userId || !userId.startsWith("0x")) {
      return 0;
    }
    const contract = getReadOnlyContract();
    const wei = await contract.balanceOf(userId);
    const cu = Number(wei) / CU_TO_WEI;
    return cu;
  },

  async lock(
    _jobId: string,
    _amount: number,
    _userId?: string,
    _nodePayout?: string
  ): Promise<boolean> {
    // Balance-based: no per-job lock; client balance checked at submit.
    return true;
  },

  async settleSuccess(
    jobId: string,
    cuUsed: number,
    nodePayout?: string,
    attemptId?: string,
    userAddress?: string
  ): Promise<boolean> {
    if (!userAddress || !userAddress.startsWith("0x")) {
      throw new Error("EVM settleSuccess (balance-based) requires userAddress");
    }
    if (!nodePayout || !nodePayout.startsWith("0x")) {
      throw new Error("EVM settleSuccess requires nodePayout (address)");
    }
    if (!SIGNER_PRIVATE_KEY) {
      throw new Error("EVM escrow requires ESCROW_SIGNER_PRIVATE_KEY for settleSuccess");
    }
    const provider = new JsonRpcProvider(RPC_URL);
    const signer = new Wallet(SIGNER_PRIVATE_KEY, provider);
    const contract = getContract(signer);
    const jobIdBytes32 = stringToBytes32(jobId);
    const attemptIdBytes32 = attemptId
      ? stringToBytes32(attemptId)
      : "0x0000000000000000000000000000000000000000000000000000000000000000";
    const cuUsedWei = BigInt(Math.floor(cuUsed * CU_TO_WEI));
    try {
      const tx = await contract.settleSuccess(
        userAddress,
        jobIdBytes32,
        attemptIdBytes32,
        cuUsedWei,
        nodePayout
      );
      await tx.wait();
      return true;
    } catch {
      return false;
    }
  },

  async settleRefund(_jobId: string): Promise<boolean> {
    // Balance-based: nothing was locked, nothing to refund.
    return true;
  },
};
