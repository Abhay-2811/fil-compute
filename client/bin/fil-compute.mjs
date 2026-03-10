#!/usr/bin/env node
/**
 * fil-compute CLI: escrow deposit/balance, run job from YAML.
 * Env: CORE_URL, ESCROW_RPC_URL, ESCROW_CONTRACT_ADDRESS, ESCROW_CU_TO_WEI (optional, default 1e12).
 */
import { Command } from "commander";
import { depositCmd } from "../lib/deposit.mjs";
import { balanceCmd } from "../lib/balance.mjs";
import { runCmd } from "../lib/run.mjs";

const program = new Command();

program
  .name("fil-compute")
  .description("Client for datatzen compute: escrow and job run")
  .version("0.1.0");

program
  .command("escrow")
  .description("Escrow: deposit funds, check balance")
  .addCommand(depositCmd())
  .addCommand(balanceCmd());

program.addCommand(runCmd());

program.parse();
