import type Database from "better-sqlite3";

/**
 * TTL constants for cache entries.
 */
export const CACHE_TTL = {
  /** Successful lookups: 30 days */
  FOUND_DAYS: 30,
  /** "Not found" lookups: 7 days (retry sooner — might be transient) */
  NOT_FOUND_DAYS: 7,
};

// --- Schema ---

export const enrichmentSchemaStatements = [
  `
CREATE TABLE IF NOT EXISTS enrichment_artists (
  artist_name TEXT PRIMARY KEY,
  mbid TEXT,
  genres_json TEXT,
  votes_json TEXT,
  found INTEGER NOT NULL DEFAULT 1,
  fetched_at TEXT NOT NULL
);
  `,
  `CREATE INDEX IF NOT EXISTS idx_enrichment_artists_mbid
   ON enrichment_artists(mbid);`,
  // BPM cache: keyed by track_id (Tidal), stores BPM + key from GetSongBPM
  `
CREATE TABLE IF NOT EXISTS enrichment_bpm (
  track_id INTEGER PRIMARY KEY,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  bpm REAL,
  key TEXT,
  time_sig TEXT,
  found INTEGER NOT NULL DEFAULT 1,
  fetched_at TEXT NOT NULL
);
  `,
  `CREATE INDEX IF NOT EXISTS idx_enrichment_bpm_artist_title
   ON enrichment_bpm(artist, title);`,
];

// --- Types ---

export type CachedArtist = {
  mbid: string;
  genres: string[];
  votes: number[];
};

export type CachedBPM = {
  bpm: number | null;
  key: string | null;
  timeSignature: string | null;
};

// --- Cache Operations ---

export type EnrichmentCache = {
  getArtist(name: string): CachedArtist | "not_found" | null;
  setArtist(name: string, data: CachedArtist): void;
  setArtistNotFound(name: string): void;

  getBPM(trackId: number): CachedBPM | "not_found" | null;
  setBPM(trackId: number, artist: string, title: string, data: CachedBPM): void;
  setBPMNotFound(trackId: number, artist: string, title: string): void;

  stats(): { total: number; found: number; notFound: number };
  bpmStats(): { total: number; found: number; notFound: number };
};

export function createEnrichmentCache(db: Database.Database): EnrichmentCache {
  // Apply schema
  for (const stmt of enrichmentSchemaStatements) {
    db.exec(stmt);
  }

  // --- Artist (MusicBrainz) prepared statements ---

  const getStmt = db.prepare(
    `SELECT mbid, genres_json, votes_json, found, fetched_at
     FROM enrichment_artists WHERE artist_name = ?`
  );

  const upsertStmt = db.prepare(
    `INSERT INTO enrichment_artists (artist_name, mbid, genres_json, votes_json, found, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(artist_name) DO UPDATE SET
       mbid = excluded.mbid,
       genres_json = excluded.genres_json,
       votes_json = excluded.votes_json,
       found = excluded.found,
       fetched_at = excluded.fetched_at`
  );

  // --- BPM (GetSongBPM) prepared statements ---

  const getBPMStmt = db.prepare(
    `SELECT bpm, key, time_sig, found, fetched_at
     FROM enrichment_bpm WHERE track_id = ?`
  );

  const upsertBPMStmt = db.prepare(
    `INSERT INTO enrichment_bpm (track_id, artist, title, bpm, key, time_sig, found, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(track_id) DO UPDATE SET
       artist = excluded.artist,
       title = excluded.title,
       bpm = excluded.bpm,
       key = excluded.key,
       time_sig = excluded.time_sig,
       found = excluded.found,
       fetched_at = excluded.fetched_at`
  );

  function isExpired(fetchedAt: string, found: boolean): boolean {
    const ttlDays = found ? CACHE_TTL.FOUND_DAYS : CACHE_TTL.NOT_FOUND_DAYS;
    const fetchedMs = new Date(fetchedAt).getTime();
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    return Date.now() - fetchedMs > ttlMs;
  }

  return {
    getArtist(name: string): CachedArtist | "not_found" | null {
      const row = getStmt.get(name) as
        | { mbid: string | null; genres_json: string | null; votes_json: string | null; found: number; fetched_at: string }
        | undefined;

      if (!row) return null; // No cache entry at all

      // Check TTL
      if (isExpired(row.fetched_at, row.found === 1)) {
        return null; // Expired — treat as cache miss
      }

      if (row.found === 0) return "not_found"; // Cached "not found"

      return {
        mbid: row.mbid ?? "",
        genres: JSON.parse(row.genres_json ?? "[]") as string[],
        votes: JSON.parse(row.votes_json ?? "[]") as number[],
      };
    },

    setArtist(name: string, data: CachedArtist): void {
      upsertStmt.run(
        name,
        data.mbid,
        JSON.stringify(data.genres),
        JSON.stringify(data.votes),
        1,
        new Date().toISOString()
      );
    },

    setArtistNotFound(name: string): void {
      upsertStmt.run(name, null, null, null, 0, new Date().toISOString());
    },

    // --- BPM cache ---

    getBPM(trackId: number): CachedBPM | "not_found" | null {
      const row = getBPMStmt.get(trackId) as
        | { bpm: number | null; key: string | null; time_sig: string | null; found: number; fetched_at: string }
        | undefined;

      if (!row) return null;

      if (isExpired(row.fetched_at, row.found === 1)) {
        return null; // Expired
      }

      if (row.found === 0) return "not_found";

      return {
        bpm: row.bpm,
        key: row.key,
        timeSignature: row.time_sig,
      };
    },

    setBPM(trackId: number, artist: string, title: string, data: CachedBPM): void {
      upsertBPMStmt.run(
        trackId,
        artist,
        title,
        data.bpm,
        data.key,
        data.timeSignature,
        1,
        new Date().toISOString()
      );
    },

    setBPMNotFound(trackId: number, artist: string, title: string): void {
      upsertBPMStmt.run(
        trackId,
        artist,
        title,
        null,
        null,
        null,
        0,
        new Date().toISOString()
      );
    },

    // --- Stats ---

    stats(): { total: number; found: number; notFound: number } {
      const row = db
        .prepare(
          `SELECT
             COUNT(*) as total,
             COALESCE(SUM(CASE WHEN found = 1 THEN 1 ELSE 0 END), 0) as found,
             COALESCE(SUM(CASE WHEN found = 0 THEN 1 ELSE 0 END), 0) as not_found
           FROM enrichment_artists`
        )
        .get() as { total: number; found: number; not_found: number };
      return { total: row.total, found: row.found, notFound: row.not_found };
    },

    bpmStats(): { total: number; found: number; notFound: number } {
      const row = db
        .prepare(
          `SELECT
             COUNT(*) as total,
             COALESCE(SUM(CASE WHEN found = 1 THEN 1 ELSE 0 END), 0) as found,
             COALESCE(SUM(CASE WHEN found = 0 THEN 1 ELSE 0 END), 0) as not_found
           FROM enrichment_bpm`
        )
        .get() as { total: number; found: number; not_found: number };
      return { total: row.total, found: row.found, notFound: row.not_found };
    },
  };
}
