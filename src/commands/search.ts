import { Command } from "commander";
import { loadConfig } from "../lib/config";
import { applySchema, getFavoritedTracks, openDatabase, type FavoritedTrack } from "../db";

type SearchOptions = {
  favorited?: boolean;
  limit?: number;
  format?: string;
};

type OutputFormat = "text" | "json" | "ids";

function normalizeFormat(value: string | undefined): OutputFormat {
  const normalized = (value ?? "text").toLowerCase();
  if (normalized === "text" || normalized === "json" || normalized === "ids") {
    return normalized;
  }
  throw new Error("Unsupported format. Use text, json, or ids.");
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 50;
  }
  return Math.floor(value);
}

function formatLabel(value: string | null): string {
  return value && value.trim().length > 0 ? value : "Unknown";
}

export function formatTracksAsText(tracks: FavoritedTrack[]): string {
  if (tracks.length === 0) {
    return "Found 0 favorite tracks.";
  }
  const lines = [`Found ${tracks.length} favorite tracks.`];
  tracks.forEach((track, index) => {
    const artist = formatLabel(track.artist);
    const album = track.album ? ` (${track.album})` : "";
    lines.push(`  ${index + 1}. ${artist} - ${track.title}${album}`);
  });
  return lines.join("\n");
}

export function formatTracksAsJson(tracks: FavoritedTrack[]): string {
  const output = {
    count: tracks.length,
    tracks: tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist: formatLabel(track.artist),
      album: track.album,
      duration: track.duration,
      audio_features:
        track.bpm != null || track.key != null
          ? {
              bpm: track.bpm ?? null,
              key: track.key ?? null,
            }
          : undefined,
    })),
  };
  return JSON.stringify(output, null, 2);
}

export function formatTracksAsIds(tracks: FavoritedTrack[]): string {
  return tracks.map((track) => String(track.id)).join("\n");
}

export async function runSearch(options: SearchOptions): Promise<void> {
  if (!options.favorited) {
    throw new Error("Only --favorited is supported right now.");
  }

  const config = loadConfig();
  const db = openDatabase(config.database.path);
  try {
    applySchema(db);
    const limit = normalizeLimit(options.limit);
    const tracks = getFavoritedTracks(db, limit);
    const format = normalizeFormat(options.format);

    if (format === "json") {
      console.log(formatTracksAsJson(tracks));
      return;
    }

    if (format === "ids") {
      const output = formatTracksAsIds(tracks);
      if (output.length > 0) {
        console.log(output);
      }
      return;
    }

    console.log(formatTracksAsText(tracks));
  } finally {
    db.close();
  }
}

export function registerSearchCommand(program: Command): void {
  program
    .command("search")
    .description("Find tracks matching criteria")
    .option("--favorited", "Only tracks marked as favorite")
    .option(
      "--limit <count>",
      "Limit results (default: 50)",
      (value) => Number.parseInt(value, 10),
      50
    )
    .option("--format <format>", "Output format (text|json|ids)", "text")
    .action(async (options: SearchOptions) => {
      await runSearch(options);
    });
}
