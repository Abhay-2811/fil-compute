import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "src",
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Filecoin Calibration testnet (FVM). Chain ID 314159. Use tFIL from faucet.
    filecoin_calibration: {
      url: process.env.FILECOIN_TESTNET_RPC_URL || process.env.ESCROW_RPC_URL || "https://api.calibration.node.glif.io/rpc/v1",
      chainId: 314159,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Add other chains as needed, e.g.:
    // sepolia: { url: process.env.SEPOLIA_RPC_URL ?? "", chainId: 11155111, accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [] },
  },
};

export default config;
