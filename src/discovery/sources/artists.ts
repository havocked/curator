import { log } from "../../lib/logger";
import { runConcurrent } from "../../lib/concurrent";
import {
  getArtistTopTracks,
  searchArtists,
} from "../../services/tidalSdk";
import type { Track } from "../../services/types";
import { dedupeTracks } from "../filters";
import type { DiscoveryContext, DiscoveryResult } from "../types";

const ARTIST_CONCURRENCY = 2;

async function resolveArtistTracks(
  names: string[],
  limitPerArtist: number
): Promise<Track[]> {
  // Step 1: Search all artists in parallel
  log(`[discover] Searching ${names.length} artists...`);
  const searchResults = await runConcurrent(
    names.map((name) => async () => {
      const artist = await searchArtists(name);
      if (artist) {
        log(`[discover] Found: ${name} (ID: ${artist.id})`);
      } else {
        log(`[discover] No results for: ${name}`);
      }
      return artist;
    }),
    ARTIST_CONCURRENCY
  );

  const artists = searchResults.filter(
    (a): a is { id: number; name: string; picture: string | null } => a != null
  );

  if (artists.length === 0) return [];

  // Step 2: Get top tracks for all artists in parallel
  log(`[discover] Getting tracks for ${artists.length} artists...`);
  const trackGroups = await runConcurrent(
    artists.map((artist) => async () => {
      const tracks = await getArtistTopTracks(artist.id, limitPerArtist);
      log(`[discover] ${artist.name}: ${tracks.length} tracks`);
      return tracks;
    }),
    ARTIST_CONCURRENCY
  );

  const collected: Track[] = [];
  for (const group of trackGroups) {
    if (group) collected.push(...group);
  }

  return dedupeTracks(collected);
}

export async function discoverFromArtists(
  names: string[],
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  if (names.length === 0) {
    throw new Error("Provide at least one artist name.");
  }
  const tracks = await resolveArtistTracks(names, ctx.limitPerArtist);
  if (tracks.length === 0) {
    throw new Error("No tracks found for the provided artists.");
  }
  return {
    tracks,
    sourceName: "artists",
    discoveredVia: `artists:${names.map((n) => n.toLowerCase()).join(",")}`,
    sourceLabel: `artists:${names.join(", ")}`,
  };
}
