import type { Track } from "../services/types";
import type { TrackFilters } from "./types";

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

export function filterTracks(tracks: Track[], filters: TrackFilters): Track[] {
  return tracks.filter((track) => {
    if (filters.popularityMin != null) {
      if (track.popularity == null || track.popularity < filters.popularityMin)
        return false;
    }
    if (filters.popularityMax != null) {
      if (track.popularity == null || track.popularity > filters.popularityMax)
        return false;
    }
    if (filters.yearMin != null) {
      if (track.release_year == null || track.release_year < filters.yearMin)
        return false;
    }
    if (filters.yearMax != null) {
      if (track.release_year == null || track.release_year > filters.yearMax)
        return false;
    }
    return true;
  });
}

export function hasActiveFilters(filters: TrackFilters): boolean {
  return Object.values(filters).some((v) => v != null);
}

/**
 * Filter tracks by enriched MusicBrainz genre.
 * Case-insensitive partial match (e.g. "house" matches "deep house").
 */
export function filterByGenre(tracks: Track[], genre: string): Track[] {
  const genreLower = genre.toLowerCase();
  return tracks.filter((track) => {
    // Check enrichment genres first
    if (track.enrichment?.artist_genres) {
      return track.enrichment.artist_genres.some((g) =>
        g.toLowerCase().includes(genreLower)
      );
    }
    // Fallback: check Tidal genres (usually empty, but future-proof)
    if (track.genres.length > 0) {
      return track.genres.some((g) => g.toLowerCase().includes(genreLower));
    }
    return false;
  });
}
