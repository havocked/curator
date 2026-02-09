type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type Label = {
  mbid: string;
  name: string;
  country?: string;
  founded?: string;
};

export type ArtistMatch = {
  mbid: string;
  name: string;
  score: number;
  disambiguation?: string;
};

export type ArtistGenres = {
  mbid: string;
  genres: string[];
  votes: number[];
};

export type MusicBrainzClientOptions = {
  fetchFn?: FetchLike;
  userAgent?: string;
  rateLimitMs?: number;
};

const MB_BASE_URL = "https://musicbrainz.org/ws/2";
const DEFAULT_USER_AGENT = "Curator/1.0 (curator@example.com)";
const DEFAULT_RATE_LIMIT_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMusicBrainzClient(options: MusicBrainzClientOptions = {}) {
  const fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const rateLimitMs = options.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  let lastRequestTime = 0;

  async function mbFetch(path: string): Promise<unknown> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < rateLimitMs) {
      await sleep(rateLimitMs - elapsed);
    }
    lastRequestTime = Date.now();

    const url = `${MB_BASE_URL}${path}`;
    let response: { ok: boolean; status: number; json: () => Promise<unknown> };
    try {
      response = await fetchFn(url, { headers: { "User-Agent": userAgent } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`MusicBrainz network error: ${msg} (${url})`);
    }
    if (!response.ok) {
      throw new Error(`MusicBrainz API ${response.status} (${path})`);
    }
    return response.json();
  }

  async function searchLabel(name: string, limit = 1): Promise<Label | null> {
    const data = (await mbFetch(
      `/label?query=${encodeURIComponent(name)}&fmt=json&limit=${limit}`
    )) as { labels?: Array<Record<string, unknown>> };

    const labels = data.labels ?? [];
    const label = labels[0];
    if (!label) {
      return null;
    }
    const result: Label = {
      mbid: String(label.id ?? ""),
      name: String(label.name ?? ""),
    };

    if (label.country) {
      result.country = String(label.country);
    }
    if (label["life-span"] && typeof label["life-span"] === "object") {
      const founded = (label["life-span"] as { begin?: unknown }).begin;
      if (founded) {
        result.founded = String(founded);
      }
    }

    return result;
  }

  async function getLabelArtists(labelMbid: string): Promise<string[]> {
    const data = (await mbFetch(
      `/label/${encodeURIComponent(labelMbid)}?fmt=json&inc=artist-rels`
    )) as { relations?: Array<Record<string, unknown>> };

    const artists: string[] = [];
    for (const rel of data.relations ?? []) {
      if (rel.type === "recording contract" && rel.artist) {
        const artist = rel.artist as { name?: unknown };
        if (artist.name) {
          artists.push(String(artist.name));
        }
      }
    }
    return artists;
  }

  /**
   * Search for an artist by name. Returns top match with score.
   * Uses quoted phrase search to avoid Lucene syntax issues (periods, slashes).
   * Falls back to first part before "&" if full name returns no results.
   */
  async function searchArtist(name: string, limit = 3): Promise<ArtistMatch | null> {
    const result = await searchArtistExact(name, limit);
    if (result) return result;

    // Fallback: if name contains "&", try the first part
    // Handles "Gorillaz & Little Simz" → search "Gorillaz"
    const ampIdx = name.indexOf(" & ");
    if (ampIdx > 0) {
      return searchArtistExact(name.slice(0, ampIdx).trim(), limit);
    }

    return null;
  }

  async function searchArtistExact(name: string, limit: number): Promise<ArtistMatch | null> {
    // Quote the artist name to treat it as a phrase (avoids Lucene syntax issues
    // with periods, slashes, etc. — e.g. "Fontaines D.C.", "AC/DC")
    const quoted = `"${name.replace(/"/g, "")}"`;
    const data = (await mbFetch(
      `/artist?query=artist:${encodeURIComponent(quoted)}&fmt=json&limit=${limit}`
    )) as { artists?: Array<{ id: string; name: string; score: number; disambiguation?: string }> };

    const artists = data.artists ?? [];
    const best = artists[0];
    if (!best || best.score < 50) return null;

    return {
      mbid: best.id,
      name: best.name,
      score: best.score,
      ...(best.disambiguation ? { disambiguation: best.disambiguation } : {}),
    };
  }

  /**
   * Get genres for an artist by MBID.
   * Uses the genres sub-resource (curated, voted-on genres).
   */
  async function getArtistGenres(mbid: string): Promise<ArtistGenres> {
    const data = (await mbFetch(
      `/artist/${encodeURIComponent(mbid)}?inc=genres&fmt=json`
    )) as { id: string; genres?: Array<{ name: string; count: number }> };

    const genres = data.genres ?? [];
    // Sort by vote count descending
    genres.sort((a, b) => b.count - a.count);

    return {
      mbid,
      genres: genres.map((g) => g.name),
      votes: genres.map((g) => g.count),
    };
  }

  return {
    searchLabel,
    getLabelArtists,
    searchArtist,
    getArtistGenres,
  };
}

export const musicBrainzClient = createMusicBrainzClient();
export const searchLabel = musicBrainzClient.searchLabel;
export const getLabelArtists = musicBrainzClient.getLabelArtists;
export const searchArtist = musicBrainzClient.searchArtist;
export const getArtistGenres = musicBrainzClient.getArtistGenres;
