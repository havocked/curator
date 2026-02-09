import type { Track } from "../services/types";

export type OutputFormat = "json" | "text" | "ids";

export interface JsonQuery {
  playlist?: string | undefined;
  album?: string | undefined;
  similar?: string | undefined;
  radio?: string | undefined;
  genre?: string | undefined;
  tags?: string[] | undefined;
  artists?: string[] | undefined;
  label?: string | undefined;
  limit: number;
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
    // Prefer Tidal BPM, fall back to GetSongBPM enrichment
    const effectiveBpm = track.audio_features?.bpm ?? track.enrichment?.getsongbpm_bpm ?? null;
    const effectiveKey = track.audio_features?.key ?? track.enrichment?.getsongbpm_key ?? null;
    const bpmSource = track.audio_features?.bpm != null ? "" : (track.enrichment?.getsongbpm_bpm != null ? "~" : "");
    const bpm =
      effectiveBpm != null
        ? `${bpmSource}${Math.round(effectiveBpm)} BPM`
        : null;
    const key = effectiveKey;
    const features =
      bpm || key ? ` [${[bpm, key].filter(Boolean).join(", ")}]` : "";
    const genres =
      track.enrichment?.artist_genres && track.enrichment.artist_genres.length > 0
        ? ` {${track.enrichment.artist_genres.slice(0, 3).join(", ")}}`
        : "";

    return `  ${index + 1}. ${track.title} - ${artist} (${album}, ${year}) [${duration}]${features}${genres}`;
  });
}

export function formatAsText(sourceLabel: string, tracks: Track[]): string {
  if (tracks.length === 0) {
    return `Discovered 0 tracks from source ${sourceLabel}.`;
  }
  const lines = [
    `Discovered ${tracks.length} tracks from source ${sourceLabel}.`,
    ...formatTrackList(tracks),
  ];
  return lines.join("\n");
}

export function formatAsJson(
  query: JsonQuery,
  sourceName: string,
  tracks: Track[],
  limit: number
): string {
  const output = {
    count: tracks.length,
    source: sourceName,
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
        track.audio_features &&
        (track.audio_features.bpm != null || track.audio_features.key != null)
          ? {
              bpm: track.audio_features.bpm ?? null,
              key: track.audio_features.key ?? null,
            }
          : undefined,
      enrichment: track.enrichment ?? undefined,
    })),
  };
  return JSON.stringify(output, null, 2);
}

export function formatAsIds(tracks: Track[]): string {
  return tracks.map((track) => String(track.id)).join("\n");
}
