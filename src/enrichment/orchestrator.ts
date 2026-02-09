import type { Track } from "../services/types.js";
import type { EnrichmentCache, CachedArtist } from "./cache.js";
import type { ArtistMatch, ArtistGenres } from "../providers/musicbrainz.js";
import type { TrackBPM } from "../providers/getsongbpm.js";
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
  bpm: {
    eligible: number;   // tracks with null BPM from Tidal
    cacheHits: number;
    apiCalls: number;
    found: number;
    notFound: number;
    errors: number;
  };
};

export type MusicBrainzClient = {
  searchArtist(name: string, limit?: number): Promise<ArtistMatch | null>;
  getArtistGenres(mbid: string): Promise<ArtistGenres>;
};

export type GetSongBPMClient = {
  lookupTrack(artist: string, title: string): Promise<TrackBPM>;
};

export type EnrichmentOptions = {
  cache: EnrichmentCache;
  mbClient: MusicBrainzClient;
  bpmClient?: GetSongBPMClient | undefined;
  onProgress?: ((done: number, total: number, artist: string) => void) | undefined;
};

/**
 * Enrich tracks with MusicBrainz artist genres.
 * Uses cache-first strategy with artist dedup.
 */
export async function enrichTracks(
  tracks: Track[],
  options: EnrichmentOptions
): Promise<{ tracks: Track[]; stats: EnrichmentStats }> {
  const { cache, mbClient, bpmClient, onProgress } = options;

  const stats: EnrichmentStats = {
    tracks: tracks.length,
    uniqueArtists: 0,
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
    notFound: 0,
    errors: 0,
    bpm: {
      eligible: 0,
      cacheHits: 0,
      apiCalls: 0,
      found: 0,
      notFound: 0,
      errors: 0,
    },
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

  // Step 3: BPM enrichment — fill gaps where Tidal returned null BPM
  const bpmMap = new Map<number, TrackBPM | "not_found">();

  if (bpmClient) {
    const needsBPM = tracks.filter((t) => t.audio_features.bpm === null);
    stats.bpm.eligible = needsBPM.length;

    for (const track of needsBPM) {
      // Check cache first
      const cached = cache.getBPM(track.id);
      if (cached !== null) {
        stats.bpm.cacheHits++;
        if (cached === "not_found") {
          bpmMap.set(track.id, "not_found");
        } else {
          bpmMap.set(track.id, cached);
          if (cached.bpm !== null) stats.bpm.found++;
          else stats.bpm.notFound++;
        }
        continue;
      }

      // API lookup
      try {
        stats.bpm.apiCalls++;
        const result = await withRetry(
          () => bpmClient.lookupTrack(track.artist, track.title),
          `bpm "${track.artist} - ${track.title}"`
        );

        if (result.bpm !== null || result.key !== null) {
          cache.setBPM(track.id, track.artist, track.title, result);
          bpmMap.set(track.id, result);
          stats.bpm.found++;
        } else {
          cache.setBPMNotFound(track.id, track.artist, track.title);
          bpmMap.set(track.id, "not_found");
          stats.bpm.notFound++;
        }
      } catch (err) {
        stats.bpm.errors++;
        log(`[enrich] BPM failed for "${track.artist} - ${track.title}": ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Step 4: Apply enrichment data to tracks
  const enrichedTracks = tracks.map((track, idx) => {
    const artistName = trackArtists[idx]!;
    const artistData = artistMap.get(artistName);
    const bpmData = bpmMap.get(track.id);

    const hasArtist = artistData && artistData !== "not_found";
    const hasBPM = bpmData && bpmData !== "not_found" && (bpmData.bpm !== null || bpmData.key !== null);

    if (!hasArtist && !hasBPM) return track;

    const sources: string[] = [];
    const enrichment: Track["enrichment"] = {
      enriched_at: new Date().toISOString(),
      enrichment_sources: sources,
    };

    if (hasArtist) {
      enrichment.artist_mbid = artistData.mbid;
      enrichment.artist_genres = artistData.genres;
      enrichment.artist_genre_votes = artistData.votes;
      sources.push("musicbrainz");
    }

    if (hasBPM) {
      if (bpmData.bpm !== null) enrichment.getsongbpm_bpm = bpmData.bpm;
      if (bpmData.key !== null) enrichment.getsongbpm_key = bpmData.key;
      if (bpmData.timeSignature !== null) enrichment.getsongbpm_time_sig = bpmData.timeSignature;
      sources.push("getsongbpm");
    }

    return { ...track, enrichment };
  });

  return { tracks: enrichedTracks, stats };
}
