import * as piece from "@filoz/synapse-core/piece"
import * as sp from "@filoz/synapse-core/sp"
import { getPDPProvider } from "@filoz/synapse-core/sp-registry"
import { createPublicClient, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { calibration, mainnet } from "@filoz/synapse-core/chains"
import fs from "fs"
// Read-only client for queries
const publicClient = createPublicClient({
  chain: calibration, // or mainnet
  transport: http(),
})

// Wallet client for transactions
const account = privateKeyToAccount("0x794a52a6fa14fafd7bee714d7cc51dddb3890c690275281310efa5fb4a4c6a75")
const walletClient = createWalletClient({
  account,
  chain: calibration, // or mainnet
  transport: http(),
})
// 1. Select a provider
const provider = await getPDPProvider(publicClient, { providerId: 22n })

// 2. Calculate PieceCID and upload data (set INPUT_FILE to use sample-data, e.g. sample-data/sensor_readings.csv)
const inputPath = process.env.INPUT_FILE || "test.txt"
const data = new Uint8Array(fs.readFileSync(inputPath))
console.log(`Reading ${inputPath} (${data.length} bytes)`)
const pieceCid = piece.calculate(data)
const size = piece.getSize(pieceCid)
console.log(size) // size of the piece in bytes
// Upload the piece to the provider
await sp.uploadPiece({
  data,
  pieceCid,
  serviceURL: provider.pdp.serviceURL,
})
// Poll the provider to confirm the piece is stored
await sp.findPiece({
  pieceCid,
  serviceURL: provider.pdp.serviceURL,
  retry: true,
})

console.log(`Piece ${pieceCid.toString()} uploaded to provider ${provider.pdp.serviceURL}`)

// 3. Create a data set and add the piece on-chain
const result = await sp.createDataSetAndAddPieces(walletClient, {
  serviceURL: provider.pdp.serviceURL,
  payee: provider.payee,
  cdn: false,
  pieces: [{ pieceCid }],
})

// 4. Wait for confirmation
const confirmed = await sp.waitForCreateDataSetAddPieces({
  statusUrl: result.statusUrl,
})

const { dataSetId, piecesIds, hash } = confirmed

console.log(`Data set ${dataSetId} created and piece ${pieceCid.toString()} added to data set`)