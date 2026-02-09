import { getPlaylistTracks } from "../../services/tidalSdk";
import type { DiscoveryContext, DiscoveryResult } from "../types";

export async function discoverFromPlaylist(
  playlistId: string,
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  const tracks = await getPlaylistTracks(playlistId, ctx.limit);
  return {
    tracks,
    sourceName: "playlist",
    discoveredVia: `playlist:${playlistId}`,
    sourceLabel: `playlist:${playlistId}`,
  };
}
