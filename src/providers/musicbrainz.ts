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
    const response = await fetchFn(url, { headers: { "User-Agent": userAgent } });
    if (!response.ok) {
      throw new Error(`MusicBrainz API error: ${response.status}`);
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

  return {
    searchLabel,
    getLabelArtists,
  };
}

export const musicBrainzClient = createMusicBrainzClient();
export const searchLabel = musicBrainzClient.searchLabel;
export const getLabelArtists = musicBrainzClient.getLabelArtists;
