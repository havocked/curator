import { log } from "../../lib/logger";
import { getProvider } from "../../services/provider";
import type { DiscoveryContext, DiscoveryResult } from "../types";

export async function discoverFromAlbum(
  albumId: string,
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  const provider = getProvider();
  log(`[discover] Fetching album tracks: ${albumId}`);
  const tracks = await provider.getAlbumTracks(albumId, ctx.limit);
  log(`[discover] Got ${tracks.length} tracks`);
  if (tracks.length === 0) {
    throw new Error(`No tracks found for album: ${albumId}`);
  }
  return {
    tracks,
    sourceName: "album",
    discoveredVia: `album:${albumId}`,
    sourceLabel: `album:${albumId}`,
  };
}

export async function discoverFromLatestAlbum(
  artistName: string,
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  const provider = getProvider();
  log(`[discover] Searching for artist: ${artistName}`);
  const artist = await provider.searchArtists(artistName);
  if (!artist) {
    throw new Error(`Artist not found: ${artistName}`);
  }
  log(`[discover] Found: ${artist.name} (ID: ${artist.id})`);
  log(`[discover] Fetching discography...`);
  const albums = await provider.getArtistAlbums(artist.id);
  if (albums.length === 0) {
    throw new Error(`No albums found for: ${artist.name}`);
  }
  const latest = albums[0]!;
  log(
    `[discover] Latest album: ${latest.title} (${latest.releaseYear ?? "?"}) — ${latest.trackCount ?? "?"} tracks`
  );
  const tracks = await provider.getAlbumTracks(latest.id, ctx.limit);
  log(`[discover] Got ${tracks.length} tracks`);
  if (tracks.length === 0) {
    throw new Error(`No tracks found for album: ${latest.title}`);
  }
  return {
    tracks,
    sourceName: "album",
    discoveredVia: `album:${latest.id}`,
    sourceLabel: `album:${latest.id}`,
  };
}
