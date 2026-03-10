# JobEscrow contract

EVM escrow for datatzen jobs. **Balance-based:** clients `deposit()`; Core (signer) calls `settleSuccess(user, jobId, attemptId, cuUsed, nodePayout)` when a job succeeds. Constructor takes signer address (Core’s escrow signer). Spec: [docs/evm-escrow-spec.md](../docs/evm-escrow-spec.md).

## Build and deploy

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

Deploy script passes deployer address as signer. Use the printed contract address and `http://127.0.0.1:8545` as `ESCROW_RPC_URL` in Core.

### Filecoin Calibration testnet

1. Get tFIL from a [Calibration faucet](https://faucet.calibration.fildev.network/) (or similar) into an address you control.
2. Set env (same key will deploy and act as Core’s escrow signer for settleSuccess):
   - `PRIVATE_KEY` — hex private key (with or without `0x`) for the funded address.
   - `FILECOIN_TESTNET_RPC_URL` — your RPC URL (optional; defaults to public Calibration RPC).
3. Deploy:
   ```bash
   npm run deploy:filecoin_testnet
   ```
4. Set Core env for EVM escrow:
   - `ESCROW_PROVIDER=evm`
   - `ESCROW_RPC_URL` — same Filecoin testnet RPC URL.
   - `ESCROW_CONTRACT_ADDRESS` — address printed by deploy.
   - `ESCROW_SIGNER_PRIVATE_KEY` — same private key (Core uses it to sign settleSuccess).
   - `NODES` — must include a **payout address** per node so the contract can pay the node on success, e.g.:
     ```json
     {"node-001":{"url":"https://compute.example.com","payout_address":"0xYourNodeWalletAddress"}}
     ```
     Or set `NODE_PAYOUT_ADDRESSES` as JSON: `{"node-001":"0x..."}`.
5. Clients add funds with `deposit()` (e.g. via `fil-compute escrow deposit`); signer only deducts on job success.

### Other public testnets (e.g. Sepolia)

1. Add network in `hardhat.config.ts` (e.g. `sepolia` with `url`, `chainId`, `accounts` from `PRIVATE_KEY`).
2. Set `SEPOLIA_RPC_URL` and `PRIVATE_KEY`, then: `npx hardhat run scripts/deploy.ts --network sepolia`.
3. Set Core env: `ESCROW_RPC_URL`, `ESCROW_CONTRACT_ADDRESS`, `ESCROW_SIGNER_PRIVATE_KEY`, `ESCROW_PROVIDER=evm`, and node payout addresses as above.

## Testing the payment flow

1. Deploy the contract (local or Filecoin testnet) and configure Core with `ESCROW_PROVIDER=evm` and the node’s `payout_address` in `NODES` or `NODE_PAYOUT_ADDRESSES`.
2. Submit a job (e.g. via E2E or `curl` to Core `POST /jobs`) with `max_cost_cu` high enough to cover the run (e.g. 100). The signer’s balance is locked on-chain for that job.
3. When the job completes successfully, Core calls `settleSuccess` on the contract: the node receives `cu_used` (in wei) and the remainder goes back to the signer. On failure (preflight/node), Core calls `refund` and the full locked amount returns to the signer.
4. Optional: run live E2E with EVM escrow: start Core with the env above and your live node, then:
   ```bash
   LIVE_CORE_URL=https://core.abhayu.com LIVE_NODE_ID=node-001 LIVE_DATASET_ID=12145 node e2e/run-e2e.mjs
   ```
   Check the contract (e.g. on a block explorer) for `Locked` / `Settled` events.
