import { withRetry } from "../../lib/retry";
import type { Album, Track } from "../types";
import { getClient } from "./client";
import { delay, fetchTracksByIds } from "./fetcher";
import { buildIncludedMap } from "./mappers";
import {
  COUNTRY_CODE,
  RATE_LIMIT_MS,
  type AlbumAttrs,
  type AlbumResource,
  type IncludedResource,
  type ResourceId,
} from "./types";

export async function getArtistTopTracks(
  artistId: number,
  limit = 10
): Promise<Track[]> {
  const client = getClient();

  const { data } = await withRetry(
    () =>
      client.GET("/artists/{id}/relationships/tracks", {
        params: {
          path: { id: String(artistId) },
          query: {
            countryCode: COUNTRY_CODE,
            collapseBy: "FINGERPRINT",
            "page[limit]": limit,
          },
        },
      }),
    { label: `getTopTracks(${artistId})` }
  );

  const trackIds = data?.data?.map((r: ResourceId) => r.id) ?? [];
  if (trackIds.length === 0) return [];

  return fetchTracksByIds(client, trackIds.slice(0, limit));
}

export async function getArtistAlbums(
  artistId: number,
  limit = 50
): Promise<Album[]> {
  const client = getClient();
  const albumIds: string[] = [];
  let cursor: string | undefined;

  // Paginate to collect album IDs
  while (albumIds.length < limit) {
    const { data } = await withRetry(
      () =>
        client.GET("/artists/{id}/relationships/albums", {
          params: {
            path: { id: String(artistId) },
            query: {
              countryCode: COUNTRY_CODE,
              ...(cursor ? { "page[cursor]": cursor } : {}),
            },
          },
        }),
      { label: `getArtistAlbums(${artistId})` }
    );

    const ids =
      (data as { data?: ResourceId[] })?.data?.map((r) => r.id) ?? [];
    if (ids.length === 0) break;
    albumIds.push(...ids);

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

  if (albumIds.length === 0) return [];

  // Fetch album details in batches
  const albums: Album[] = [];
  const ALBUM_BATCH_SIZE = 20;
  for (let i = 0; i < albumIds.length; i += ALBUM_BATCH_SIZE) {
    const batch = albumIds.slice(i, i + ALBUM_BATCH_SIZE);

    const { data } = await withRetry(
      () =>
        client.GET("/albums", {
          params: {
            query: {
              countryCode: COUNTRY_CODE,
              "filter[id]": batch,
              include: ["artists"],
            },
          },
        }),
      { label: `fetchAlbums(${batch.length} ids)` }
    );

    const includedMap = buildIncludedMap(
      (data as { included?: IncludedResource[] })?.included ?? []
    );

    for (const album of (data as { data?: AlbumResource[] })?.data ?? []) {
      const attrs = album.attributes as AlbumAttrs | undefined;
      const rels = album.relationships as
        | Record<string, { data?: Array<{ id: string; type: string }> }>
        | undefined;

      // Resolve primary artist
      const artistRel = rels?.artists?.data?.[0];
      let artistName = "Unknown";
      if (artistRel) {
        const artist = includedMap.get(`artists:${artistRel.id}`);
        if (artist?.attributes) {
          artistName =
            (artist.attributes as { name?: string }).name ?? "Unknown";
        }
      }

      const releaseDate = attrs?.releaseDate ?? null;
      const releaseYear = releaseDate
        ? new Date(releaseDate).getFullYear()
        : null;

      albums.push({
        id: album.id,
        title: attrs?.title ?? "Unknown",
        artist: artistName,
        releaseDate,
        releaseYear,
        trackCount:
          (attrs as { numberOfItems?: number })?.numberOfItems ?? null,
      });
    }

    if (i + ALBUM_BATCH_SIZE < albumIds.length) {
      await delay(RATE_LIMIT_MS);
    }
  }

  // Sort by release date descending (newest first)
  albums.sort((a, b) => {
    if (!a.releaseDate && !b.releaseDate) return 0;
    if (!a.releaseDate) return 1;
    if (!b.releaseDate) return -1;
    return b.releaseDate.localeCompare(a.releaseDate);
  });

  return albums.slice(0, limit);
}
