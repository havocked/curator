import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { schemaStatements } from "./schema";
import type { TidalTrack } from "../services/tidalService";

export type SyncFavoritesResult = {
  upsertedTracks: number;
  favoriteSignals: number;
  totalTracks: number;
};

export type FavoritedTrack = {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
};

export function openDatabase(dbPath: string): Database.Database {
  if (dbPath !== ":memory:") {
    const directory = path.dirname(dbPath);
    fs.mkdirSync(directory, { recursive: true });
  }
  return new Database(dbPath);
}

export function applySchema(db: Database.Database): void {
  for (const statement of schemaStatements) {
    db.exec(statement);
  }
}

export function syncFavoriteTracks(
  db: Database.Database,
  tracks: TidalTrack[]
): SyncFavoritesResult {
  const insertTrack = db.prepare(`
    INSERT INTO tracks (
      tidal_id,
      title,
      artist_name,
      album_name,
      duration_seconds,
      synced_at
    )
    VALUES (
      @tidal_id,
      @title,
      @artist_name,
      @album_name,
      @duration_seconds,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(tidal_id) DO UPDATE SET
      title = excluded.title,
      artist_name = excluded.artist_name,
      album_name = excluded.album_name,
      duration_seconds = excluded.duration_seconds,
      synced_at = CURRENT_TIMESTAMP;
  `);

  const selectTrackId = db.prepare(`SELECT id FROM tracks WHERE tidal_id = ?`);
  const insertSignal = db.prepare(`
    INSERT INTO taste_signals (
      track_id,
      signal_type,
      signal_source,
      timestamp,
      metadata
    )
    VALUES (?, 'favorite', 'tidal', CURRENT_TIMESTAMP, NULL);
  `);
  const clearExisting = db.prepare(`
    DELETE FROM taste_signals
    WHERE signal_type = 'favorite' AND signal_source = 'tidal';
  `);

  let favoriteSignals = 0;

  const transaction = db.transaction((items: TidalTrack[]) => {
    clearExisting.run();
    for (const track of items) {
      insertTrack.run({
        tidal_id: track.id,
        title: track.title,
        artist_name: track.artist,
        album_name: track.album,
        duration_seconds: track.duration,
      });
      const row = selectTrackId.get(track.id) as { id: number } | undefined;
      if (row) {
        insertSignal.run(row.id);
        favoriteSignals += 1;
      }
    }
  });

  transaction(tracks);

  const totalRow = db.prepare(`SELECT COUNT(*) as count FROM tracks`).get() as {
    count: number;
  };

  return {
    upsertedTracks: tracks.length,
    favoriteSignals,
    totalTracks: totalRow.count,
  };
}

export function getFavoritedTracks(
  db: Database.Database,
  limit?: number
): FavoritedTrack[] {
  const baseQuery = `
    SELECT
      t.tidal_id as id,
      t.title as title,
      t.artist_name as artist,
      t.album_name as album,
      t.duration_seconds as duration
    FROM tracks t
    INNER JOIN taste_signals s ON s.track_id = t.id
    WHERE s.signal_type = 'favorite' AND s.signal_source = 'tidal'
    ORDER BY t.artist_name, t.title
  `;

  const useLimit = typeof limit === "number" && Number.isFinite(limit) && limit > 0;
  const query = useLimit ? `${baseQuery} LIMIT ?` : baseQuery;
  const stmt = db.prepare(query);
  const rows = useLimit ? stmt.all(limit) : stmt.all();

  return rows as FavoritedTrack[];
}
