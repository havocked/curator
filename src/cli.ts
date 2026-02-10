#!/usr/bin/env node

import { Command } from "commander";
import { registerArrangeCommand } from "./commands/arrange";
import { registerCacheCommand } from "./commands/cache";
import { registerDiscoverCommand } from "./commands/discover";
import { registerExportCommand } from "./commands/export";
import { registerFilterCommand } from "./commands/filter";
import { registerLibraryCommand } from "./commands/library";

const program = new Command();

program
  .name("curator")
  .description("A CLI-first music curation toolkit")
  .version("1.0.0");

registerLibraryCommand(program);
registerDiscoverCommand(program);
registerFilterCommand(program);
registerArrangeCommand(program);
registerExportCommand(program);
registerCacheCommand(program);

program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
