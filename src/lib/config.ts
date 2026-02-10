import fs from "fs";
import yaml from "yaml";
import { defaultConfigPath, defaultDatabasePath, expandHome } from "./paths";

export type CuratorConfig = {
  database: {
    path: string;
  };
};

type PartialConfig = Partial<CuratorConfig> & {
  database?: Partial<CuratorConfig["database"]>;
};

const DEFAULT_CONFIG: CuratorConfig = {
  database: {
    path: defaultDatabasePath(),
  },
};

export function loadConfig(): CuratorConfig {
  const configPath = expandHome(
    process.env.CURATOR_CONFIG_PATH ?? defaultConfigPath()
  );

  let fileConfig: PartialConfig = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = yaml.parse(raw);
    if (parsed && typeof parsed === "object") {
      fileConfig = parsed as PartialConfig;
    }
  }

  const dbPath =
    process.env.CURATOR_DB_PATH ??
    fileConfig.database?.path ??
    DEFAULT_CONFIG.database.path;

  return {
    database: { path: expandHome(dbPath) },
  };
}
