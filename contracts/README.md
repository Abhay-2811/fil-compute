# JobEscrow contract

Minimal EVM escrow for datatzen jobs. Spec: [docs/evm-escrow-spec.md](../docs/evm-escrow-spec.md).

## Build and deploy (WSL)

From this directory (`contracts/`):

```bash
npm install
npm run compile
```

### Local (Hardhat node)

```bash
npx hardhat node
```

In another terminal, from `contracts/`:

```bash
npm run deploy:local
```

Use the printed contract address and `http://127.0.0.1:8545` as `ESCROW_RPC_URL` in Core.

### Public testnet (e.g. Sepolia)

1. Add network and account in `hardhat.config.ts` (e.g. `sepolia` with `process.env.PRIVATE_KEY`).
2. Set `SEPOLIA_RPC_URL` and `PRIVATE_KEY` in env.
3. From `contracts/`: `npx hardhat run scripts/deploy.ts --network sepolia`.
4. Set Core env: `ESCROW_RPC_URL`, `ESCROW_CONTRACT_ADDRESS`, `ESCROW_SIGNER_PRIVATE_KEY`, `ESCROW_PROVIDER=evm`.
