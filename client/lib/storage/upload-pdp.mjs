import { Command } from "commander";
import { uploadInputToPdp } from "./pdp.mjs";

function uploadPdpCmd() {
  const cmd = new Command("upload-pdp")
    .description("Upload a local file to PDP and create dataset (returns dataset_id)")
    .requiredOption("--file <path>", "Path to local input file")
    .requiredOption("--provider-id <id>", "PDP provider id (numeric)")
    .requiredOption(
      "--private-key <key>",
      "Wallet private key for on-chain dataset creation"
    )
    .option("--chain <calibration|mainnet>", "Chain", "calibration")
    .option("--rpc-url <url>", "Optional RPC URL override")
    .option("--json", "Print machine-readable JSON", false)
    .action(async (opts) => {
      try {
        const out = await uploadInputToPdp({
          filePath: opts.file,
          providerId: opts.providerId,
          privateKey: opts.privateKey,
          chain: opts.chain,
          rpcUrl: opts.rpcUrl,
        });
        if (opts.json) {
          console.log(JSON.stringify(out, null, 2));
        } else {
          console.log("Provider ID:", out.providerId);
          console.log("PDP service:", out.providerServiceUrl);
          console.log("Piece CID:", out.pieceCid);
          console.log("Piece size:", out.pieceSize);
          console.log("Dataset ID:", out.dataSetId);
          console.log("Tx hash:", out.hash || "(n/a)");
          console.log("Use in run:", `--dataset-id ${out.dataSetId}`);
        }
      } catch (e) {
        console.error("PDP upload failed:", e && e.message ? e.message : String(e));
        process.exit(1);
      }
    });

  return cmd;
}

export { uploadPdpCmd };
