import { log } from "../lib/logger";
import { loadConfig } from "../lib/config";
import { applySchema, openDatabase, upsertDiscoveredTracks } from "../db";
import { initTidalClient } from "../services/tidalSdk";
import { filterTracks, hasActiveFilters } from "./filters";
import {
  formatAsIds,
  formatAsJson,
  formatAsText,
  type OutputFormat,
} from "./formatting";
import { discoverFromAlbum, discoverFromLatestAlbum } from "./sources/album";
import { discoverFromArtists } from "./sources/artists";
import { discoverFromLabel } from "./sources/label";
import { discoverFromPlaylist } from "./sources/playlist";
import { discoverFromRadio } from "./sources/radio";
import { discoverFromSearch } from "./sources/search";
import { discoverFromSimilar } from "./sources/similar";
import type { DiscoveryContext, DiscoveryResult, TrackFilters } from "./types";

export interface DiscoverOptions {
  playlist?: string;
  album?: string;
  latestAlbum?: string;
  similar?: string;
  radio?: string;
  genre?: string;
  tags?: string;
  artists?: string;
  label?: string;
  preview?: boolean;
  limitPerArtist?: number;
  limit?: number;
  format?: string;
  popularityMin?: number;
  popularityMax?: number;
  yearMin?: number;
  yearMax?: number;
}

// --- Input Parsing ---

export function parseTags(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
}

export function parseArtists(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function normalizeFormat(value: string | undefined): OutputFormat {
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

// --- Source Resolution ---

async function resolveSource(
  options: DiscoverOptions,
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  if (options.label) return discoverFromLabel(options.label, ctx);
  if (options.artists) return discoverFromArtists(parseArtists(options.artists), ctx);
  if (options.latestAlbum) return discoverFromLatestAlbum(options.latestAlbum, ctx);
  if (options.similar) return discoverFromSimilar(options.similar, ctx);
  if (options.radio) return discoverFromRadio(options.radio, ctx);
  if (options.album) return discoverFromAlbum(options.album, ctx);
  if (options.playlist) return discoverFromPlaylist(options.playlist, ctx);

  const tags = parseTags(options.tags);
  const genre = options.genre?.trim();
  return discoverFromSearch(genre, tags, ctx);
}

// --- Persistence ---

function persistTracks(
  result: DiscoveryResult,
  dbPath: string
): void {
  const db = openDatabase(dbPath);
  try {
    applySchema(db);
    upsertDiscoveredTracks(db, result.tracks, result.discoveredVia);
  } finally {
    db.close();
  }
}

// --- Output ---

function buildJsonQuery(options: DiscoverOptions, result: DiscoveryResult, limit: number) {
  const tags = parseTags(options.tags);
  const artists = parseArtists(options.artists);
  return {
    playlist: result.sourceName === "playlist" ? options.playlist : undefined,
    album: result.sourceName === "album" ? options.album : undefined,
    similar: options.similar,
    radio: options.radio,
    genre: options.genre?.trim() || undefined,
    tags: tags.length > 0 ? tags : undefined,
    artists: artists.length > 0 ? artists : undefined,
    label: options.label || undefined,
    limit,
  };
}

function outputResult(
  format: OutputFormat,
  options: DiscoverOptions,
  result: DiscoveryResult,
  limit: number
): void {
  if (format === "text") {
    console.log(formatAsText(result.sourceLabel, result.tracks));
    return;
  }
  if (format === "ids") {
    const output = formatAsIds(result.tracks);
    if (output.length > 0) console.log(output);
    return;
  }
  const query = buildJsonQuery(options, result, limit);
  console.log(formatAsJson(query, result.sourceName, result.tracks, limit));
}

// --- Main Orchestrator ---

export async function runDiscover(options: DiscoverOptions): Promise<void> {
  const format = normalizeFormat(options.preview ? "text" : options.format);
  const limit = normalizeLimit(options.limit);
  const limitPerArtist = normalizeLimitPerArtist(options.limitPerArtist);
  const config = loadConfig();

  const ctx: DiscoveryContext = { limit, limitPerArtist };

  // Init Tidal once before any source resolution
  await initTidalClient();

  // 1. Resolve source → tracks
  const result = await resolveSource(options, ctx);

  // 2. Apply filters
  const filters: TrackFilters = {
    popularityMin: options.popularityMin,
    popularityMax: options.popularityMax,
    yearMin: options.yearMin,
    yearMax: options.yearMax,
  };
  if (hasActiveFilters(filters)) {
    const beforeCount = result.tracks.length;
    result.tracks = filterTracks(result.tracks, filters);
    log(
      `[discover] Filtered ${beforeCount} → ${result.tracks.length} tracks`
    );
  }

  // 3. Apply limit
  result.tracks = result.tracks.slice(0, limit);

  // 4. Persist to database
  persistTracks(result, config.database.path);

  // 5. Output
  outputResult(format, options, result, limit);
}
