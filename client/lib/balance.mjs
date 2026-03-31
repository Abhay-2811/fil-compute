import { Command } from "commander";
import { CORE_URL, getEscrowConfigFromCore, getBalanceFromCore } from "./config.mjs";

function balanceCmd() {
  const cmd = new Command("balance")
    .description("Check escrow balance (from Core); uses contract when Core has EVM escrow")
    .option("--address <0x...>", "Wallet address")
    .option("--private-key <key>", "Derive address from key")
    .option("--core-url <url>", "Core API URL", CORE_URL)
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
      const coreUrl = (opts.coreUrl || CORE_URL).replace(/\/$/, "");
      let escrowConfig;
      try {
        escrowConfig = await getEscrowConfigFromCore(coreUrl);
      } catch (e) {
        console.error("Error: could not fetch config from Core:", e.message || e);
        process.exit(1);
      }
      if (escrowConfig.rpcUrl && escrowConfig.contractAddress && address.startsWith("0x")) {
        const { Contract, JsonRpcProvider } = await import("ethers");
        const provider = new JsonRpcProvider(escrowConfig.rpcUrl);
        const contract = new Contract(escrowConfig.contractAddress, ["function balanceOf(address) view returns (uint256)"], provider);
        const wei = await contract.balanceOf(address);
        const cu = Number(wei) / escrowConfig.cuToWei;
        console.log("Balance (wei):", wei.toString());
        console.log("Balance (CU):", cu);
      } else {
        const cu = await getBalanceFromCore(coreUrl, address);
        console.log("Balance (CU):", cu);
      }
    });
  return cmd;
}

export { balanceCmd };
