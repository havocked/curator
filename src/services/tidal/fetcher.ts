import { withRetry } from "../../lib/retry";
import type { Track } from "../types";
import { getClient } from "./client";
import { buildIncludedMap, mapTrackResource, resolveTrackMeta } from "./mappers";
import {
  BATCH_SIZE,
  COUNTRY_CODE,
  RATE_LIMIT_MS,
  type ApiClient,
  type TrackResource,
} from "./types";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Batch-fetch tracks by IDs with artist + album + genre resolution.
 * Chunks into batches of BATCH_SIZE to stay within URL length limits.
 * Preserves original ID order in output.
 */
export async function fetchTracksByIds(
  client: ApiClient,
  trackIds: string[]
): Promise<Track[]> {
  if (trackIds.length === 0) return [];

  const allTracks: Track[] = [];

  for (let i = 0; i < trackIds.length; i += BATCH_SIZE) {
    if (i > 0) await delay(RATE_LIMIT_MS);

    const chunk = trackIds.slice(i, i + BATCH_SIZE);
    const { data } = await withRetry(
      () =>
        client.GET("/tracks", {
          params: {
            query: {
              countryCode: COUNTRY_CODE,
              "filter[id]": chunk,
              include: ["artists", "albums", "genres"],
            },
          },
        }),
      { label: `fetchTracks(${chunk.length} ids)` }
    );

    const included = data?.included ?? [];
    const includedMap = buildIncludedMap(included);

    for (const track of data?.data ?? []) {
      const meta = resolveTrackMeta(track as TrackResource, includedMap);
      allTracks.push(mapTrackResource(track as TrackResource, meta));
    }
  }

  // Preserve original ID order (API may return in different order)
  const trackMap = new Map(allTracks.map((t) => [String(t.id), t]));
  const ordered: Track[] = [];
  for (const id of trackIds) {
    const track = trackMap.get(id);
    if (track) ordered.push(track);
  }
  return ordered;
}
