import { log } from "../../lib/logger";
import { createMusicBrainzClient } from "../../providers/musicbrainz";
import { discoverFromArtists } from "./artists";
import type { DiscoveryContext, DiscoveryResult } from "../types";

/**
 * Discover tracks by genre via MusicBrainz → Tidal.
 *
 * 1. Search MusicBrainz for artists tagged with the genre
 * 2. Take the top N artist names
 * 3. Discover their tracks on Tidal (reuses existing artist discovery)
 */
export async function discoverFromGenre(
  genre: string,
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  const mbClient = createMusicBrainzClient();

  // Fetch more artists than we need — some won't be on Tidal
  const mbArtistCount = Math.min(ctx.limit, 25);
  log(`[discover] Searching MusicBrainz for "${genre}" artists...`);
  const artistNames = await mbClient.searchArtistsByGenre(genre, mbArtistCount);

  if (artistNames.length === 0) {
    throw new Error(`No artists found for genre "${genre}" on MusicBrainz.`);
  }

  log(`[discover] Found ${artistNames.length} artists: ${artistNames.slice(0, 8).join(", ")}${artistNames.length > 8 ? "..." : ""}`);

  // Reuse artist discovery pipeline
  const result = await discoverFromArtists(artistNames, ctx);

  // Override metadata to reflect genre source
  result.sourceName = "genre";
  result.discoveredVia = `genre:${genre.toLowerCase()}`;
  result.sourceLabel = `genre "${genre}"`;

  return result;
}
