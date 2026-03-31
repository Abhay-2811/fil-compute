#!/usr/bin/env node
/**
 * fil-compute CLI: escrow deposit/balance, run job from YAML.
 * Only Core URL is required (env CORE_URL or --core-url). Escrow RPC and contract come from Core GET /config.
 */
import "dotenv/config";
import { Command } from "commander";
import { depositCmd } from "../lib/deposit.mjs";
import { balanceCmd } from "../lib/balance.mjs";
import { runCmd } from "../lib/run.mjs";
import { uploadPdpCmd } from "../lib/storage/upload-pdp.mjs";

const program = new Command();

program
  .name("fil-compute")
  .description("Client for fil-compute: escrow and job run")
  .version("0.1.0");

program
  .command("escrow")
  .description("Escrow: deposit funds, check balance")
  .addCommand(depositCmd())
  .addCommand(balanceCmd());

program
  .command("storage")
  .description("Storage: upload input data")
  .addCommand(uploadPdpCmd());

program.addCommand(runCmd());

program.parse();
