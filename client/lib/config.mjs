const CORE_URL = (process.env.CORE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Default CU→wei scale when Core does not return it (e.g. memory escrow). */
const DEFAULT_CU_TO_WEI = 1e12;

/**
 * Fetch escrow config from Core. Returns { rpcUrl, contractAddress, cuToWei } when Core uses EVM escrow; otherwise null/partial.
 */
export async function getEscrowConfigFromCore(coreUrl) {
  const base = typeof coreUrl === "string" ? coreUrl.replace(/\/$/, "") : CORE_URL;
  const r = await fetch(`${base}/config`);
  if (!r.ok) throw new Error(`Failed to fetch config: ${r.status} ${await r.text()}`);
  const j = await r.json();
  const rpc = j.escrow_rpc_url;
  const contract = j.escrow_contract_address;
  const cuToWei = typeof j.escrow_cu_to_wei === "number" ? j.escrow_cu_to_wei : DEFAULT_CU_TO_WEI;
  return { rpcUrl: rpc || null, contractAddress: contract || null, cuToWei };
}

export { CORE_URL, DEFAULT_CU_TO_WEI as CU_TO_WEI };

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
