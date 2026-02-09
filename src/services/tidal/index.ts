// Barrel export — all public API from the tidal module.
// Consumers can import from "../services/tidal" or keep using "../services/tidalSdk".

export { loadCredentials, initTidalClient, getClient, getUserId } from "./client";
export { parseDuration, formatKey, mapTrackResource, resolveTrackMeta, buildIncludedMap } from "./mappers";
export { delay, fetchTracksByIds } from "./fetcher";
export { searchArtists, searchTracks } from "./search";
export { getArtistTopTracks, getArtistAlbums } from "./artists";
export { getAlbumTracks } from "./albums";
export { getTrack, getSimilarTracks, getTrackRadio } from "./tracks";
export {
  getPlaylistTracks,
  getFavoriteTracks,
  createPlaylist,
  addTracksToPlaylist,
  type CreatePlaylistOptions,
} from "./playlists";
