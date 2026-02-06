import fs from "fs";
import yaml from "yaml";
import {
  defaultConfigPath,
  defaultDatabasePath,
  defaultTidalPythonPath,
  defaultTidalSessionPath,
  expandHome,
} from "./paths";

export type CuratorConfig = {
  tidal: {
    service_url: string;
    session_path: string;
    python_path: string;
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
    session_path: defaultTidalSessionPath(),
    python_path: defaultTidalPythonPath(),
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

  const merged: CuratorConfig = {
    tidal: {
      service_url:
        fileConfig.tidal?.service_url ?? DEFAULT_CONFIG.tidal.service_url,
      session_path:
        fileConfig.tidal?.session_path ?? DEFAULT_CONFIG.tidal.session_path,
      python_path:
        fileConfig.tidal?.python_path ?? DEFAULT_CONFIG.tidal.python_path,
    },
    database: {
      path: fileConfig.database?.path ?? DEFAULT_CONFIG.database.path,
    },
  };

  const serviceUrl =
    process.env.CURATOR_TIDAL_SERVICE_URL ?? merged.tidal.service_url;
  const sessionPath =
    process.env.CURATOR_TIDAL_SESSION_PATH ?? merged.tidal.session_path;
  const pythonPath =
    process.env.CURATOR_TIDAL_PYTHON_PATH ?? merged.tidal.python_path;
  const dbPath = process.env.CURATOR_DB_PATH ?? merged.database.path;

  const expandedPythonPath = expandHome(pythonPath);
  const resolvedPythonPath =
    fs.existsSync(expandedPythonPath) ||
    pythonPath !== DEFAULT_CONFIG.tidal.python_path
      ? expandedPythonPath
      : "python3";

  return {
    tidal: {
      service_url: expandHome(serviceUrl),
      session_path: expandHome(sessionPath),
      python_path: resolvedPythonPath,
    },
    database: { path: expandHome(dbPath) },
  };
}
