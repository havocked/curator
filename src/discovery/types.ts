import type { Track } from "../services/types";

/**
 * Common context passed to every discovery source.
 */
export interface DiscoveryContext {
  limit: number;
  limitPerArtist: number;
}

/**
 * Result from a discovery source — tracks + metadata for persistence/formatting.
 */
export interface DiscoveryResult {
  tracks: Track[];
  sourceName: string;     // e.g. "playlist", "similar", "artists"
  discoveredVia: string;  // e.g. "similar:12345", "artists:bonobo,tycho"
  sourceLabel: string;    // human-readable label for text output
}

/**
 * Filters applied after source resolution.
 */
export interface TrackFilters {
  popularityMin?: number | undefined;
  popularityMax?: number | undefined;
  yearMin?: number | undefined;
  yearMax?: number | undefined;
}
