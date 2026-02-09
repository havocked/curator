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
