import { withRetry } from "../../lib/retry";
import type { Track } from "../types";
import { getClient } from "./client";
import { fetchTracksByIds } from "./fetcher";
import { COUNTRY_CODE, type ResourceId } from "./types";

export async function getTrack(trackId: number): Promise<Track | null> {
  const client = getClient();
  const tracks = await fetchTracksByIds(client, [String(trackId)]);
  return tracks[0] ?? null;
}

export async function getSimilarTracks(
  trackId: string,
  limit = 20
): Promise<Track[]> {
  const client = getClient();

  const resp = await withRetry(
    () =>
      client.GET("/tracks/{id}/relationships/similarTracks", {
        params: {
          path: { id: trackId },
          query: {
            countryCode: COUNTRY_CODE,
            include: ["artists", "albums"],
            "page[limit]": limit,
          },
        },
      } as never),
    { label: `similarTracks(${trackId})` }
  );

  const { data } = resp;
  const trackIds = (
    (data as unknown as { data?: ResourceId[] })?.data ?? []
  ).map((r) => r.id);
  if (trackIds.length === 0) return [];

  return fetchTracksByIds(client, trackIds.slice(0, limit));
}

export async function getTrackRadio(
  trackId: string,
  limit = 20
): Promise<Track[]> {
  const client = getClient();

  const resp = await withRetry(
    () =>
      client.GET("/tracks/{id}/relationships/radio", {
        params: {
          path: { id: trackId },
          query: { countryCode: COUNTRY_CODE },
        },
      } as never),
    { label: `trackRadio(${trackId})` }
  );

  const { data } = resp;
  const responseData = (
    (data ?? {}) as { data?: ResourceId | ResourceId[] }
  ).data;

  if (Array.isArray(responseData)) {
    const playlists = responseData.filter((r) => r.type === "playlists");
    if (playlists.length > 0 && playlists[0]?.id) {
      // Dynamic import to avoid circular dependency
      const { getPlaylistTracks } = await import("./playlists");
      return getPlaylistTracks(playlists[0].id, limit);
    }
    const trackIds = responseData
      .filter((r) => r.type === "tracks")
      .map((r) => r.id);
    if (trackIds.length === 0) return [];
    return fetchTracksByIds(client, trackIds.slice(0, limit));
  }

  if (responseData?.id) {
    const { getPlaylistTracks } = await import("./playlists");
    return getPlaylistTracks(responseData.id, limit);
  }

  return [];
}
