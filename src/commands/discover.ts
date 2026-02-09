import { Command } from "commander";
import {
  runDiscover,
  parseTags,
  parseArtists,
  dedupeTracks,
  filterTracks,
  formatAsText,
  formatAsJson,
  formatAsIds,
  buildSearchQuery,
} from "../discovery";
import type { DiscoverOptions } from "../discovery";
import type { Track } from "../services/types";

// Re-export for backward compatibility (tests import from here)
export {
  parseTags,
  parseArtists,
  dedupeTracks,
  buildSearchQuery,
};
export { filterTracks as filterTracks };
export { formatAsIds as formatDiscoverAsIds };

// Backward-compatible wrappers (tests use old signatures)
export function formatDiscoverAsText(sourceLabel: string, tracks: Track[]): string {
  return formatAsText(sourceLabel, tracks);
}

export function formatDiscoverAsJson(
  query: { playlist?: string; album?: string; similar?: string; radio?: string; genre?: string; tags?: string[]; artists?: string[]; label?: string; limit: number },
  tracks: Track[],
  limit: number
): string {
  // Infer source name from query (old behavior)
  const source = query.label
    ? "label"
    : query.similar
      ? "similar"
      : query.radio
        ? "radio"
        : query.artists
          ? "artists"
          : query.album
            ? "album"
            : query.playlist
              ? "playlist"
              : "search";
  return formatAsJson(query, source, tracks, limit);
}

export { runDiscover };

export function registerDiscoverCommand(program: Command): void {
  program
    .command("discover")
    .description("Discover new tracks from Tidal catalog")
    .option("--playlist <id>", "Discover tracks from a playlist ID")
    .option("--album <id>", "Discover all tracks from an album")
    .option("--latest-album <artist>", "Discover tracks from an artist's latest album")
    .option("--similar <track-id>", "Discover tracks similar to a seed track")
    .option("--radio <track-id>", "Get radio-style playlist from a seed track")
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
    .action(async (options: DiscoverOptions) => {
      await runDiscover(options);
    });
}
