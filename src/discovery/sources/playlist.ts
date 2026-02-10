import { getProvider } from "../../services/provider";
import type { DiscoveryContext, DiscoveryResult } from "../types";

export async function discoverFromPlaylist(
  playlistId: string,
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  const provider = getProvider();
  const tracks = await provider.getPlaylistTracks(playlistId, ctx.limit);
  return {
    tracks,
    sourceName: "playlist",
    discoveredVia: `playlist:${playlistId}`,
    sourceLabel: `playlist:${playlistId}`,
  };
}
