import { Command } from "commander";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { CORE_URL, getEscrowConfigFromCore } from "./config.mjs";

const ABI = ["function deposit() payable", "function balanceOf(address) view returns (uint256)"];

function depositCmd() {
  const cmd = new Command("deposit")
    .description("Add funds to escrow (calls contract deposit()); escrow config from Core")
    .requiredOption("--amount <cu>", "Amount in CU to deposit")
    .requiredOption("--private-key <key>", "Ethereum private key (hex)")
    .option("--core-url <url>", "Core API URL (for escrow config)", CORE_URL)
    .action(async (opts) => {
      const amountCu = Number(opts.amount);
      if (!Number.isFinite(amountCu) || amountCu <= 0) {
        console.error("Error: --amount must be a positive number (CU)");
        process.exit(1);
      }
      const coreUrl = (opts.coreUrl || CORE_URL).replace(/\/$/, "");
      let escrowConfig;
      try {
        escrowConfig = await getEscrowConfigFromCore(coreUrl);
      } catch (e) {
        console.error("Error: could not fetch escrow config from Core:", e.message || e);
        process.exit(1);
      }
      if (!escrowConfig.rpcUrl || !escrowConfig.contractAddress) {
        console.error("Error: Core is not configured for EVM escrow (no rpc/contract). Deposit requires a Core with ESCROW_RPC_URL and ESCROW_CONTRACT_ADDRESS set.");
        process.exit(1);
      }
      const { rpcUrl, contractAddress, cuToWei } = escrowConfig;
      const valueWei = BigInt(Math.ceil(amountCu * cuToWei));
      const pk = opts.privateKey.startsWith("0x") ? opts.privateKey : "0x" + opts.privateKey;
      const provider = new JsonRpcProvider(rpcUrl);
      const signer = new Wallet(pk, provider);
      const contract = new Contract(contractAddress, ABI, signer);
      const sendDeposit = (overrides = {}) => contract.deposit({ value: valueWei, ...overrides });

      try {
        const tx = await sendDeposit();
        console.log("Tx hash:", tx.hash);
        await tx.wait();
        console.log("Deposited", amountCu, "CU to", signer.address);
      } catch (e) {
        const msg = e && typeof e.message === "string" ? e.message : String(e);
        const isNewAccount = /actor not found|get nonce|resolution lookup failed|getTransactionCount/i.test(msg);
        if (isNewAccount) {
          try {
            // Skip estimateGas (can fail on FVM with "missing revert data"); use explicit gas.
            const tx = await sendDeposit({ nonce: 0, gasLimit: 500_000 });
            console.log("Tx hash:", tx.hash);
            await tx.wait();
            console.log("Deposited", amountCu, "CU to", signer.address);
          } catch (e2) {
            const m = e2 && e2.message != null ? e2.message : String(e2);
            console.error("Deposit failed (with nonce 0):", m);
            if (/missing revert data|estimateGas|CALL_EXCEPTION/i.test(m)) {
              console.error("Tip: Ensure the wallet has enough native token (e.g. FIL on Calibration) for the deposit amount plus gas.");
            }
            if (/actor not found|look up actor state nonce|sendRawTransaction|validation failure/i.test(m)) {
              console.error("Tip: On Filecoin, the sender address must exist on-chain before sending. Receive a small amount of FIL (e.g. from a Calibration faucet) to that address first, then run deposit again.");
            }
            process.exit(1);
          }
        } else {
          console.error("Deposit failed:", msg);
          process.exit(1);
        }
      }
    });
  return cmd;
}

export { depositCmd };
