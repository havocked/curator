import { withRetry } from "../../lib/retry";
import type { Track } from "../types";
import { getClient } from "./client";
import { delay, fetchTracksByIds } from "./fetcher";
import { COUNTRY_CODE, RATE_LIMIT_MS, type ResourceId } from "./types";

export async function getAlbumTracks(
  albumId: string,
  limit = 100
): Promise<Track[]> {
  const client = getClient();
  const allTrackIds: string[] = [];
  let cursor: string | undefined;

  while (allTrackIds.length < limit) {
    const { data } = await withRetry(
      () =>
        client.GET("/albums/{id}/relationships/items", {
          params: {
            path: { id: albumId },
            query: {
              countryCode: COUNTRY_CODE,
              ...(cursor ? { "page[cursor]": cursor } : {}),
            },
          },
        }),
      { label: `getAlbumTracks(${albumId})` }
    );

    const ids =
      (data as { data?: ResourceId[] })?.data
        ?.filter((r) => r.type === "tracks")
        .map((r) => r.id) ?? [];

    if (ids.length === 0) break;
    allTrackIds.push(...ids);

    const links = (data as { links?: { next?: string } })?.links;
    if (links?.next) {
      const url = new URL(links.next, "https://openapi.tidal.com");
      cursor = url.searchParams.get("page[cursor]") ?? undefined;
      if (!cursor) break;
      await delay(RATE_LIMIT_MS);
    } else {
      break;
    }
  }

  if (allTrackIds.length === 0) return [];
  return fetchTracksByIds(client, allTrackIds.slice(0, limit));
}
