import { withRetry } from "../../lib/retry";
import type { Track } from "../types";
import { getClient, getUserId } from "./client";
import { delay, fetchTracksByIds } from "./fetcher";
import { COUNTRY_CODE, RATE_LIMIT_MS, type ResourceId } from "./types";

const PLAYLIST_ITEMS_BATCH = 20;

export async function getPlaylistTracks(
  playlistId: string,
  limit = 100
): Promise<Track[]> {
  const client = getClient();

  const { data } = await withRetry(
    () =>
      client.GET("/playlists/{id}/relationships/items", {
        params: {
          path: { id: playlistId },
          query: {
            countryCode: COUNTRY_CODE,
            "page[limit]": limit,
          },
        },
      }),
    { label: `getPlaylistTracks(${playlistId.substring(0, 8)})` }
  );

  const trackIds =
    data?.data
      ?.filter((r: ResourceId) => r.type === "tracks")
      .map((r: ResourceId) => r.id) ?? [];

  return fetchTracksByIds(getClient(), trackIds.slice(0, limit));
}

export async function getFavoriteTracks(limit = 500): Promise<Track[]> {
  const client = getClient();
  const currentUserId = getUserId();

  const allTrackIds: string[] = [];
  let cursor: string | undefined;

  while (allTrackIds.length < limit) {
    const queryParams: Record<string, unknown> = {
      locale: "en-US",
      countryCode: COUNTRY_CODE,
      include: ["tracks"],
    };
    if (cursor) {
      queryParams["page[cursor]"] = cursor;
    }

    const { data, error } = await withRetry(
      () =>
        client.GET("/userCollections/{id}/relationships/tracks", {
          params: {
            path: { id: currentUserId },
            query: queryParams as {
              locale: string;
              countryCode?: string;
              include?: string[];
              "page[cursor]"?: string;
            },
          },
        }),
      { label: "getFavoriteTracks" }
    );

    if (error) {
      const errObj = error as Record<string, unknown>;
      const detail =
        "errors" in errObj
          ? (errObj.errors as Array<{ detail?: string }>)[0]?.detail
          : String(error);
      throw new Error(`Failed to fetch favorites: ${detail}`);
    }

    const ids = data?.data?.map((r: { id: string }) => r.id) ?? [];
    if (ids.length === 0) break;
    allTrackIds.push(...ids);

    const nextLink = data?.links?.next;
    if (!nextLink) break;

    const cursorMatch = nextLink.match(
      /page%5Bcursor%5D=([^&]+)|page\[cursor\]=([^&]+)/
    );
    cursor = cursorMatch
      ? decodeURIComponent(cursorMatch[1] ?? cursorMatch[2] ?? "")
      : undefined;
    if (!cursor) break;

    await delay(RATE_LIMIT_MS);
  }

  const trackIds = allTrackIds.slice(0, limit);
  if (trackIds.length === 0) return [];

  return fetchTracksByIds(client, trackIds);
}

export type CreatePlaylistOptions = {
  name: string;
  description?: string | undefined;
  isPublic?: boolean | undefined;
};

export async function createPlaylist(
  options: CreatePlaylistOptions
): Promise<{ id: string; name: string }> {
  const client = getClient();

  const resp = await client.POST("/playlists", {
    body: {
      data: {
        type: "playlists",
        attributes: {
          name: options.name,
          description: options.description,
          accessType: options.isPublic ? "PUBLIC" : "UNLISTED",
        },
      },
    } as never,
    params: { query: { countryCode: COUNTRY_CODE } },
  });

  if (resp.error) {
    throw new Error(
      `Failed to create playlist: ${JSON.stringify(resp.error)}`
    );
  }

  const data = (
    resp.data as {
      data?: { id?: string; attributes?: { name?: string } };
    }
  )?.data;
  const id = data?.id;
  const name = data?.attributes?.name ?? options.name;

  if (!id) {
    throw new Error("Playlist created but no ID returned");
  }

  return { id, name };
}

export async function addTracksToPlaylist(
  playlistId: string,
  trackIds: string[]
): Promise<number> {
  const client = getClient();
  let added = 0;

  for (let i = 0; i < trackIds.length; i += PLAYLIST_ITEMS_BATCH) {
    const batch = trackIds.slice(i, i + PLAYLIST_ITEMS_BATCH);

    const resp = await client.POST("/playlists/{id}/relationships/items", {
      params: {
        path: { id: playlistId },
        query: { countryCode: COUNTRY_CODE },
      },
      body: {
        data: batch.map((tid) => ({
          id: tid,
          type: "tracks" as const,
        })),
      } as never,
    });

    if (resp.error) {
      throw new Error(
        `Failed to add tracks (batch ${Math.floor(i / PLAYLIST_ITEMS_BATCH) + 1}): ${JSON.stringify(resp.error)}`
      );
    }

    added += batch.length;

    if (i + PLAYLIST_ITEMS_BATCH < trackIds.length) {
      await delay(RATE_LIMIT_MS);
    }
  }

  return added;
}
