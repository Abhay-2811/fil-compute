const CORE_URL = (process.env.CORE_URL || "http://localhost:3000").replace(/\/$/, "");
const ESCROW_RPC_URL = process.env.ESCROW_RPC_URL || "";
const ESCROW_CONTRACT_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS || "";
const CU_TO_WEI = Number(process.env.ESCROW_CU_TO_WEI) || 1e12;

export { CORE_URL, ESCROW_RPC_URL, ESCROW_CONTRACT_ADDRESS, CU_TO_WEI };

export async function getAddressFromPrivateKey(privateKey) {
  const { Wallet } = await import("ethers");
  const w = new Wallet(privateKey.startsWith("0x") ? privateKey : "0x" + privateKey);
  return w.address;
}

export async function getBalanceFromCore(coreUrl, userAddress) {
  const u = new URL("/jobs/balance", coreUrl);
  u.searchParams.set("user", userAddress);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`Balance check failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return Number(j.balance_cu) || 0;
}
