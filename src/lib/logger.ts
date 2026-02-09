/**
 * Logger that writes to stderr to keep stdout clean for machine output.
 * CLI convention: stdout = data (JSON, IDs), stderr = progress/diagnostics.
 */
export function log(message: string): void {
  process.stderr.write(`${message}\n`);
}
