import type { Artist, Track } from "./types";

/**
 * Music provider interface — abstracts away TIDAL/Spotify/etc.
 * Curator is provider-agnostic; concrete implementations live elsewhere.
 */
export interface MusicProvider {
  searchArtists(query: string): Promise<Artist | null>;
  searchTracks(query: string, limit?: number): Promise<Track[]>;
  getArtistTopTracks(artistId: number, limit?: number): Promise<Track[]>;
  getAlbumTracks(albumId: string, limit?: number): Promise<Track[]>;
  getPlaylistTracks(playlistId: string, limit?: number): Promise<Track[]>;
  getSimilarTracks(trackId: string, limit?: number): Promise<Track[]>;
  getTrackRadio(trackId: string, limit?: number): Promise<Track[]>;
  getArtistAlbums(artistId: number, limit?: number): Promise<import("./types").Album[]>;
}

let currentProvider: MusicProvider | null = null;

export function setProvider(provider: MusicProvider): void {
  currentProvider = provider;
}

export function getProvider(): MusicProvider {
  if (!currentProvider) {
    throw new Error(
      "No music provider configured. Install tidal-cli and run its API commands, " +
      "or set up a provider before using discovery features."
    );
  }
  return currentProvider;
}
