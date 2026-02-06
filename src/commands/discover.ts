import { Command } from "commander";
import { loadConfig } from "../lib/config";
import { applySchema, openDatabase, upsertDiscoveredTracks } from "../db";
import { fetchPlaylistTracksDirect } from "../services/tidalDirect";
import type { TidalTrack } from "../services/tidalService";

type DiscoverOptions = {
  playlist?: string;
  limit?: number;
  format?: string;
  via?: string;
  serviceUrl?: string;
  sessionPath?: string;
  pythonPath?: string;
};

type DiscoverFormat = "json" | "text" | "ids";

function normalizeFormat(value: string | undefined): DiscoverFormat {
  const normalized = (value ?? "json").toLowerCase();
  if (normalized === "json" || normalized === "text" || normalized === "ids") {
    return normalized;
  }
  throw new Error("Unsupported format. Use json, text, or ids.");
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 50;
  }
  return Math.floor(value);
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "Unknown";
}

function formatTrackList(tracks: TidalTrack[]): string[] {
  return tracks.map((track, index) => {
    const artist = formatLabel(track.artist);
    const album = track.album ? ` (${track.album})` : "";
    return `  ${index + 1}. ${artist} - ${track.title}${album}`;
  });
}

export function formatDiscoverAsText(
  playlistId: string,
  tracks: TidalTrack[]
): string {
  if (tracks.length === 0) {
    return `Discovered 0 tracks from playlist ${playlistId}.`;
  }
  const lines = [
    `Discovered ${tracks.length} tracks from playlist ${playlistId}.`,
    ...formatTrackList(tracks),
  ];
  return lines.join("\n");
}

export function formatDiscoverAsJson(
  playlistId: string,
  tracks: TidalTrack[],
  limit: number
): string {
  const output = {
    count: tracks.length,
    source: "playlist",
    query: {
      playlist: playlistId,
      limit,
    },
    tracks: tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist: formatLabel(track.artist),
      album: track.album,
      duration: track.duration,
      release_year: track.release_year ?? null,
      audio_features:
        track.audio_features && (track.audio_features.bpm != null || track.audio_features.key != null)
          ? {
              bpm: track.audio_features.bpm ?? null,
              key: track.audio_features.key ?? null,
            }
          : undefined,
    })),
  };
  return JSON.stringify(output, null, 2);
}

export function formatDiscoverAsIds(tracks: TidalTrack[]): string {
  return tracks.map((track) => String(track.id)).join("\n");
}

function normalizeVia(value: string | undefined): "direct" {
  const normalized = (value ?? "direct").toLowerCase();
  if (normalized === "direct") {
    return "direct";
  }
  throw new Error("Only --via direct is supported right now.");
}

export async function runDiscover(options: DiscoverOptions): Promise<void> {
  if (!options.playlist) {
    throw new Error("Only --playlist <id> is supported right now.");
  }

  const format = normalizeFormat(options.format);
  const limit = normalizeLimit(options.limit);
  const config = loadConfig();
  normalizeVia(options.via);

  const response = await fetchPlaylistTracksDirect({
    sessionPath: options.sessionPath ?? config.tidal.session_path,
    pythonPath: options.pythonPath ?? config.tidal.python_path,
    playlistId: options.playlist,
    limit,
  });

  const tracks = response.tracks.slice(0, limit);
  const db = openDatabase(config.database.path);
  try {
    applySchema(db);
    upsertDiscoveredTracks(db, tracks, `playlist:${response.playlist_id}`);
  } finally {
    db.close();
  }

  if (format === "text") {
    console.log(formatDiscoverAsText(response.playlist_id, tracks));
    return;
  }

  if (format === "ids") {
    const output = formatDiscoverAsIds(tracks);
    if (output.length > 0) {
      console.log(output);
    }
    return;
  }

  console.log(formatDiscoverAsJson(response.playlist_id, tracks, limit));
}

export function registerDiscoverCommand(program: Command): void {
  program
    .command("discover")
    .description("Discover new tracks from Tidal catalog")
    .option("--playlist <id>", "Discover tracks from a playlist ID")
    .option("--limit <count>", "Limit results (default: 50)", (value) => Number.parseInt(value, 10))
    .option("--format <format>", "Output format (json|text|ids)", "json")
    .option("--via <mode>", "Discovery mode (direct)", "direct")
    .option("--session-path <path>", "Path to tidal_session.json")
    .option("--python-path <path>", "Python interpreter for direct discovery")
    .action(async (options: DiscoverOptions) => {
      await runDiscover(options);
    });
}
