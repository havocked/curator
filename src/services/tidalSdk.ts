import { createAPIClient } from "@tidal-music/api";
import * as auth from "@tidal-music/auth";
import fs from "fs";
import path from "path";
import { expandHome } from "../lib/paths";
import type { Artist, Playlist, Track } from "./types";

type Credentials = {
  clientId: string;
  clientSecret: string;
};

type ApiClient = ReturnType<typeof createAPIClient>;

let apiClient: ApiClient | null = null;
let initialized = false;

const CREDENTIALS_STORAGE_KEY = "curator-tidal-auth";
const COUNTRY_CODE = "DE";

export function loadCredentials(): Credentials {
  const configPath = expandHome(
    path.join(process.env.HOME || "", ".config", "curator", "credentials.json")
  );

  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing credentials file: ${configPath}`);
  }

  return JSON.parse(fs.readFileSync(configPath, "utf-8")) as Credentials;
}

export async function initTidalClient(): Promise<void> {
  if (apiClient) {
    return;
  }

  const { clientId, clientSecret } = loadCredentials();

  if (!initialized) {
    await auth.init({
      clientId,
      clientSecret,
      credentialsStorageKey: CREDENTIALS_STORAGE_KEY,
      scopes: [],
    });
    initialized = true;
  }

  // Verify we have valid USER credentials (not just client credentials)
  try {
    const creds = await auth.credentialsProvider.getCredentials();
    if (!creds || !("token" in creds) || !creds.token) {
      throw new Error("No valid token");
    }
    if (!("userId" in creds) || !(creds as any).userId) {
      throw new Error("No user session");
    }
  } catch {
    throw new Error(
      "Not logged in or token expired. Run: curator auth login"
    );
  }

  apiClient = createAPIClient(auth.credentialsProvider);
}

export function getClient(): ApiClient {
  if (!apiClient) {
    throw new Error(
      "Tidal client not initialized. Call initTidalClient() first."
    );
  }
  return apiClient;
}

// --- Search ---

const RATE_LIMIT_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchArtists(
  query: string,
  limit = 10
): Promise<Artist[]> {
  const client = getClient() as any;

  // Fetch a small batch — API returns in relevance order
  const fetchLimit = Math.min(Math.max(limit, 3), 10);
  const searchRes = await client.GET(
    "/searchResults/{id}/relationships/artists",
    {
      params: {
        path: { id: query },
        query: { countryCode: COUNTRY_CODE, "page[limit]": fetchLimit },
      },
    }
  );

  const ids = (searchRes.data?.data as any[])?.map((a: any) => a.id) ?? [];
  if (ids.length === 0) return [];

  // Fetch artist details with rate limiting
  const artists: (Artist & { popularity: number; nameMatch: boolean })[] = [];
  for (const id of ids) {
    await delay(RATE_LIMIT_MS);
    const res = await client.GET("/artists/{id}", {
      params: {
        path: { id },
        query: { countryCode: COUNTRY_CODE },
      },
    });
    const data = res.data?.data;
    if (data) {
      const name = data.attributes?.name || "Unknown";
      artists.push({
        id: parseInt(data.id, 10),
        name,
        picture: null,
        popularity: data.attributes?.popularity ?? 0,
        nameMatch: name.toLowerCase() === query.toLowerCase(),
      });
    }
  }

  // Prioritize: exact name match first, then by popularity
  artists.sort((a, b) => {
    if (a.nameMatch !== b.nameMatch) return a.nameMatch ? -1 : 1;
    return b.popularity - a.popularity;
  });

  return artists.slice(0, limit).map(({ popularity, nameMatch, ...a }) => a);
}

export async function getArtistTopTracks(
  artistId: number,
  limit = 10,
  artistName?: string
): Promise<Track[]> {
  const client = getClient() as any;

  // Step 1: Get track IDs for this artist
  const res = await client.GET("/artists/{id}/relationships/tracks", {
    params: {
      path: { id: String(artistId) },
      query: {
        countryCode: COUNTRY_CODE,
        collapseBy: "FINGERPRINT" as const,
        "page[limit]": limit,
      },
    },
  });

  const trackIds = (res.data?.data as any[])?.map((t: any) => t.id) ?? [];
  if (trackIds.length === 0) return [];

  // Step 2: Fetch each track's details individually (reliable, avoids include parsing issues)
  const tracks: Track[] = [];
  for (const id of trackIds.slice(0, limit)) {
    await delay(RATE_LIMIT_MS);
    const detail = await fetchTrackWithArtists(client, id, artistName);
    if (detail) tracks.push(detail);
  }

  return tracks;
}

// --- Playlists ---

export async function searchPlaylists(
  query: string,
  limit = 10
): Promise<Playlist[]> {
  const client = getClient() as any;

  const searchRes = await client.GET(
    "/searchResults/{id}/relationships/playlists",
    {
      params: {
        path: { id: query },
        query: { countryCode: COUNTRY_CODE, "page[limit]": limit },
      },
    }
  );

  const ids =
    (searchRes.data?.data as any[])?.map((p: any) => p.id) ?? [];
  if (ids.length === 0) return [];

  const playlists: Playlist[] = [];
  for (const id of ids.slice(0, limit)) {
    const res = await client.GET("/playlists/{id}", {
      params: {
        path: { id },
        query: { countryCode: COUNTRY_CODE },
      },
    });
    const data = res.data?.data;
    if (data) {
      playlists.push({
        id: data.id,
        title: data.attributes?.name || "Unknown",
        description: data.attributes?.description || "",
      });
    }
  }

  return playlists;
}

export async function getPlaylistTracks(
  playlistId: string,
  limit = 100
): Promise<Track[]> {
  const client = getClient() as any;

  const res = await client.GET("/playlists/{id}/relationships/items", {
    params: {
      path: { id: playlistId },
      query: {
        countryCode: COUNTRY_CODE,
        include: ["items"],
        "page[limit]": limit,
      },
    },
  });

  const included = (res.data?.included as any[]) ?? [];
  const itemIds =
    (res.data?.data as any[])
      ?.filter((item: any) => item.type === "tracks")
      .map((item: any) => item.id) ?? [];

  const trackMap = new Map<string, any>();
  for (const item of included) {
    if (item.type === "tracks") {
      trackMap.set(item.id, item);
    }
  }

  const tracks: Track[] = [];
  for (const id of itemIds.slice(0, limit)) {
    const trackData = trackMap.get(id);
    if (trackData) {
      tracks.push(mapTrackFromApi(trackData));
    }
  }

  return tracks;
}

// --- Single Track ---

export async function getTrack(trackId: number): Promise<Track | null> {
  const client = getClient() as any;
  return fetchTrackWithArtists(client, String(trackId));
}

// --- Helpers ---

async function fetchTrackWithArtists(
  client: any,
  trackId: string,
  fallbackArtistName?: string
): Promise<Track | null> {
  const res = await client.GET("/tracks/{id}", {
    params: {
      path: { id: trackId },
      query: { countryCode: COUNTRY_CODE },
    },
  });

  if (!res.data?.data) return null;
  return mapTrackFromApi(res.data.data, fallbackArtistName);
}

/**
 * Parse ISO 8601 duration (PT4M2S) to seconds.
 */
function parseDuration(iso: string | null | undefined): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function mapTrackFromApi(
  apiTrack: any,
  fallbackArtistName?: string
): Track {
  const attrs = apiTrack.attributes || {};

  // Try to get artist name from relationships data (if populated)
  let artistName = fallbackArtistName || "Unknown";
  const artistRels = apiTrack.relationships?.artists?.data;
  if (Array.isArray(artistRels) && artistRels.length > 0 && artistRels[0].name) {
    artistName = artistRels[0].name;
  }

  // Try to get album from relationships
  let albumName = "Unknown";
  const albumRels = apiTrack.relationships?.albums?.data;
  if (Array.isArray(albumRels) && albumRels.length > 0) {
    albumName = albumRels[0].attributes?.title || "Unknown";
  }

  // Parse release date from createdAt
  let releaseYear: number | null = null;
  if (attrs.createdAt) {
    releaseYear = new Date(attrs.createdAt).getFullYear();
  }

  // Build title with version if present
  const title = attrs.version
    ? `${attrs.title} (${attrs.version})`
    : attrs.title || "Unknown";

  return {
    id: parseInt(apiTrack.id, 10),
    title,
    artist: artistName,
    album: albumName,
    duration: parseDuration(attrs.duration),
    release_year: releaseYear,
    audio_features: {
      bpm: null, // Not available in official API v2
      key: null, // Not available in official API v2
    },
  };
}
