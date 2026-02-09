import type { Track } from "../services/types.js";
import type { EnrichmentCache, CachedArtist } from "./cache.js";
import type { ArtistMatch, ArtistGenres } from "../providers/musicbrainz.js";
import { normalizeArtistName } from "../lib/artist.js";
import { log } from "../lib/logger.js";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff.
 * Only retries on transient errors (network, rate limit).
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      const msg = err instanceof Error ? err.message : String(err);

      if (isLast) {
        throw err;
      }

      const delayMs = RETRY_DELAY_MS * Math.pow(2, attempt);
      log(`[enrich] ${label} failed (${msg}), retrying in ${delayMs / 1000}s...`);
      await sleep(delayMs);
    }
  }
  throw new Error("Unreachable");
}

export type EnrichmentStats = {
  tracks: number;
  uniqueArtists: number;
  cacheHits: number;
  cacheMisses: number;
  apiCalls: number;
  notFound: number;
  errors: number;
};

export type MusicBrainzClient = {
  searchArtist(name: string, limit?: number): Promise<ArtistMatch | null>;
  getArtistGenres(mbid: string): Promise<ArtistGenres>;
};

export type EnrichmentOptions = {
  cache: EnrichmentCache;
  mbClient: MusicBrainzClient;
  onProgress?: (done: number, total: number, artist: string) => void;
};

/**
 * Enrich tracks with MusicBrainz artist genres.
 * Uses cache-first strategy with artist dedup.
 */
export async function enrichTracks(
  tracks: Track[],
  options: EnrichmentOptions
): Promise<{ tracks: Track[]; stats: EnrichmentStats }> {
  const { cache, mbClient, onProgress } = options;

  const stats: EnrichmentStats = {
    tracks: tracks.length,
    uniqueArtists: 0,
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
    notFound: 0,
    errors: 0,
  };

  // Step 1: Dedupe artists — one lookup per unique normalized name
  const artistMap = new Map<string, CachedArtist | "not_found">();
  const artistsToFetch: string[] = [];

  const trackArtists = tracks.map((t) => normalizeArtistName(t.artist));
  const uniqueArtists = [...new Set(trackArtists)];
  stats.uniqueArtists = uniqueArtists.length;

  for (const name of uniqueArtists) {
    const cached = cache.getArtist(name);
    if (cached !== null) {
      artistMap.set(name, cached);
      stats.cacheHits++;
    } else {
      artistsToFetch.push(name);
      stats.cacheMisses++;
    }
  }

  // Step 2: Fetch missing artists from MB API (sequential, rate-limited)
  for (let i = 0; i < artistsToFetch.length; i++) {
    const name = artistsToFetch[i]!;
    onProgress?.(
      stats.cacheHits + i + 1,
      uniqueArtists.length,
      name
    );

    try {
      stats.apiCalls++;
      const match = await withRetry(
        () => mbClient.searchArtist(name),
        `search "${name}"`
      );

      if (!match) {
        cache.setArtistNotFound(name);
        artistMap.set(name, "not_found");
        stats.notFound++;
        continue;
      }

      stats.apiCalls++;
      const genres = await withRetry(
        () => mbClient.getArtistGenres(match.mbid),
        `genres "${name}"`
      );

      const data: CachedArtist = {
        mbid: genres.mbid,
        genres: genres.genres,
        votes: genres.votes,
      };
      cache.setArtist(name, data);
      artistMap.set(name, data);
    } catch (err) {
      stats.errors++;
      log(`[enrich] Failed for "${name}" after retries: ${err instanceof Error ? err.message : err}`);
      // Don't cache errors — transient failures should be retried next run
    }
  }

  // Step 3: Apply enrichment data to tracks
  const enrichedTracks = tracks.map((track, idx) => {
    const artistName = trackArtists[idx]!;
    const data = artistMap.get(artistName);

    if (!data || data === "not_found") return track;

    return {
      ...track,
      enrichment: {
        artist_mbid: data.mbid,
        artist_genres: data.genres,
        artist_genre_votes: data.votes,
        enriched_at: new Date().toISOString(),
        enrichment_sources: ["musicbrainz" as const],
      },
    };
  });

  return { tracks: enrichedTracks, stats };
}
