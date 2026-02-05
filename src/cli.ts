#!/usr/bin/env node

import { Command } from "commander";
import { registerSearchCommand } from "./commands/search";
import { registerSyncCommand } from "./commands/sync";

const program = new Command();

program
  .name("curator")
  .description("A CLI-first music curation toolkit")
  .version("1.0.0");

registerSyncCommand(program);
registerSearchCommand(program);

program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
