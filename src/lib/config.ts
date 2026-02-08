import fs from "fs";
import yaml from "yaml";
import { defaultConfigPath, defaultDatabasePath, expandHome } from "./paths";

export type CuratorConfig = {
  tidal: {
    service_url: string;
  };
  database: {
    path: string;
  };
};

type PartialConfig = Partial<CuratorConfig> & {
  tidal?: Partial<CuratorConfig["tidal"]>;
  database?: Partial<CuratorConfig["database"]>;
};

const DEFAULT_CONFIG: CuratorConfig = {
  tidal: {
    service_url: "http://localhost:3001",
  },
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

  const serviceUrl =
    process.env.CURATOR_TIDAL_SERVICE_URL ??
    fileConfig.tidal?.service_url ??
    DEFAULT_CONFIG.tidal.service_url;

  const dbPath =
    process.env.CURATOR_DB_PATH ??
    fileConfig.database?.path ??
    DEFAULT_CONFIG.database.path;

  return {
    tidal: {
      service_url: expandHome(serviceUrl),
    },
    database: { path: expandHome(dbPath) },
  };
}
