import { Command } from "commander";
import { loadConfig } from "../lib/config";
import { fetchFavoritesDirect } from "../services/tidalDirect";
import { TidalServiceClient } from "../services/tidalService";
import { applySchema, openDatabase, syncFavoriteTracks } from "../db";

type SyncOptions = {
  source?: string;
  only?: string;
  dryRun?: boolean;
  serviceUrl?: string;
  via?: string;
  sessionPath?: string;
  pythonPath?: string;
};

function parseOnly(value: string | undefined): string[] {
  if (!value) {
    return ["favorites"];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function formatFavoritesSummary(
  tracks: number,
  albums: number,
  artists: number
): string {
  return `  OK Favorites: ${tracks} tracks, ${albums} albums, ${artists} artists`;
}

function normalizeVia(value: string | undefined): "direct" | "service" {
  const normalized = (value ?? "direct").toLowerCase();
  if (normalized === "direct" || normalized === "service") {
    return normalized;
  }
  throw new Error("Only --via direct or --via service is supported.");
}

export async function runSync(options: SyncOptions): Promise<void> {
  const source = options.source ?? "tidal";
  if (source !== "tidal") {
    throw new Error("Only --source tidal is supported right now.");
  }

  const onlyItems = parseOnly(options.only);
  const unsupported = onlyItems.filter((item) => item !== "favorites");
  if (unsupported.length > 0) {
    throw new Error("Only --only favorites is supported right now.");
  }

  const config = loadConfig();
  const via = normalizeVia(options.via);
  const favorites =
    via === "direct"
      ? await fetchFavoritesDirect({
          sessionPath: options.sessionPath ?? config.tidal.session_path,
          pythonPath: options.pythonPath ?? config.tidal.python_path,
        })
      : await new TidalServiceClient(
          options.serviceUrl ?? config.tidal.service_url
        ).getFavorites();

  const output: string[] = [];
  output.push("Syncing from Tidal...");
  output.push(
    formatFavoritesSummary(
      favorites.tracks_count,
      favorites.albums_count,
      favorites.artists_count
    )
  );

  if (options.dryRun) {
    output.push("Dry run: no data written.");
    console.log(output.join("\n"));
    return;
  }

  const db = openDatabase(config.database.path);
  try {
    applySchema(db);
    const result = syncFavoriteTracks(db, favorites.favorites.tracks);
    output.push(
      `  OK Stored: ${result.upsertedTracks} tracks, ${result.favoriteSignals} favorite signals`
    );
    output.push(`  OK Audio features: ${result.audioFeatures} tracks`);
    output.push(`Sync complete. ${result.totalTracks} tracks in library.`);
    console.log(output.join("\n"));
  } finally {
    db.close();
  }
}

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Sync library data from Tidal")
    .option("--source <source>", "Data source (tidal)")
    .option("--only <items>", "Only sync specific data (favorites)")
    .option("--dry-run", "Show what would be synced")
    .option("--via <mode>", "Sync mode (direct|service)", "direct")
    .option("--service-url <url>", "Override Tidal service URL")
    .option("--session-path <path>", "Path to tidal_session.json")
    .option("--python-path <path>", "Python interpreter for direct sync")
    .action(async (options: SyncOptions) => {
      await runSync(options);
    });
}
