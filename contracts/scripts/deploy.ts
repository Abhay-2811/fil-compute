import { ethers } from "hardhat";

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) {
    throw new Error("No signer: set PRIVATE_KEY in .env (or env) for filecoin_calibration");
  }
  console.log("Deploying JobEscrow with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const JobEscrow = await ethers.getContractFactory("JobEscrow");
  const contract = await JobEscrow.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("JobEscrow deployed to:", address);

  // For Core EVM adapter, set:
  // ESCROW_RPC_URL=<network rpc>
  // ESCROW_CONTRACT_ADDRESS=<address>
  // ESCROW_SIGNER_PRIVATE_KEY=<relayer key>
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
