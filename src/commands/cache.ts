import { Command } from "commander";
import { loadConfig } from "../lib/config";
import { openDatabase, applySchema } from "../db";
import { createEnrichmentCache } from "../enrichment";

function getCache() {
  const config = loadConfig();
  const db = openDatabase(config.database.path);
  applySchema(db);
  return { cache: createEnrichmentCache(db), db };
}

function runStats(): void {
  const { cache, db } = getCache();
  try {
    const stats = cache.stats();
    console.log(JSON.stringify({
      total: stats.total,
      found: stats.found,
      notFound: stats.notFound,
      hitRate: stats.total > 0
        ? `${((stats.found / stats.total) * 100).toFixed(0)}%`
        : "n/a",
    }, null, 2));
  } finally {
    db.close();
  }
}

type ListOptions = {
  limit?: number;
  genre?: string;
  format?: string;
};

function runList(options: ListOptions): void {
  const config = loadConfig();
  const db = openDatabase(config.database.path);
  applySchema(db);
  const { cache } = { cache: createEnrichmentCache(db) };

  try {
    const limit = options.limit ?? 50;
    const format = options.format ?? "text";

    let query = `SELECT artist_name, mbid, genres_json, votes_json, found, fetched_at
                 FROM enrichment_artists`;
    const params: unknown[] = [];

    if (options.genre) {
      query += ` WHERE found = 1 AND genres_json LIKE ?`;
      params.push(`%${options.genre.toLowerCase()}%`);
    }

    query += ` ORDER BY artist_name LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params) as Array<{
      artist_name: string;
      mbid: string | null;
      genres_json: string | null;
      found: number;
      fetched_at: string;
    }>;

    if (format === "json") {
      const output = rows.map((r) => ({
        artist: r.artist_name,
        mbid: r.mbid,
        genres: r.genres_json ? JSON.parse(r.genres_json) : [],
        found: r.found === 1,
        fetchedAt: r.fetched_at,
      }));
      console.log(JSON.stringify(output, null, 2));
    } else {
      if (rows.length === 0) {
        console.log("No cached artists found.");
        return;
      }
      for (const row of rows) {
        const genres = row.genres_json ? JSON.parse(row.genres_json) as string[] : [];
        const top3 = genres.slice(0, 3).join(", ") || "(not found)";
        console.log(`${row.artist_name} — ${top3}`);
      }
      console.log(`\n${rows.length} artists shown.`);
    }
  } finally {
    db.close();
  }
}

function runClear(): void {
  const config = loadConfig();
  const db = openDatabase(config.database.path);
  try {
    const result = db.prepare("DELETE FROM enrichment_artists").run();
    console.log(`Cleared ${result.changes} cached artists.`);
  } catch {
    console.log("No cache table found (nothing to clear).");
  } finally {
    db.close();
  }
}

export function registerCacheCommand(program: Command): void {
  const cacheCmd = program
    .command("cache")
    .description("Inspect and manage the enrichment cache");

  cacheCmd
    .command("stats")
    .description("Show cache statistics")
    .action(() => runStats());

  cacheCmd
    .command("list")
    .description("List cached artists and their genres")
    .option("--limit <count>", "Max results", (v) => Number.parseInt(v, 10))
    .option("--genre <genre>", "Filter by genre")
    .option("--format <format>", "Output format (text|json)", "text")
    .action((options: ListOptions) => runList(options));

  cacheCmd
    .command("clear")
    .description("Clear all cached enrichment data")
    .action(() => runClear());
}
