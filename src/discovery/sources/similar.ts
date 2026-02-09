import { getSimilarTracks } from "../../services/tidalSdk";
import type { DiscoveryContext, DiscoveryResult } from "../types";

export async function discoverFromSimilar(
  trackId: string,
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  console.error(`[discover] Finding tracks similar to: ${trackId}`);
  const tracks = await getSimilarTracks(trackId, ctx.limit);
  console.error(`[discover] Got ${tracks.length} similar tracks`);
  if (tracks.length === 0) {
    throw new Error(`No similar tracks found for track: ${trackId}`);
  }
  return {
    tracks,
    sourceName: "similar",
    discoveredVia: `similar:${trackId}`,
    sourceLabel: `similar:${trackId}`,
  };
}
