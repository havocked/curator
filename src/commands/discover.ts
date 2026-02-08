import { Command } from "commander";
import { loadConfig } from "../lib/config";
import { applySchema, openDatabase, upsertDiscoveredTracks } from "../db";
import { getLabelArtists, searchLabel } from "../providers/musicbrainz";
import {
  getAlbumTracks,
  getArtistTopTracks,
  getPlaylistTracks,
  initTidalClient,
  searchArtists,
  searchTracks,
} from "../services/tidalSdk";
import type { Track } from "../services/types";

type DiscoverOptions = {
  playlist?: string;
  album?: string;
  genre?: string;
  tags?: string;
  artists?: string;
  label?: string;
  preview?: boolean;
  limitPerArtist?: number;
  limit?: number;
  format?: string;
  via?: string;
  serviceUrl?: string;
  popularityMin?: number;
  popularityMax?: number;
  yearMin?: number;
  yearMax?: number;
};

type DiscoverFormat = "json" | "text" | "ids";

type DiscoverQuery = {
  playlist?: string;
  album?: string;
  genre?: string;
  tags?: string[];
  artists?: string[];
  label?: string;
  limit: number;
};

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

function normalizeLimitPerArtist(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 5;
  }
  return Math.floor(value);
}

export function parseTags(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
}

export function parseArtists(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

export function buildSearchQuery(
  genre: string | undefined,
  tags: string[]
): string {
  const parts: string[] = [];
  const normalizedGenre = genre?.trim();
  if (normalizedGenre) {
    parts.push(normalizedGenre);
  }
  for (const tag of tags) {
    const t = tag.trim();
    if (t && !parts.includes(t)) {
      parts.push(t);
    }
  }
  return parts.join(" ");
}

export function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<number>();
  const unique: Track[] = [];
  for (const track of tracks) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    unique.push(track);
  }
  return unique;
}

type TrackFilters = {
  popularityMin?: number | undefined;
  popularityMax?: number | undefined;
  yearMin?: number | undefined;
  yearMax?: number | undefined;
};

export function filterTracks(tracks: Track[], filters: TrackFilters): Track[] {
  return tracks.filter((track) => {
    if (filters.popularityMin != null) {
      if (track.popularity == null || track.popularity < filters.popularityMin) return false;
    }
    if (filters.popularityMax != null) {
      if (track.popularity == null || track.popularity > filters.popularityMax) return false;
    }
    if (filters.yearMin != null) {
      if (track.release_year == null || track.release_year < filters.yearMin) return false;
    }
    if (filters.yearMax != null) {
      if (track.release_year == null || track.release_year > filters.yearMax) return false;
    }
    return true;
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discoverByArtists(
  names: string[],
  limitPerArtist: number
): Promise<Track[]> {
  const collected: Track[] = [];

  for (const name of names) {
    console.error(`[discover] Searching for artist: ${name}`);
    const artists = await searchArtists(name, 1);
    console.error(`[discover] Found ${artists.length} artists`);

    if (artists.length === 0) {
      console.error(`[discover] No artists found for: ${name}`);
      continue;
    }

    const artist = artists[0];
    if (!artist) {
      continue;
    }
    console.error(`[discover] Getting tracks for artist: ${artist.name} (ID: ${artist.id})`);
    // Small delay to avoid rate limiting after search requests
    await wait(300);
    const tracks = await getArtistTopTracks(artist.id, limitPerArtist);
    console.error(`[discover] Got ${tracks.length} tracks`);
    collected.push(...tracks);
  }

  return dedupeTracks(collected);
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "Unknown";
}

function formatTrackList(tracks: Track[]): string[] {
  return tracks.map((track, index) => {
    const artist = formatLabel(track.artist);
    const album = track.album ? track.album : "Unknown";
    const year =
      track.release_year != null ? String(track.release_year) : "Unknown";
    const duration =
      track.duration && track.duration > 0
        ? `${Math.floor(track.duration / 60)}:${String(
            track.duration % 60
          ).padStart(2, "0")}`
        : "?:??";
    const bpm =
      track.audio_features?.bpm != null
        ? `${Math.round(track.audio_features.bpm)} BPM`
        : null;
    const key = track.audio_features?.key ?? null;
    const features =
      bpm || key ? ` [${[bpm, key].filter(Boolean).join(", ")}]` : "";

    return `  ${index + 1}. ${track.title} - ${artist} (${album}, ${year}) [${duration}]${features}`;
  });
}

export function formatDiscoverAsText(sourceLabel: string, tracks: Track[]): string {
  if (tracks.length === 0) {
    return `Discovered 0 tracks from source ${sourceLabel}.`;
  }
  const lines = [
    `Discovered ${tracks.length} tracks from source ${sourceLabel}.`,
    ...formatTrackList(tracks),
  ];
  return lines.join("\n");
}

export function formatDiscoverAsJson(
  query: DiscoverQuery,
  tracks: Track[],
  limit: number
): string {
  const source = query.label
    ? "label"
    : query.artists
      ? "artists"
      : query.album
        ? "album"
        : query.playlist
          ? "playlist"
          : "search";
  const output = {
    count: tracks.length,
    source,
    query: {
      playlist: query.playlist,
      album: query.album,
      genre: query.genre,
      tags: query.tags,
      artists: query.artists,
      label: query.label,
      limit,
    },
    tracks: tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artist: formatLabel(track.artist),
      album: track.album,
      duration: track.duration,
      release_year: track.release_year ?? null,
      popularity: track.popularity ?? null,
      genres: track.genres?.length ? track.genres : undefined,
      mood: track.mood?.length ? track.mood : undefined,
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

export function formatDiscoverAsIds(tracks: Track[]): string {
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
  const format = normalizeFormat(options.preview ? "text" : options.format);
  const limit = normalizeLimit(options.limit);
  const config = loadConfig();
  normalizeVia(options.via);

  let playlistId: string | undefined;
  let albumId: string | undefined;
  let artistNames: string[] | undefined;
  let labelName: string | undefined;
  let tracks: Track[] = [];

  if (options.label) {
    await initTidalClient();
    labelName = options.label.trim();
    if (!labelName) {
      throw new Error("Provide a label name.");
    }
    const label = await searchLabel(labelName);
    if (!label) {
      throw new Error(`Label not found: ${labelName}`);
    }
    const names = await getLabelArtists(label.mbid);
    if (names.length === 0) {
      throw new Error(`No artists found for label: ${label.name}`);
    }
    artistNames = names;
    const limitPerArtist = normalizeLimitPerArtist(options.limitPerArtist);
    tracks = await discoverByArtists(artistNames, limitPerArtist);
    if (tracks.length === 0) {
      throw new Error("No tracks found for label artists.");
    }
  } else if (options.artists) {
    await initTidalClient();
    artistNames = parseArtists(options.artists);
    if (artistNames.length === 0) {
      throw new Error("Provide at least one artist name.");
    }

    const limitPerArtist = normalizeLimitPerArtist(options.limitPerArtist);
    tracks = await discoverByArtists(artistNames, limitPerArtist);
    if (tracks.length === 0) {
      throw new Error("No tracks found for the provided artists.");
    }
  } else if (options.album) {
    await initTidalClient();
    albumId = options.album;
    console.error(`[discover] Fetching album tracks: ${albumId}`);
    tracks = await getAlbumTracks(albumId, limit);
    console.error(`[discover] Got ${tracks.length} tracks`);
    if (tracks.length === 0) {
      throw new Error(`No tracks found for album: ${albumId}`);
    }
  } else if (options.playlist) {
    await initTidalClient();
    playlistId = options.playlist;
    tracks = await getPlaylistTracks(playlistId, limit);
  } else {
    const tags = parseTags(options.tags);
    const genre = options.genre?.trim();
    if (!genre && tags.length === 0) {
      throw new Error(
        "Provide --playlist, --album, --artists, --label, or --genre/--tags to discover tracks."
      );
    }

    await initTidalClient();

    const query = buildSearchQuery(genre, tags);
    console.error(`[discover] Searching tracks: ${query}`);
    const found = await searchTracks(query, limit);
    console.error(`[discover] Found ${found.length} tracks`);
    tracks = found;

    if (tracks.length === 0) {
      throw new Error("No tracks found for the provided genre/tags.");
    }
  }

  // Apply filters
  const filters: TrackFilters = {
    popularityMin: options.popularityMin,
    popularityMax: options.popularityMax,
    yearMin: options.yearMin,
    yearMax: options.yearMax,
  };
  const hasFilters = Object.values(filters).some((v) => v != null);
  if (hasFilters) {
    const beforeCount = tracks.length;
    tracks = filterTracks(tracks, filters);
    console.error(`[discover] Filtered ${beforeCount} → ${tracks.length} tracks`);
  }

  tracks = tracks.slice(0, limit);

  const db = openDatabase(config.database.path);
  const discoveredVia = labelName
    ? `label:${labelName.toLowerCase()}`
    : albumId
      ? `album:${albumId}`
      : playlistId
        ? `playlist:${playlistId}`
        : artistNames
          ? `artists:${artistNames.map((name) => name.toLowerCase()).join(",")}`
          : `search:${(options.genre ?? "unknown").toLowerCase()}`;
  try {
    applySchema(db);
    upsertDiscoveredTracks(db, tracks, discoveredVia);
  } finally {
    db.close();
  }

  if (format === "text") {
    const sourceLabel = labelName
      ? `label:${labelName}`
      : albumId
        ? `album:${albumId}`
        : playlistId
          ? `playlist:${playlistId}`
          : artistNames
            ? `artists:${artistNames.join(", ")}`
            : "playlist-search";
    console.log(formatDiscoverAsText(sourceLabel, tracks));
    return;
  }

  if (format === "ids") {
    const output = formatDiscoverAsIds(tracks);
    if (output.length > 0) {
      console.log(output);
    }
    return;
  }

  const query: DiscoverQuery = { limit };
  const tags = parseTags(options.tags);
  if (playlistId) {
    query.playlist = playlistId;
  }
  if (albumId) {
    query.album = albumId;
  }
  if (artistNames && artistNames.length > 0) {
    query.artists = artistNames;
  }
  if (labelName) {
    query.label = labelName;
  }
  const genre = options.genre?.trim();
  if (genre) {
    query.genre = genre;
  }
  if (tags.length > 0) {
    query.tags = tags;
  }
  console.log(formatDiscoverAsJson(query, tracks, limit));
}

export function registerDiscoverCommand(program: Command): void {
  program
    .command("discover")
    .description("Discover new tracks from Tidal catalog")
    .option("--playlist <id>", "Discover tracks from a playlist ID")
    .option("--album <id>", "Discover all tracks from an album")
    .option("--genre <genre>", "Discover tracks by genre")
    .option("--tags <tags>", "Comma-separated tags to refine genre search")
    .option("--artists <names>", "Comma-separated artist names")
    .option("--label <name>", "Record label name (MusicBrainz)")
    .option("--preview", "Show text preview (alias for --format text)")
    .option(
      "--limit-per-artist <count>",
      "Max tracks per artist (default: 5)",
      (value) => Number.parseInt(value, 10)
    )
    .option("--limit <count>", "Limit results (default: 50)", (value) => Number.parseInt(value, 10))
    .option("--format <format>", "Output format (json|text|ids)", "json")
    .option("--popularity-min <value>", "Min popularity (0.0-1.0)", parseFloat)
    .option("--popularity-max <value>", "Max popularity (0.0-1.0)", parseFloat)
    .option("--year-min <year>", "Min release year", (v) => Number.parseInt(v, 10))
    .option("--year-max <year>", "Max release year", (v) => Number.parseInt(v, 10))
    .option("--via <mode>", "Discovery mode (direct)", "direct")
    .action(async (options: DiscoverOptions) => {
      await runDiscover(options);
    });
}
