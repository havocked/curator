import { log } from "../../lib/logger";
import { searchTracks } from "../../services/tidalSdk";
import type { DiscoveryContext, DiscoveryResult } from "../types";

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

export async function discoverFromSearch(
  genre: string | undefined,
  tags: string[],
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  const query = buildSearchQuery(genre, tags);
  if (!query) {
    throw new Error(
      "Provide --playlist, --album, --artists, --label, or --genre/--tags to discover tracks."
    );
  }
  log(`[discover] Searching tracks: ${query}`);
  const tracks = await searchTracks(query, ctx.limit);
  log(`[discover] Found ${tracks.length} tracks`);
  if (tracks.length === 0) {
    throw new Error("No tracks found for the provided genre/tags.");
  }
  return {
    tracks,
    sourceName: "search",
    discoveredVia: `search:${(genre ?? "unknown").toLowerCase()}`,
    sourceLabel: "playlist-search",
  };
}
