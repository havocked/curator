#!/usr/bin/env node

import { Command } from "commander";
import { registerArrangeCommand } from "./commands/arrange";
import { registerExportCommand } from "./commands/export";
import { registerFilterCommand } from "./commands/filter";
import { registerSearchCommand } from "./commands/search";
import { registerSyncCommand } from "./commands/sync";

const program = new Command();

program
  .name("curator")
  .description("A CLI-first music curation toolkit")
  .version("1.0.0");

registerSyncCommand(program);
registerSearchCommand(program);
registerExportCommand(program);
registerFilterCommand(program);
registerArrangeCommand(program);

program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
