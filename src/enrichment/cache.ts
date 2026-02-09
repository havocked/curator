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
];

// --- Types ---

export type CachedArtist = {
  mbid: string;
  genres: string[];
  votes: number[];
};

// --- Cache Operations ---

export type EnrichmentCache = {
  getArtist(name: string): CachedArtist | "not_found" | null;
  setArtist(name: string, data: CachedArtist): void;
  setArtistNotFound(name: string): void;
  stats(): { total: number; found: number; notFound: number };
};

export function createEnrichmentCache(db: Database.Database): EnrichmentCache {
  // Apply schema
  for (const stmt of enrichmentSchemaStatements) {
    db.exec(stmt);
  }

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

    stats(): { total: number; found: number; notFound: number } {
      const row = db
        .prepare(
          `SELECT
             COUNT(*) as total,
             SUM(CASE WHEN found = 1 THEN 1 ELSE 0 END) as found,
             SUM(CASE WHEN found = 0 THEN 1 ELSE 0 END) as not_found
           FROM enrichment_artists`
        )
        .get() as { total: number; found: number; not_found: number };
      return { total: row.total, found: row.found, notFound: row.not_found };
    },
  };
}
