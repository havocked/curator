import type { Track } from "./types";

// --- HTTP Service Response Types (raw shapes from tidal-service) ---

interface ServiceTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  album_art?: string | null;
  audio_features?: {
    bpm?: number | null;
    key?: string | null;
    key_scale?: string | null;
    peak?: number | null;
  };
  release_year?: number | null;
}

export type FavoritesResponse = {
  tracks_count: number;
  albums_count: number;
  artists_count: number;
  favorites: {
    tracks: Track[];
    albums: Array<Record<string, unknown>>;
    artists: Array<Record<string, unknown>>;
  };
};

// --- Helpers ---

export function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, "");
}

function serviceTrackToTrack(raw: ServiceTrack): Track {
  return {
    id: raw.id,
    title: raw.title,
    artist: raw.artist,
    album: raw.album,
    duration: raw.duration,
    release_year: raw.release_year ?? null,
    popularity: null,
    genres: [],
    mood: [],
    audio_features: {
      bpm: raw.audio_features?.bpm ?? null,
      key: raw.audio_features?.key ?? null,
    },
  };
}

export function normalizeFavoritesResponse(payload: unknown): FavoritesResponse {
  const raw = (payload ?? {}) as {
    tracks_count?: number;
    albums_count?: number;
    artists_count?: number;
    favorites?: {
      tracks?: ServiceTrack[];
      albums?: Array<Record<string, unknown>>;
      artists?: Array<Record<string, unknown>>;
    };
  };

  const favorites = raw.favorites ?? {};
  const rawTracks = Array.isArray(favorites.tracks) ? favorites.tracks : [];
  const albums = Array.isArray(favorites.albums) ? favorites.albums : [];
  const artists = Array.isArray(favorites.artists) ? favorites.artists : [];

  return {
    tracks_count: typeof raw.tracks_count === "number" ? raw.tracks_count : rawTracks.length,
    albums_count: typeof raw.albums_count === "number" ? raw.albums_count : albums.length,
    artists_count:
      typeof raw.artists_count === "number" ? raw.artists_count : artists.length,
    favorites: {
      tracks: rawTracks.map(serviceTrackToTrack),
      albums,
      artists,
    },
  };
}

// --- HTTP Client ---

export class TidalServiceClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
  }

  async getFavorites(): Promise<FavoritesResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/favorites`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Tidal service returned ${response.status}`);
      }

      const payload = await response.json();
      return normalizeFavoritesResponse(payload);
    } finally {
      clearTimeout(timeout);
    }
  }
}
