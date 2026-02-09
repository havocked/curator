import { getTrackRadio } from "../../services/tidalSdk";
import type { DiscoveryContext, DiscoveryResult } from "../types";

export async function discoverFromRadio(
  trackId: string,
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  console.error(`[discover] Getting radio for track: ${trackId}`);
  const tracks = await getTrackRadio(trackId, ctx.limit);
  console.error(`[discover] Got ${tracks.length} radio tracks`);
  if (tracks.length === 0) {
    throw new Error(`No radio tracks found for track: ${trackId}`);
  }
  return {
    tracks,
    sourceName: "radio",
    discoveredVia: `radio:${trackId}`,
    sourceLabel: `radio:${trackId}`,
  };
}
