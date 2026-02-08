import { createAPIClient, type components } from "@tidal-music/api";
import * as auth from "@tidal-music/auth";
import { trueTime } from "@tidal-music/true-time";
import fs from "fs";
import path from "path";
import { expandHome } from "../lib/paths";
import type { Artist, Playlist, Track } from "./types";

// Suppress noisy "TrueTime is not yet synchronized" from SDK internals
const _origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("TrueTime")) return;
  _origWarn.apply(console, args);
};

// --- SDK Types ---

type ApiClient = ReturnType<typeof createAPIClient>;
type ResourceId = components["schemas"]["Resource_Identifier"];
type TrackResource = components["schemas"]["Tracks_Resource_Object"];
type ArtistResource = components["schemas"]["Artists_Resource_Object"];
type IncludedResource = components["schemas"]["Included"][number];

interface Credentials {
  clientId: string;
  clientSecret: string;
}

// --- State ---

let apiClient: ApiClient | null = null;
let userId: string | null = null;
let initialized = false;

const CREDENTIALS_STORAGE_KEY = "curator-tidal-auth";
const COUNTRY_CODE = "DE";
const RATE_LIMIT_MS = 200;

// --- Init ---

export function loadCredentials(): Credentials {
  const configPath = expandHome(
    path.join(process.env.HOME ?? "", ".config", "curator", "credentials.json")
  );
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing credentials file: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8")) as Credentials;
}

export async function initTidalClient(): Promise<void> {
  if (apiClient) return;

  const { clientId, clientSecret } = loadCredentials();

  if (!initialized) {
    await trueTime.synchronize();
    await auth.init({
      clientId,
      clientSecret,
      credentialsStorageKey: CREDENTIALS_STORAGE_KEY,
      scopes: ["user.read", "collection.read"],
    });
    initialized = true;
  }

  // Verify user session (not just client credentials)
  const creds = await auth.credentialsProvider.getCredentials();
  if (!creds || !("token" in creds) || !creds.token) {
    throw new Error("Not logged in. Run: curator auth login");
  }
  if (!("userId" in creds) || !creds.userId) {
    throw new Error("No user session. Run: curator auth login");
  }

  userId = String(creds.userId);
  apiClient = createAPIClient(auth.credentialsProvider);
}

export function getClient(): ApiClient {
  if (!apiClient) {
    throw new Error("Tidal client not initialized. Call initTidalClient() first.");
  }
  return apiClient;
}

// --- Helpers ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDuration(iso: string | undefined | null): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (
    parseInt(match[1] ?? "0", 10) * 3600 +
    parseInt(match[2] ?? "0", 10) * 60 +
    parseInt(match[3] ?? "0", 10)
  );
}

function formatKey(
  key: string | undefined | null,
  scale: string | undefined | null
): string | null {
  if (!key || key === "UNKNOWN") return null;
  const readable = key.replace("Sharp", "#");
  if (!scale || scale === "UNKNOWN") return readable;
  return `${readable} ${scale.toLowerCase()}`;
}

function isTrackResource(item: IncludedResource): item is TrackResource {
  return item.type === "tracks";
}

type TrackAttrs = NonNullable<TrackResource["attributes"]>;

function mapTrackResource(
  track: TrackResource,
  fallbackArtist?: string
): Track {
  const attrs = track.attributes as TrackAttrs | undefined;
  const title = attrs?.version
    ? `${attrs.title} (${attrs.version})`
    : (attrs?.title ?? "Unknown");

  return {
    id: parseInt(track.id, 10),
    title,
    artist: fallbackArtist ?? "Unknown",
    album: "Unknown",
    duration: parseDuration(attrs?.duration),
    release_year: attrs?.createdAt
      ? new Date(attrs.createdAt).getFullYear()
      : null,
    audio_features: {
      bpm: attrs?.bpm ?? null,
      key: formatKey(attrs?.key, attrs?.keyScale),
    },
  };
}

async function fetchTrackById(
  client: ApiClient,
  trackId: string,
  fallbackArtist?: string
): Promise<Track | null> {
  const { data } = await client.GET("/tracks/{id}", {
    params: {
      path: { id: trackId },
      query: { countryCode: COUNTRY_CODE },
    },
  });
  if (!data?.data) return null;
  return mapTrackResource(data.data, fallbackArtist);
}

// --- Search ---

export async function searchArtists(
  query: string,
  limit = 10
): Promise<Artist[]> {
  const client = getClient();
  const fetchLimit = Math.min(Math.max(limit, 3), 10);

  const { data: searchData } = await client.GET(
    "/searchResults/{id}/relationships/artists",
    {
      params: {
        path: { id: query },
        query: { countryCode: COUNTRY_CODE, "page[limit]": fetchLimit },
      },
    }
  );

  const ids = searchData?.data?.map((r: ResourceId) => r.id) ?? [];
  if (ids.length === 0) return [];

  // Fetch details with rate limiting + name matching
  const candidates: Array<Artist & { popularity: number; exactMatch: boolean }> = [];

  for (const id of ids) {
    await delay(RATE_LIMIT_MS);
    const { data } = await client.GET("/artists/{id}", {
      params: {
        path: { id },
        query: { countryCode: COUNTRY_CODE },
      },
    });
    const artist = data?.data;
    if (!artist?.attributes) continue;

    const name = artist.attributes.name;
    candidates.push({
      id: parseInt(artist.id, 10),
      name,
      picture: null,
      popularity: artist.attributes.popularity ?? 0,
      exactMatch: name.toLowerCase() === query.toLowerCase(),
    });
  }

  // Exact name match first, then popularity
  candidates.sort((a, b) => {
    if (a.exactMatch !== b.exactMatch) return a.exactMatch ? -1 : 1;
    return b.popularity - a.popularity;
  });

  return candidates.slice(0, limit).map(({ popularity, exactMatch, ...a }) => a);
}

// --- Artist Tracks ---

export async function getArtistTopTracks(
  artistId: number,
  limit = 10,
  artistName?: string
): Promise<Track[]> {
  const client = getClient();

  const { data } = await client.GET("/artists/{id}/relationships/tracks", {
    params: {
      path: { id: String(artistId) },
      query: {
        countryCode: COUNTRY_CODE,
        collapseBy: "FINGERPRINT",
        "page[limit]": limit,
      },
    },
  });

  const trackIds = data?.data?.map((r: ResourceId) => r.id) ?? [];
  if (trackIds.length === 0) return [];

  // Fetch each track individually (reliable across all conditions)
  const tracks: Track[] = [];
  for (const id of trackIds.slice(0, limit)) {
    await delay(RATE_LIMIT_MS);
    const track = await fetchTrackById(client, id, artistName);
    if (track) tracks.push(track);
  }
  return tracks;
}

// --- Playlists ---

export async function searchPlaylists(
  query: string,
  limit = 10
): Promise<Playlist[]> {
  const client = getClient();

  const { data: searchData } = await client.GET(
    "/searchResults/{id}/relationships/playlists",
    {
      params: {
        path: { id: query },
        query: { countryCode: COUNTRY_CODE, "page[limit]": limit },
      },
    }
  );

  const ids = searchData?.data?.map((r: ResourceId) => r.id) ?? [];
  if (ids.length === 0) return [];

  const playlists: Playlist[] = [];
  for (const id of ids.slice(0, limit)) {
    await delay(RATE_LIMIT_MS);
    const { data } = await client.GET("/playlists/{id}", {
      params: {
        path: { id },
        query: { countryCode: COUNTRY_CODE },
      },
    });
    const playlist = data?.data;
    if (!playlist?.attributes) continue;
    playlists.push({
      id: playlist.id,
      title: playlist.attributes.name ?? "Unknown",
      description: playlist.attributes.description ?? "",
    });
  }
  return playlists;
}

export async function getPlaylistTracks(
  playlistId: string,
  limit = 100
): Promise<Track[]> {
  const client = getClient();

  const { data } = await client.GET("/playlists/{id}/relationships/items", {
    params: {
      path: { id: playlistId },
      query: {
        countryCode: COUNTRY_CODE,
        include: ["items"],
        "page[limit]": limit,
      },
    },
  });

  // Extract track IDs from relationship data
  const trackIds =
    data?.data
      ?.filter((r: ResourceId) => r.type === "tracks")
      .map((r: ResourceId) => r.id) ?? [];

  // Use included data if available, otherwise fetch individually
  const included = data?.included ?? [];
  const trackMap = new Map<string, TrackResource>();
  for (const item of included) {
    if (isTrackResource(item)) {
      trackMap.set(item.id, item);
    }
  }

  const tracks: Track[] = [];
  for (const id of trackIds.slice(0, limit)) {
    const cached = trackMap.get(id);
    if (cached) {
      tracks.push(mapTrackResource(cached));
    } else {
      await delay(RATE_LIMIT_MS);
      const track = await fetchTrackById(client, id);
      if (track) tracks.push(track);
    }
  }
  return tracks;
}

// --- User Favorites ---

export async function getFavoriteTracks(limit = 500): Promise<Track[]> {
  const client = getClient();
  if (!userId) {
    throw new Error("No user ID. Call initTidalClient() first.");
  }

  const allTrackIds: string[] = [];
  let cursor: string | undefined;

  // Paginate through user collection to gather all track IDs
  while (allTrackIds.length < limit) {
    const queryParams: Record<string, unknown> = {
      locale: "en-US",
      countryCode: COUNTRY_CODE,
      include: ["tracks"],
    };
    if (cursor) {
      queryParams["page[cursor]"] = cursor;
    }

    const { data, error } = await client.GET(
      "/userCollections/{id}/relationships/tracks",
      {
        params: {
          path: { id: userId },
          query: queryParams as {
            locale: string;
            countryCode?: string;
            include?: string[];
            "page[cursor]"?: string;
          },
        },
      }
    );

    if (error) {
      const detail =
        "errors" in error
          ? (error.errors as Array<{ detail?: string }>)[0]?.detail
          : String(error);
      throw new Error(`Failed to fetch favorites: ${detail}`);
    }

    const ids = data?.data?.map((r: { id: string }) => r.id) ?? [];
    if (ids.length === 0) break;
    allTrackIds.push(...ids);

    // Check for next page via links.next
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

  // Use included track data when available, fetch individually otherwise
  const tracks: Track[] = [];
  for (const id of trackIds) {
    await delay(RATE_LIMIT_MS);
    const track = await fetchTrackById(client, id);
    if (track) tracks.push(track);
  }
  return tracks;
}

// --- Single Track ---

export async function getTrack(trackId: number): Promise<Track | null> {
  const client = getClient();
  return fetchTrackById(client, String(trackId));
}
