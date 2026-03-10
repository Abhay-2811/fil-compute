import { Command } from "commander";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { ESCROW_RPC_URL, ESCROW_CONTRACT_ADDRESS, CU_TO_WEI } from "./config.mjs";

const ABI = ["function deposit() payable", "function balanceOf(address) view returns (uint256)"];

function depositCmd() {
  const cmd = new Command("deposit")
    .description("Add funds to escrow (calls contract deposit())")
    .requiredOption("--amount <cu>", "Amount in CU to deposit")
    .requiredOption("--private-key <key>", "Ethereum private key (hex)")
    .action(async (opts) => {
      const amountCu = Number(opts.amount);
      if (!Number.isFinite(amountCu) || amountCu <= 0) {
        console.error("Error: --amount must be a positive number (CU)");
        process.exit(1);
      }
      if (!ESCROW_RPC_URL || !ESCROW_CONTRACT_ADDRESS) {
        console.error("Error: set ESCROW_RPC_URL and ESCROW_CONTRACT_ADDRESS");
        process.exit(1);
      }
      const valueWei = BigInt(Math.ceil(amountCu * CU_TO_WEI));
      const pk = opts.privateKey.startsWith("0x") ? opts.privateKey : "0x" + opts.privateKey;
      const provider = new JsonRpcProvider(ESCROW_RPC_URL);
      const signer = new Wallet(pk, provider);
      const contract = new Contract(ESCROW_CONTRACT_ADDRESS, ABI, signer);
      try {
        const tx = await contract.deposit({ value: valueWei });
        console.log("Tx hash:", tx.hash);
        await tx.wait();
        console.log("Deposited", amountCu, "CU to", signer.address);
      } catch (e) {
        console.error("Deposit failed:", e.message || e);
        process.exit(1);
      }
    });
  return cmd;
}

export { depositCmd };
