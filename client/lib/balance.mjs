import { Command } from "commander";
import { CORE_URL, ESCROW_RPC_URL, ESCROW_CONTRACT_ADDRESS, CU_TO_WEI } from "./config.mjs";

function balanceCmd() {
  const cmd = new Command("balance")
    .description("Check escrow balance (Core GET /balance or contract)")
    .option("--address <0x...>", "Wallet address")
    .option("--private-key <key>", "Derive address from key")
    .action(async (opts) => {
      let address = opts.address;
      if (opts.privateKey) {
        const { getAddressFromPrivateKey } = await import("./config.mjs");
        address = await getAddressFromPrivateKey(opts.privateKey);
      }
      if (!address || (address !== "default" && !address.startsWith("0x"))) {
        console.error("Error: provide --address (0x...) or --private-key");
        process.exit(1);
      }
      if (ESCROW_RPC_URL && ESCROW_CONTRACT_ADDRESS && address.startsWith("0x")) {
        const { Contract, JsonRpcProvider } = await import("ethers");
        const provider = new JsonRpcProvider(ESCROW_RPC_URL);
        const contract = new Contract(ESCROW_CONTRACT_ADDRESS, ["function balanceOf(address) view returns (uint256)"], provider);
        const wei = await contract.balanceOf(address);
        const cu = Number(wei) / CU_TO_WEI;
        console.log("Balance (wei):", wei.toString());
        console.log("Balance (CU):", cu);
      } else {
        const { getBalanceFromCore } = await import("./config.mjs");
        const cu = await getBalanceFromCore(CORE_URL, address);
        console.log("Balance (CU):", cu);
      }
    });
  return cmd;
}

export { balanceCmd };
