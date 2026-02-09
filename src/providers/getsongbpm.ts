/**
 * GetSongBPM provider — BPM + key lookup for tracks.
 *
 * API: https://getsongbpm.com/api
 * Endpoints:
 *   GET /search/?api_key=KEY&type=song&lookup=QUERY  → list of song matches
 *   GET /song/?api_key=KEY&id=SONG_ID                → full song details (tempo, key, etc.)
 *
 * Rate limits: not documented, using 500ms between calls as a safe default.
 */

type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

// --- Types ---

export type TrackBPM = {
  bpm: number | null;
  key: string | null;
  timeSignature: string | null;
};

export type SongSearchResult = {
  songId: string;
  title: string;
  artist: string;
};

export type GetSongBPMClientOptions = {
  apiKey: string;
  fetchFn?: FetchLike;
  rateLimitMs?: number;
};

// --- Constants ---

const GETSONGBPM_BASE = "https://api.getsongbpm.com";
const DEFAULT_RATE_LIMIT_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Client ---

export function createGetSongBPMClient(options: GetSongBPMClientOptions) {
  const { apiKey } = options;
  const fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
  const rateLimitMs = options.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  let lastRequestTime = 0;

  async function bpmFetch(
    endpoint: string,
    params: Record<string, string>
  ): Promise<unknown> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < rateLimitMs) {
      await sleep(rateLimitMs - elapsed);
    }
    lastRequestTime = Date.now();

    const query = new URLSearchParams({ ...params, api_key: apiKey });
    const url = `${GETSONGBPM_BASE}${endpoint}?${query}`;

    let response: { ok: boolean; status: number; json: () => Promise<unknown> };
    try {
      response = await fetchFn(url, {
        headers: { "User-Agent": "Curator/1.0" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`GetSongBPM network error: ${msg} (${url})`);
    }
    if (!response.ok) {
      throw new Error(`GetSongBPM API ${response.status} (${endpoint})`);
    }
    return response.json();
  }

  /**
   * Search for a song by title + artist.
   * Returns the top matching song's ID, or null if no match.
   */
  async function searchSong(
    artist: string,
    title: string
  ): Promise<SongSearchResult | null> {
    const lookup = `${title} ${artist}`;
    const data = (await bpmFetch("/search/", {
      type: "song",
      lookup,
    })) as {
      search?: Array<{
        id: string;
        title: string;
        artist?: { name?: string };
      }>;
    };

    const results = data.search ?? [];
    if (results.length === 0) return null;

    const best = results[0]!;
    return {
      songId: best.id,
      title: best.title ?? "",
      artist: best.artist?.name ?? "",
    };
  }

  /**
   * Get full song details (BPM, key, time sig) by song ID.
   */
  async function getSongDetails(songId: string): Promise<TrackBPM> {
    const data = (await bpmFetch("/song/", { id: songId })) as {
      song?: {
        tempo?: string;
        key_of?: string;
        time_sig?: string;
      };
    };

    const song = data.song;
    if (!song) return { bpm: null, key: null, timeSignature: null };

    const bpm = song.tempo ? parseFloat(song.tempo) : null;
    const key = song.key_of || null;
    const timeSignature = song.time_sig || null;

    return {
      bpm: bpm !== null && !isNaN(bpm) ? bpm : null,
      key,
      timeSignature,
    };
  }

  /**
   * Search for a track and return its BPM + key.
   * Two API calls: search → song details.
   * Returns null values if not found.
   */
  async function lookupTrack(
    artist: string,
    title: string
  ): Promise<TrackBPM> {
    const match = await searchSong(artist, title);
    if (!match) return { bpm: null, key: null, timeSignature: null };
    return getSongDetails(match.songId);
  }

  return {
    searchSong,
    getSongDetails,
    lookupTrack,
  };
}
