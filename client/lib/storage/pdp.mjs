import fs from "fs";
import * as piece from "@filoz/synapse-core/piece";
import * as sp from "@filoz/synapse-core/sp";
import { getPDPProvider } from "@filoz/synapse-core/sp-registry";
import { calibration, mainnet } from "@filoz/synapse-core/chains";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function parseProviderId(value) {
  try {
    const id = BigInt(String(value));
    if (id <= 0n) throw new Error("provider_id must be > 0");
    return id;
  } catch {
    throw new Error(`Invalid --provider-id: ${value}`);
  }
}

function resolveChain(name) {
  const v = String(name || "calibration").trim().toLowerCase();
  if (v === "calibration") return calibration;
  if (v === "mainnet") return mainnet;
  throw new Error(`Unsupported chain: ${name}. Use calibration|mainnet`);
}

export async function uploadInputToPdp({
  filePath,
  providerId,
  privateKey,
  chain = "calibration",
  rpcUrl,
}) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("--file is required");
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const parsedProviderId = parseProviderId(providerId);
  const selectedChain = resolveChain(chain);

  const pk = String(privateKey || "").trim();
  if (!pk) throw new Error("--private-key is required");
  const key = pk.startsWith("0x") ? pk : `0x${pk}`;

  const publicClient = createPublicClient({
    chain: selectedChain,
    transport: http(rpcUrl || undefined),
  });
  const account = privateKeyToAccount(key);
  const walletClient = createWalletClient({
    account,
    chain: selectedChain,
    transport: http(rpcUrl || undefined),
  });

  const provider = await getPDPProvider(publicClient, { providerId: parsedProviderId });
  if (!provider) {
    throw new Error(`Provider not found for provider_id=${parsedProviderId.toString()}`);
  }
  if (!provider.pdp || !provider.pdp.serviceURL) {
    throw new Error(`Provider ${parsedProviderId.toString()} missing pdp.serviceURL`);
  }
  if (!provider.payee) {
    throw new Error(`Provider ${parsedProviderId.toString()} missing payee`);
  }

  const data = new Uint8Array(fs.readFileSync(filePath));
  const pieceCid = piece.calculate(data);
  const pieceSize = piece.getSize(pieceCid);

  await sp.uploadPiece({
    data,
    pieceCid,
    serviceURL: provider.pdp.serviceURL,
  });
  await sp.findPiece({
    pieceCid,
    serviceURL: provider.pdp.serviceURL,
    retry: true,
  });

  const txStart = await sp.createDataSetAndAddPieces(walletClient, {
    serviceURL: provider.pdp.serviceURL,
    payee: provider.payee,
    cdn: false,
    pieces: [{ pieceCid }],
  });

  const confirmed = await sp.waitForCreateDataSetAddPieces({
    statusUrl: txStart.statusUrl,
  });

  return {
    providerId: parsedProviderId.toString(),
    providerServiceUrl: provider.pdp.serviceURL,
    pieceCid: pieceCid.toString(),
    pieceSize,
    dataSetId: String(confirmed.dataSetId),
    piecesIds: confirmed.piecesIds,
    hash: confirmed.hash,
    statusUrl: txStart.statusUrl,
  };
}
