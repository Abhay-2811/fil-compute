import type { IEscrowProvider } from "./types.js";
import { memoryEscrow } from "../store/escrow.js";
import { evmEscrow } from "./evm-adapter.js";

const provider = process.env.ESCROW_PROVIDER === "evm" ? evmEscrow : memoryEscrow;

/** Resolved escrow provider (memory or evm) for Core to use. */
export const escrow: IEscrowProvider = provider;

export type { IEscrowProvider } from "./types.js";
