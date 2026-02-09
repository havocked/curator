import { withEmptyRetry, withRetry } from "../../lib/retry";
import type { Artist, Track } from "../types";
import { getClient } from "./client";
import { fetchTracksByIds } from "./fetcher";
import { COUNTRY_CODE, type ResourceId } from "./types";

export async function searchArtists(query: string): Promise<Artist | null> {
  const client = getClient();

  const artist = await withEmptyRetry(
    async () => {
      const { data } = await withRetry(
        () =>
          client.GET("/searchResults/{id}/relationships/artists", {
            params: {
              path: { id: query },
              query: { countryCode: COUNTRY_CODE, "page[limit]": 1 },
            },
          }),
        { label: `searchArtists("${query}")` }
      );

      const id = data?.data?.[0]?.id;
      if (!id) return null;

      return { id: parseInt(id, 10), name: query, picture: null } as Artist;
    },
    () => false, // null result is the empty signal, not a field check
    { label: `searchArtists("${query}")`, maxRetries: 2 }
  );

  return artist ?? null;
}

export async function searchTracks(
  query: string,
  limit = 20
): Promise<Track[]> {
  const client = getClient();

  const { data: searchData } = await withRetry(
    () =>
      client.GET("/searchResults/{id}/relationships/tracks", {
        params: {
          path: { id: query },
          query: { countryCode: COUNTRY_CODE, "page[limit]": limit },
        },
      }),
    { label: `searchTracks("${query}")` }
  );

  const trackIds =
    searchData?.data?.map((r: ResourceId) => r.id) ?? [];
  if (trackIds.length === 0) return [];

  return fetchTracksByIds(client, trackIds.slice(0, limit));
}
