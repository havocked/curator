import { Command } from "commander";
import fs from "fs";
import { loadConfig } from "../lib/config";
import { applySchema, getFavoritedTrackIds, openDatabase } from "../db";

type FilterOptions = {
  familiar?: boolean;
  discovery?: boolean;
  limit?: number;
};

export type FilterMode = "familiar" | "discovery";

export type TrackEntry = {
  item: unknown;
  id: number | null;
};

function coerceId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export function extractTrackEntries(payload: unknown): TrackEntry[] {
  const collection = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null
      ? (payload as { tracks?: unknown[] }).tracks
      : undefined;

  if (!Array.isArray(collection)) {
    throw new Error("Input JSON must be an array or an object with 'tracks'.");
  }

  return collection.map((item) => {
    if (typeof item === "number" || typeof item === "string") {
      return { item, id: coerceId(item) };
    }

    if (typeof item === "object" && item !== null) {
      const record = item as { id?: unknown; tidal_id?: unknown; track_id?: unknown };
      const id =
        coerceId(record.tidal_id) ?? coerceId(record.id) ?? coerceId(record.track_id);
      return { item, id };
    }

    return { item, id: null };
  });
}

function normalizeLimit(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

export function filterTracks(
  payload: unknown,
  favoriteIds: Set<number>,
  mode: FilterMode,
  limit?: number
): { count: number; tracks: unknown[] } {
  const entries = extractTrackEntries(payload);
  const filtered = entries.filter((entry) => {
    if (entry.id === null) {
      return false;
    }
    const isFavorite = favoriteIds.has(entry.id);
    return mode === "familiar" ? isFavorite : !isFavorite;
  });

  const limited =
    typeof limit === "number" && Number.isFinite(limit) ? filtered.slice(0, limit) : filtered;

  const tracks = limited.map((entry) => entry.item);
  return { count: tracks.length, tracks };
}

export function formatFilterOutput(tracks: { count: number; tracks: unknown[] }): string {
  return JSON.stringify(tracks, null, 2);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", (error) => reject(error));
  });
}

function resolveMode(options: FilterOptions): FilterMode {
  if (options.familiar && options.discovery) {
    throw new Error("Use only one of --familiar or --discovery.");
  }
  if (options.familiar) {
    return "familiar";
  }
  if (options.discovery) {
    return "discovery";
  }
  throw new Error("Only --familiar or --discovery is supported right now.");
}

export async function runFilter(
  inputPath: string | undefined,
  options: FilterOptions
): Promise<void> {
  const mode = resolveMode(options);
  const limit = normalizeLimit(options.limit);
  let raw = "";

  if (inputPath) {
    raw = fs.readFileSync(inputPath, "utf8");
  } else if (!process.stdin.isTTY) {
    raw = await readStdin();
  } else {
    throw new Error("Provide a track list file path or pipe JSON via stdin.");
  }

  const payload = JSON.parse(raw);

  const config = loadConfig();
  const db = openDatabase(config.database.path);
  try {
    applySchema(db);
    const favoriteIds = new Set(getFavoritedTrackIds(db));
    const result = filterTracks(payload, favoriteIds, mode, limit);
    console.log(formatFilterOutput(result));
  } finally {
    db.close();
  }
}

export function registerFilterCommand(program: Command): void {
  program
    .command("filter")
    .description("Filter a list of tracks (stdin or file)")
    .argument("[input]", "Track list JSON file (or stdin)")
    .option("--familiar", "Only keep tracks marked as familiar (favorites)")
    .option("--discovery", "Only keep tracks not marked as familiar")
    .option(
      "--limit <count>",
      "Limit results",
      (value) => Number.parseInt(value, 10)
    )
    .action(async (input: string | undefined, options: FilterOptions) => {
      await runFilter(input, options);
    });
}
