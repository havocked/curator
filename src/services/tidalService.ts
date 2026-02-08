export type TidalAudioFeatures = {
  bpm?: number | null;
  key?: string | null;
  key_scale?: string | null;
  peak?: number | null;
};

export type TidalTrack = {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  album_art?: string | null;
  audio_features?: TidalAudioFeatures;
  release_year?: number | null;
  popularity?: number | null;
  genres?: string[];
  mood?: string[];
};

export type FavoritesResponse = {
  tracks_count: number;
  albums_count: number;
  artists_count: number;
  favorites: {
    tracks: TidalTrack[];
    albums: Array<Record<string, unknown>>;
    artists: Array<Record<string, unknown>>;
  };
};

export function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, "");
}

export function normalizeFavoritesResponse(payload: unknown): FavoritesResponse {
  const raw = (payload ?? {}) as {
    tracks_count?: number;
    albums_count?: number;
    artists_count?: number;
    favorites?: {
      tracks?: TidalTrack[];
      albums?: Array<Record<string, unknown>>;
      artists?: Array<Record<string, unknown>>;
    };
  };

  const favorites = raw.favorites ?? {};
  const tracks = Array.isArray(favorites.tracks) ? favorites.tracks : [];
  const albums = Array.isArray(favorites.albums) ? favorites.albums : [];
  const artists = Array.isArray(favorites.artists) ? favorites.artists : [];

  return {
    tracks_count: typeof raw.tracks_count === "number" ? raw.tracks_count : tracks.length,
    albums_count: typeof raw.albums_count === "number" ? raw.albums_count : albums.length,
    artists_count:
      typeof raw.artists_count === "number" ? raw.artists_count : artists.length,
    favorites: { tracks, albums, artists },
  };
}

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
