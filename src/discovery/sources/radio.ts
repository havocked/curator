import { log } from "../../lib/logger";
import { getProvider } from "../../services/provider";
import type { DiscoveryContext, DiscoveryResult } from "../types";

export async function discoverFromRadio(
  trackId: string,
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  const provider = getProvider();
  log(`[discover] Getting radio for track: ${trackId}`);
  const tracks = await provider.getTrackRadio(trackId, ctx.limit);
  log(`[discover] Got ${tracks.length} radio tracks`);
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
