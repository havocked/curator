import os from "os";
import path from "path";

export function expandHome(inputPath: string): string {
  if (!inputPath.startsWith("~")) {
    return inputPath;
  }
  if (inputPath === "~") {
    return os.homedir();
  }
  return path.join(os.homedir(), inputPath.slice(2));
}

export function defaultConfigPath(): string {
  return path.join(os.homedir(), ".config", "curator", "config.yaml");
}

export function defaultDatabasePath(): string {
  return path.join(os.homedir(), "clawd", "projects", "curator", "data", "curator.db");
}
