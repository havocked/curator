# Phase 1: Music Metadata Enrichment — Step-by-Step Specification

**Date:** 2026-02-09  
**Branch:** `feature/audio-enrichment`  
**Goal:** Add MusicBrainz (genres) + Last.fm (moods) + GetSongBPM (BPM/key) enrichment to curator  
**Strategy:** Test each step before committing. Incremental, reversible changes.

---

## Success Criteria

By the end of Phase 1, curator should:
1. ✅ Enrich tracks with **artist genres** from MusicBrainz
2. ✅ Enrich tracks with **mood/vibe tags** from Last.fm
3. ✅ Fill **BPM/key gaps** using GetSongBPM when Tidal returns null
4. ✅ Cache all enriched metadata in SQLite (avoid redundant API calls)
5. ✅ Support `--enrich` flag on `discover` command (opt-in enrichment)
6. ✅ Support `--genre-filter <genre>` flag (real genre, not keyword)
7. ✅ Support `--mood <mood>` flag (Last.fm tags)
8. ✅ Improve `arrange --arc gentle_rise` with BPM-complete data

**Non-goals (Phase 2+):**
- ❌ Audio file handling (Cyanite.ai, Essentia)
- ❌ Discogs integration
- ❌ Uploading enriched data back to Tidal

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      discover command                        │
│                                                              │
│  1. Fetch tracks from Tidal (existing)                      │
│  2. IF --enrich flag:                                        │
│     ┌──────────────────────────────────────────────┐        │
│     │ EnrichmentOrchestrator                        │        │
│     │   ├─ Check cache (SQLite)                     │        │
│     │   ├─ MusicBrainz: artist genres               │        │
│     │   ├─ Last.fm: track moods + artist tags       │        │
│     │   ├─ GetSongBPM: BPM + key (if null)          │        │
│     │   └─ Store enriched data in cache             │        │
│     └──────────────────────────────────────────────┘        │
│  3. Apply filters (--genre-filter, --mood)                  │
│  4. Output (existing)                                        │
└─────────────────────────────────────────────────────────────┘
```

**Data Flow:**
```
Tidal Track → [Enrich] → MusicBrainz → Last.fm → GetSongBPM → Enriched Track → Filter → Output
                  ↓
              SQLite Cache
           (check before fetch)
```

---

## Extended Track Type

**Current:** `src/services/types.ts`
```typescript
export type Track = {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  release_year: number | null;
  popularity: number | null;
  genres: string[];           // Always empty (Tidal INTERNAL)
  mood: string[];             // Always empty (Tidal INTERNAL)
  audio_features: {
    bpm: number | null;       // Sparse from Tidal
    key: string | null;       // Sparse from Tidal
  };
};
```

**New fields to add:**
```typescript
export type Track = {
  // ... existing fields ...
  
  // Enrichment metadata (optional, populated by --enrich)
  enrichment?: {
    // MusicBrainz
    artist_mbid?: string;              // MusicBrainz artist ID
    artist_genres?: string[];          // e.g., ["electronic", "house", "techno"]
    artist_genre_votes?: number[];     // Vote counts per genre (confidence)
    
    // Last.fm
    track_moods?: string[];            // e.g., ["chill", "energetic", "groovy"]
    track_mood_scores?: number[];      // Tag counts (popularity)
    artist_tags?: string[];            // Fallback artist tags
    
    // GetSongBPM
    getsongbpm_bpm?: number;           // BPM from GetSongBPM (if Tidal null)
    getsongbpm_key?: string;           // Key from GetSongBPM (if Tidal null)
    
    // Metadata
    enriched_at?: string;              // ISO timestamp
    enrichment_sources?: string[];     // e.g., ["musicbrainz", "lastfm"]
  };
};
```

**Why optional `enrichment` object:**
- Keeps backward compatibility
- Clear separation: Tidal data vs. enriched data
- Easy to check if track has been enriched: `if (track.enrichment) { ... }`

---

## Step-by-Step Implementation Plan

### Step 0: Setup Branch & Dependencies
**Goal:** Create isolated branch, install dependencies, no code changes yet

**Actions:**
```bash
cd ~/clawd/projects/curator
git checkout -b feature/audio-enrichment
npm install --save-dev @types/node
```

**Test:**
```bash
npm run build
npm test
# All existing tests should pass
```

**Commit:** `git commit -m "chore: create feature/audio-enrichment branch"`

---

### Step 1: Extend Track Type
**Goal:** Add `enrichment` field to Track type, verify TypeScript compilation

**Files to modify:**
- `src/services/types.ts`

**Changes:**
```typescript
// Add EnrichmentMetadata type
export type EnrichmentMetadata = {
  artist_mbid?: string;
  artist_genres?: string[];
  artist_genre_votes?: number[];
  track_moods?: string[];
  track_mood_scores?: number[];
  artist_tags?: string[];
  getsongbpm_bpm?: number;
  getsongbpm_key?: string;
  enriched_at?: string;
  enrichment_sources?: string[];
};

// Add to Track type
export type Track = {
  // ... existing fields ...
  enrichment?: EnrichmentMetadata;
};
```

**Test:**
```bash
npm run build
# Should compile without errors
# Run existing tests
npm test
```

**Success criteria:**
- ✅ TypeScript compiles
- ✅ All existing tests pass
- ✅ No runtime changes (backward compatible)

**Commit:** `git commit -m "feat: add enrichment metadata to Track type"`

---

### Step 2: Create SQLite Enrichment Cache Schema
**Goal:** Add database tables for caching enriched metadata

**Files to create/modify:**
- `src/db/enrichment-schema.ts` (new)
- `src/db/index.ts` (modify)

**Schema design:**
```typescript
// src/db/enrichment-schema.ts
export const enrichmentTables = `
-- MusicBrainz artist cache
CREATE TABLE IF NOT EXISTS mb_artist_cache (
  tidal_artist_name TEXT PRIMARY KEY,
  mbid TEXT NOT NULL,
  genres_json TEXT,        -- JSON array of genres
  votes_json TEXT,         -- JSON array of vote counts
  fetched_at TEXT NOT NULL
);

-- Last.fm track mood cache
CREATE TABLE IF NOT EXISTS lastfm_track_cache (
  tidal_track_id INTEGER PRIMARY KEY,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  moods_json TEXT,         -- JSON array of mood tags
  scores_json TEXT,        -- JSON array of tag counts
  fetched_at TEXT NOT NULL
);

-- Last.fm artist tag cache
CREATE TABLE IF NOT EXISTS lastfm_artist_cache (
  artist_name TEXT PRIMARY KEY,
  tags_json TEXT,          -- JSON array of tags
  scores_json TEXT,        -- JSON array of tag counts
  fetched_at TEXT NOT NULL
);

-- GetSongBPM cache
CREATE TABLE IF NOT EXISTS getsongbpm_cache (
  tidal_track_id INTEGER PRIMARY KEY,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  bpm REAL,
  musical_key TEXT,
  fetched_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mb_artist_mbid ON mb_artist_cache(mbid);
CREATE INDEX IF NOT EXISTS idx_lastfm_track_artist_title ON lastfm_track_cache(artist, title);
CREATE INDEX IF NOT EXISTS idx_getsongbpm_artist_title ON getsongbpm_cache(artist, title);
`;
```

**Integration into existing DB:**
```typescript
// src/db/index.ts
import { enrichmentTables } from './enrichment-schema.js';

export function initDatabase(dbPath: string) {
  const db = new Database(dbPath);
  
  // Existing schema
  db.exec(createTablesSQL);
  
  // Enrichment schema
  db.exec(enrichmentTables);
  
  return db;
}
```

**Test:**
```bash
# Create test script: test-enrichment-schema.js
node dist/test-enrichment-schema.js
# Should create tables without errors

# Check schema
sqlite3 data/curator.db ".schema mb_artist_cache"
```

**Success criteria:**
- ✅ Tables created successfully
- ✅ Indexes exist
- ✅ No errors on existing database

**Commit:** `git commit -m "feat: add enrichment cache schema to database"`

---

### Step 3: Create MusicBrainz Genre Provider
**Goal:** Add artist genre lookup to existing MusicBrainz provider

**Files to modify:**
- `src/providers/musicbrainz.ts`

**New functions to add:**
```typescript
export type ArtistGenres = {
  mbid: string;
  genres: string[];
  votes: number[];  // Vote count per genre
};

/**
 * Search for artist by name, return MBID
 */
async function searchArtist(name: string, limit = 1): Promise<{ mbid: string; name: string } | null> {
  const query = encodeURIComponent(name);
  const path = `/artist/?query=artist:${query}&fmt=json&limit=${limit}`;
  const response = await mbFetch(path) as { artists: Array<{ id: string; name: string }> };
  
  if (!response.artists || response.artists.length === 0) {
    return null;
  }
  
  return {
    mbid: response.artists[0].id,
    name: response.artists[0].name
  };
}

/**
 * Get genres for an artist by MBID
 */
async function getArtistGenres(mbid: string): Promise<ArtistGenres> {
  const path = `/artist/${mbid}?inc=genres+tags&fmt=json`;
  const response = await mbFetch(path) as {
    id: string;
    genres?: Array<{ name: string; count: number }>;
    tags?: Array<{ name: string; count: number }>;
  };
  
  // Prefer genres over tags (genres are curated subset)
  const genreData = response.genres || [];
  
  return {
    mbid,
    genres: genreData.map(g => g.name),
    votes: genreData.map(g => g.count)
  };
}

// Export both functions in client
export function createMusicBrainzClient(options: MusicBrainzClientOptions = {}) {
  // ... existing code ...
  
  return {
    searchLabel,
    getLabelArtists,
    searchArtist,      // NEW
    getArtistGenres    // NEW
  };
}
```

**Test:**
```bash
# Create test script: test-mb-genres.js
node dist/test-mb-genres.js
```

**Test cases:**
```typescript
// test-mb-genres.js
const client = createMusicBrainzClient();

// Test 1: Search artist
const artist = await client.searchArtist("Daft Punk");
console.log("Artist:", artist);
// Expected: { mbid: "056e4f3e-d505-4dad-8ec1-d04f521cbb56", name: "Daft Punk" }

// Test 2: Get genres
const genres = await client.getArtistGenres(artist.mbid);
console.log("Genres:", genres);
// Expected: { mbid: "...", genres: ["electronic", "house", "disco"], votes: [10, 8, 5] }
```

**Success criteria:**
- ✅ Finds popular artists (Daft Punk, Radiohead, Beyoncé)
- ✅ Returns genre arrays with votes
- ✅ Respects rate limit (1100ms between calls)
- ✅ Handles artist not found gracefully (returns null)

**Commit:** `git commit -m "feat: add artist genre lookup to MusicBrainz provider"`

---

### Step 4: Create Last.fm Provider
**Goal:** New provider for track/artist mood tags

**Files to create:**
- `src/providers/lastfm.ts` (new)
- `test-lastfm.ts` (test script)

**API Key:** Get from https://www.last.fm/api/account/create

**Provider structure:**
```typescript
// src/providers/lastfm.ts
type FetchLike = (input: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type LastFmClientOptions = {
  apiKey: string;
  fetchFn?: FetchLike;
  rateLimitMs?: number;
};

export type TrackTags = {
  tags: string[];
  scores: number[];  // Tag counts (popularity)
};

export type ArtistTags = {
  tags: string[];
  scores: number[];
};

const LASTFM_BASE_URL = "https://ws.audioscrobbler.com/2.0/";
const DEFAULT_RATE_LIMIT_MS = 200;  // 5 req/sec = 200ms

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createLastFmClient(options: LastFmClientOptions) {
  const { apiKey } = options;
  const fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
  const rateLimitMs = options.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  let lastRequestTime = 0;

  async function lfmFetch(params: Record<string, string>): Promise<unknown> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < rateLimitMs) {
      await sleep(rateLimitMs - elapsed);
    }
    lastRequestTime = Date.now();

    const query = new URLSearchParams({
      ...params,
      api_key: apiKey,
      format: 'json'
    });
    const url = `${LASTFM_BASE_URL}?${query}`;
    const response = await fetchFn(url);
    
    if (!response.ok) {
      throw new Error(`Last.fm API error: ${response.status}`);
    }
    return response.json();
  }

  async function getTrackTopTags(artist: string, track: string, limit = 10): Promise<TrackTags> {
    const response = await lfmFetch({
      method: 'track.getTopTags',
      artist,
      track,
      limit: String(limit)
    }) as {
      toptags?: {
        tag?: Array<{ name: string; count: number }>;
      };
    };

    const tags = response.toptags?.tag || [];
    
    return {
      tags: tags.map(t => t.name),
      scores: tags.map(t => t.count)
    };
  }

  async function getArtistTopTags(artist: string, limit = 10): Promise<ArtistTags> {
    const response = await lfmFetch({
      method: 'artist.getTopTags',
      artist,
      limit: String(limit)
    }) as {
      toptags?: {
        tag?: Array<{ name: string; count: number }>;
      };
    };

    const tags = response.toptags?.tag || [];
    
    return {
      tags: tags.map(t => t.name),
      scores: tags.map(t => t.count)
    };
  }

  return {
    getTrackTopTags,
    getArtistTopTags
  };
}
```

**Test:**
```typescript
// test-lastfm.ts
const client = createLastFmClient({ apiKey: process.env.LASTFM_API_KEY! });

// Test 1: Track tags
const trackTags = await client.getTrackTopTags("Daft Punk", "Get Lucky");
console.log("Track tags:", trackTags);
// Expected: { tags: ["funk", "disco", "electronic", "dance", "groovy"], scores: [100, 87, 65, ...] }

// Test 2: Artist tags
const artistTags = await client.getArtistTopTags("Daft Punk");
console.log("Artist tags:", artistTags);
// Expected: { tags: ["electronic", "house", "french", ...], scores: [...] }

// Test 3: Rate limiting (5 calls should take ~1 second)
const start = Date.now();
for (let i = 0; i < 5; i++) {
  await client.getArtistTopTags("Test Artist");
}
const elapsed = Date.now() - start;
console.log(`5 calls took ${elapsed}ms (should be ~1000ms)`);
```

**Success criteria:**
- ✅ Returns tags for popular tracks
- ✅ Returns artist tags as fallback
- ✅ Respects rate limit (200ms between calls)
- ✅ Handles track/artist not found gracefully (empty arrays)

**Commit:** `git commit -m "feat: add Last.fm provider for mood/tag enrichment"`

---

### Step 5: Create GetSongBPM Provider
**Goal:** New provider for BPM + key lookup

**Files to create:**
- `src/providers/getsongbpm.ts` (new)
- `test-getsongbpm.ts` (test script)

**API Key:** Get from https://getsongbpm.com/api

**Provider structure:**
```typescript
// src/providers/getsongbpm.ts
export type GetSongBPMClientOptions = {
  apiKey: string;
  fetchFn?: FetchLike;
  rateLimitMs?: number;
};

export type TrackBPM = {
  bpm: number | null;
  key: string | null;
};

const GETSONGBPM_BASE_URL = "https://api.getsongbpm.com";
const DEFAULT_RATE_LIMIT_MS = 1000;  // Conservative, adjust after testing

export function createGetSongBPMClient(options: GetSongBPMClientOptions) {
  const { apiKey } = options;
  const fetchFn = options.fetchFn ?? (fetch as unknown as FetchLike);
  const rateLimitMs = options.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  let lastRequestTime = 0;

  async function gbpmFetch(endpoint: string, params: Record<string, string>): Promise<unknown> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < rateLimitMs) {
      await sleep(rateLimitMs - elapsed);
    }
    lastRequestTime = Date.now();

    const query = new URLSearchParams({
      ...params,
      api_key: apiKey
    });
    const url = `${GETSONGBPM_BASE_URL}${endpoint}?${query}`;
    const response = await fetchFn(url);
    
    if (!response.ok) {
      throw new Error(`GetSongBPM API error: ${response.status}`);
    }
    return response.json();
  }

  async function searchTrack(artist: string, title: string): Promise<TrackBPM> {
    const lookup = `${title} ${artist}`;
    const response = await gbpmFetch('/search/', {
      type: 'song',
      lookup
    }) as {
      search?: Array<{
        song_id: string;
        song_title: string;
        artist_name: string;
      }>;
    };

    const results = response.search || [];
    if (results.length === 0) {
      return { bpm: null, key: null };
    }

    // Get full details for first result
    const songId = results[0].song_id;
    const details = await gbpmFetch('/song/', { id: songId }) as {
      song?: {
        tempo?: string;  // BPM as string
        song_key?: string;
      };
    };

    const bpm = details.song?.tempo ? parseFloat(details.song.tempo) : null;
    const key = details.song?.song_key || null;

    return { bpm, key };
  }

  return {
    searchTrack
  };
}
```

**Test:**
```typescript
// test-getsongbpm.ts
const client = createGetSongBPMClient({ apiKey: process.env.GETSONGBPM_API_KEY! });

// Test 1: Known track with BPM
const result1 = await client.searchTrack("Daft Punk", "Get Lucky");
console.log("Get Lucky:", result1);
// Expected: { bpm: 116, key: "F# minor" } (or similar)

// Test 2: Track not found
const result2 = await client.searchTrack("Unknown Artist", "Fake Song");
console.log("Not found:", result2);
// Expected: { bpm: null, key: null }
```

**Success criteria:**
- ✅ Returns BPM + key for popular tracks
- ✅ Handles not found gracefully (null values)
- ✅ Respects rate limit
- ✅ Parses BPM string to number correctly

**Commit:** `git commit -m "feat: add GetSongBPM provider for BPM/key enrichment"`

---

### Step 6: Create Enrichment Orchestrator
**Goal:** Coordinate all 3 providers, manage cache, combine results

**Files to create:**
- `src/enrichment/orchestrator.ts` (new)
- `src/enrichment/cache.ts` (new)
- `src/enrichment/index.ts` (barrel export)

**Cache layer:**
```typescript
// src/enrichment/cache.ts
import Database from 'better-sqlite3';
import { EnrichmentMetadata } from '../services/types.js';

export type EnrichmentCache = {
  getMusicBrainzArtist(artist: string): { mbid: string; genres: string[]; votes: number[] } | null;
  setMusicBrainzArtist(artist: string, mbid: string, genres: string[], votes: number[]): void;
  
  getLastFmTrack(trackId: number): { moods: string[]; scores: number[] } | null;
  setLastFmTrack(trackId: number, artist: string, title: string, moods: string[], scores: number[]): void;
  
  getLastFmArtist(artist: string): { tags: string[]; scores: number[] } | null;
  setLastFmArtist(artist: string, tags: string[], scores: number[]): void;
  
  getGetSongBPM(trackId: number): { bpm: number; key: string } | null;
  setGetSongBPM(trackId: number, artist: string, title: string, bpm: number | null, key: string | null): void;
};

export function createEnrichmentCache(db: Database.Database): EnrichmentCache {
  // Prepared statements for performance
  const getMBArtist = db.prepare('SELECT * FROM mb_artist_cache WHERE tidal_artist_name = ?');
  const setMBArtist = db.prepare(`
    INSERT OR REPLACE INTO mb_artist_cache (tidal_artist_name, mbid, genres_json, votes_json, fetched_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const getLFMTrack = db.prepare('SELECT * FROM lastfm_track_cache WHERE tidal_track_id = ?');
  const setLFMTrack = db.prepare(`
    INSERT OR REPLACE INTO lastfm_track_cache (tidal_track_id, artist, title, moods_json, scores_json, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const getLFMArtist = db.prepare('SELECT * FROM lastfm_artist_cache WHERE artist_name = ?');
  const setLFMArtist = db.prepare(`
    INSERT OR REPLACE INTO lastfm_artist_cache (artist_name, tags_json, scores_json, fetched_at)
    VALUES (?, ?, ?, ?)
  `);
  
  const getGSBPM = db.prepare('SELECT * FROM getsongbpm_cache WHERE tidal_track_id = ?');
  const setGSBPM = db.prepare(`
    INSERT OR REPLACE INTO getsongbpm_cache (tidal_track_id, artist, title, bpm, musical_key, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  return {
    getMusicBrainzArtist(artist: string) {
      const row = getMBArtist.get(artist) as any;
      if (!row) return null;
      return {
        mbid: row.mbid,
        genres: JSON.parse(row.genres_json || '[]'),
        votes: JSON.parse(row.votes_json || '[]')
      };
    },
    
    setMusicBrainzArtist(artist: string, mbid: string, genres: string[], votes: number[]) {
      setMBArtist.run(artist, mbid, JSON.stringify(genres), JSON.stringify(votes), new Date().toISOString());
    },
    
    getLastFmTrack(trackId: number) {
      const row = getLFMTrack.get(trackId) as any;
      if (!row) return null;
      return {
        moods: JSON.parse(row.moods_json || '[]'),
        scores: JSON.parse(row.scores_json || '[]')
      };
    },
    
    setLastFmTrack(trackId: number, artist: string, title: string, moods: string[], scores: number[]) {
      setLFMTrack.run(trackId, artist, title, JSON.stringify(moods), JSON.stringify(scores), new Date().toISOString());
    },
    
    getLastFmArtist(artist: string) {
      const row = getLFMArtist.get(artist) as any;
      if (!row) return null;
      return {
        tags: JSON.parse(row.tags_json || '[]'),
        scores: JSON.parse(row.scores_json || '[]')
      };
    },
    
    setLastFmArtist(artist: string, tags: string[], scores: number[]) {
      setLFMArtist.run(artist, JSON.stringify(tags), JSON.stringify(scores), new Date().toISOString());
    },
    
    getGetSongBPM(trackId: number) {
      const row = getGSBPM.get(trackId) as any;
      if (!row) return null;
      return {
        bpm: row.bpm,
        key: row.musical_key
      };
    },
    
    setGetSongBPM(trackId: number, artist: string, title: string, bpm: number | null, key: string | null) {
      setGSBPM.run(trackId, artist, title, bpm, key, new Date().toISOString());
    }
  };
}
```

**Orchestrator:**
```typescript
// src/enrichment/orchestrator.ts
import { Track, EnrichmentMetadata } from '../services/types.js';
import { createMusicBrainzClient } from '../providers/musicbrainz.js';
import { createLastFmClient } from '../providers/lastfm.js';
import { createGetSongBPMClient } from '../providers/getsongbpm.js';
import { EnrichmentCache } from './cache.js';

export type EnrichmentOptions = {
  musicBrainzEnabled?: boolean;
  lastFmEnabled?: boolean;
  getSongBPMEnabled?: boolean;
  lastFmApiKey?: string;
  getSongBPMApiKey?: string;
};

export type EnrichmentOrchestrator = {
  enrichTrack(track: Track): Promise<Track>;
  enrichTracks(tracks: Track[]): Promise<Track[]>;
};

export function createEnrichmentOrchestrator(
  cache: EnrichmentCache,
  options: EnrichmentOptions = {}
): EnrichmentOrchestrator {
  const mbClient = options.musicBrainzEnabled !== false 
    ? createMusicBrainzClient() 
    : null;
  
  const lfmClient = options.lastFmEnabled && options.lastFmApiKey
    ? createLastFmClient({ apiKey: options.lastFmApiKey })
    : null;
  
  const gbpmClient = options.getSongBPMEnabled && options.getSongBPMApiKey
    ? createGetSongBPMClient({ apiKey: options.getSongBPMApiKey })
    : null;

  async function enrichTrack(track: Track): Promise<Track> {
    const enrichment: EnrichmentMetadata = {
      enrichment_sources: [],
      enriched_at: new Date().toISOString()
    };

    // 1. MusicBrainz: Artist genres
    if (mbClient) {
      let mbData = cache.getMusicBrainzArtist(track.artist);
      if (!mbData) {
        try {
          const artistResult = await mbClient.searchArtist(track.artist);
          if (artistResult) {
            const genres = await mbClient.getArtistGenres(artistResult.mbid);
            mbData = { mbid: genres.mbid, genres: genres.genres, votes: genres.votes };
            cache.setMusicBrainzArtist(track.artist, mbData.mbid, mbData.genres, mbData.votes);
          }
        } catch (err) {
          console.error(`MusicBrainz enrichment failed for ${track.artist}:`, err);
        }
      }
      
      if (mbData) {
        enrichment.artist_mbid = mbData.mbid;
        enrichment.artist_genres = mbData.genres;
        enrichment.artist_genre_votes = mbData.votes;
        enrichment.enrichment_sources!.push('musicbrainz');
      }
    }

    // 2. Last.fm: Track moods
    if (lfmClient) {
      let lfmTrack = cache.getLastFmTrack(track.id);
      if (!lfmTrack) {
        try {
          const tags = await lfmClient.getTrackTopTags(track.artist, track.title);
          lfmTrack = { moods: tags.tags, scores: tags.scores };
          cache.setLastFmTrack(track.id, track.artist, track.title, lfmTrack.moods, lfmTrack.scores);
        } catch (err) {
          console.error(`Last.fm track enrichment failed for ${track.artist} - ${track.title}:`, err);
        }
      }
      
      if (lfmTrack && lfmTrack.moods.length > 0) {
        enrichment.track_moods = lfmTrack.moods;
        enrichment.track_mood_scores = lfmTrack.scores;
        if (!enrichment.enrichment_sources!.includes('lastfm')) {
          enrichment.enrichment_sources!.push('lastfm');
        }
      } else {
        // Fallback: Artist tags
        let lfmArtist = cache.getLastFmArtist(track.artist);
        if (!lfmArtist) {
          try {
            const tags = await lfmClient.getArtistTopTags(track.artist);
            lfmArtist = { tags: tags.tags, scores: tags.scores };
            cache.setLastFmArtist(track.artist, lfmArtist.tags, lfmArtist.scores);
          } catch (err) {
            console.error(`Last.fm artist enrichment failed for ${track.artist}:`, err);
          }
        }
        
        if (lfmArtist) {
          enrichment.artist_tags = lfmArtist.tags;
          if (!enrichment.enrichment_sources!.includes('lastfm')) {
            enrichment.enrichment_sources!.push('lastfm');
          }
        }
      }
    }

    // 3. GetSongBPM: Fill BPM/key if Tidal returned null
    if (gbpmClient && (track.audio_features.bpm === null || track.audio_features.key === null)) {
      let gbpmData = cache.getGetSongBPM(track.id);
      if (!gbpmData) {
        try {
          const result = await gbpmClient.searchTrack(track.artist, track.title);
          if (result.bpm !== null || result.key !== null) {
            gbpmData = { bpm: result.bpm!, key: result.key! };
            cache.setGetSongBPM(track.id, track.artist, track.title, result.bpm, result.key);
          }
        } catch (err) {
          console.error(`GetSongBPM enrichment failed for ${track.artist} - ${track.title}:`, err);
        }
      }
      
      if (gbpmData) {
        enrichment.getsongbpm_bpm = gbpmData.bpm;
        enrichment.getsongbpm_key = gbpmData.key;
        enrichment.enrichment_sources!.push('getsongbpm');
      }
    }

    return {
      ...track,
      enrichment: enrichment.enrichment_sources!.length > 0 ? enrichment : undefined
    };
  }

  async function enrichTracks(tracks: Track[]): Promise<Track[]> {
    const enriched: Track[] = [];
    for (const track of tracks) {
      enriched.push(await enrichTrack(track));
    }
    return enriched;
  }

  return {
    enrichTrack,
    enrichTracks
  };
}
```

**Test:**
```typescript
// test-orchestrator.ts
const db = initDatabase('data/curator-test.db');
const cache = createEnrichmentCache(db);
const orchestrator = createEnrichmentOrchestrator(cache, {
  lastFmApiKey: process.env.LASTFM_API_KEY,
  getSongBPMApiKey: process.env.GETSONGBPM_API_KEY
});

const testTrack: Track = {
  id: 251380837,
  title: "Get Lucky",
  artist: "Daft Punk",
  album: "Random Access Memories",
  duration: 367,
  release_year: 2013,
  popularity: 0.95,
  genres: [],
  mood: [],
  audio_features: { bpm: null, key: null }
};

const enriched = await orchestrator.enrichTrack(testTrack);
console.log(JSON.stringify(enriched, null, 2));

// Expected output:
// {
//   ...testTrack,
//   enrichment: {
//     artist_mbid: "056e4f3e-d505-4dad-8ec1-d04f521cbb56",
//     artist_genres: ["electronic", "house", "disco"],
//     artist_genre_votes: [10, 8, 5],
//     track_moods: ["funk", "disco", "groovy"],
//     track_mood_scores: [100, 87, 65],
//     getsongbpm_bpm: 116,
//     getsongbpm_key: "F# minor",
//     enrichment_sources: ["musicbrainz", "lastfm", "getsongbpm"],
//     enriched_at: "2026-02-09T..."
//   }
// }
```

**Success criteria:**
- ✅ Enriches track with all 3 sources
- ✅ Checks cache before fetching (2nd run should be instant)
- ✅ Handles missing data gracefully (doesn't crash if API fails)
- ✅ Rate limiting works (doesn't hit API limits)

**Commit:** `git commit -m "feat: add enrichment orchestrator with caching"`

---

### Step 7: Integrate into `discover` Command
**Goal:** Add `--enrich` flag, wire orchestrator into discovery flow

**Files to modify:**
- `src/commands/discover.ts`
- `src/discovery/runner.ts`

**Changes to discover command:**
```typescript
// src/commands/discover.ts
program
  .command('discover')
  // ... existing flags ...
  .option('--enrich', 'Enrich tracks with genre/mood/BPM metadata')
  .action(async (options) => {
    // ... existing discovery code ...
    
    // After discovery, before filters
    if (options.enrich) {
      const db = getDatabase();  // From db/index.ts
      const cache = createEnrichmentCache(db);
      const orchestrator = createEnrichmentOrchestrator(cache, {
        lastFmApiKey: process.env.LASTFM_API_KEY,
        getSongBPMApiKey: process.env.GETSONGBPM_API_KEY
      });
      
      console.error(`Enriching ${tracks.length} tracks...`);
      tracks = await orchestrator.enrichTracks(tracks);
      console.error(`Enrichment complete.`);
    }
    
    // ... rest of command ...
  });
```

**Test:**
```bash
# Test without enrichment (existing behavior)
node dist/cli.js discover --artists "Daft Punk" --limit 5 --preview

# Test with enrichment
export LASTFM_API_KEY="your_key"
export GETSONGBPM_API_KEY="your_key"
node dist/cli.js discover --artists "Daft Punk" --limit 5 --enrich --format json > enriched.json

# Check output
cat enriched.json | jq '.[0].enrichment'
# Should show enrichment metadata
```

**Success criteria:**
- ✅ `--enrich` flag enriches tracks
- ✅ Without flag, behavior unchanged
- ✅ JSON output includes `enrichment` field
- ✅ Stderr shows progress messages
- ✅ Stdout remains clean (pipe-friendly)

**Commit:** `git commit -m "feat: integrate enrichment into discover command"`

---

### Step 8: Add Genre Filter
**Goal:** Add `--genre-filter` flag that uses MusicBrainz genres

**Files to modify:**
- `src/commands/discover.ts`
- `src/discovery/filters.ts`

**Filter function:**
```typescript
// src/discovery/filters.ts
export function filterByGenre(tracks: Track[], genre: string): Track[] {
  const genreLower = genre.toLowerCase();
  return tracks.filter(track => {
    if (!track.enrichment?.artist_genres) return false;
    return track.enrichment.artist_genres.some(g => 
      g.toLowerCase().includes(genreLower)
    );
  });
}
```

**Command integration:**
```typescript
// src/commands/discover.ts
.option('--genre-filter <genre>', 'Filter by MusicBrainz genre (requires --enrich)')
.action(async (options) => {
  // ... existing code ...
  
  // After enrichment, before output
  if (options.genreFilter) {
    if (!options.enrich) {
      console.error('Error: --genre-filter requires --enrich flag');
      process.exit(1);
    }
    tracks = filterByGenre(tracks, options.genreFilter);
    console.error(`Filtered to ${tracks.length} tracks matching genre "${options.genreFilter}"`);
  }
  
  // ... rest of command ...
});
```

**Test:**
```bash
# Filter by electronic
node dist/cli.js discover --artists "Daft Punk,Justice,Moderat" --limit 20 --enrich --genre-filter electronic --preview

# Filter by rock (should exclude all)
node dist/cli.js discover --artists "Daft Punk" --limit 10 --enrich --genre-filter rock --preview
# Expected: 0 results

# Test without --enrich (should error)
node dist/cli.js discover --artists "Daft Punk" --genre-filter electronic
# Expected: "Error: --genre-filter requires --enrich flag"
```

**Success criteria:**
- ✅ Filters tracks by MusicBrainz genres
- ✅ Case-insensitive matching
- ✅ Partial match (e.g., "house" matches "deep house")
- ✅ Requires --enrich flag (errors if not present)

**Commit:** `git commit -m "feat: add --genre-filter flag using MusicBrainz genres"`

---

### Step 9: Add Mood Filter
**Goal:** Add `--mood` flag that uses Last.fm tags

**Files to modify:**
- `src/commands/discover.ts`
- `src/discovery/filters.ts`

**Filter function:**
```typescript
// src/discovery/filters.ts
export function filterByMood(tracks: Track[], mood: string): Track[] {
  const moodLower = mood.toLowerCase();
  return tracks.filter(track => {
    // Check track moods first
    if (track.enrichment?.track_moods) {
      if (track.enrichment.track_moods.some(m => m.toLowerCase().includes(moodLower))) {
        return true;
      }
    }
    // Fallback to artist tags
    if (track.enrichment?.artist_tags) {
      if (track.enrichment.artist_tags.some(t => t.toLowerCase().includes(moodLower))) {
        return true;
      }
    }
    return false;
  });
}
```

**Command integration:**
```typescript
// src/commands/discover.ts
.option('--mood <mood>', 'Filter by Last.fm mood tag (requires --enrich)')
.action(async (options) => {
  // ... existing code ...
  
  if (options.mood) {
    if (!options.enrich) {
      console.error('Error: --mood requires --enrich flag');
      process.exit(1);
    }
    tracks = filterByMood(tracks, options.mood);
    console.error(`Filtered to ${tracks.length} tracks matching mood "${options.mood}"`);
  }
  
  // ... rest of command ...
});
```

**Test:**
```bash
# Filter by chill
node dist/cli.js discover --genre "ambient" --limit 30 --enrich --mood chill --preview

# Filter by energetic
node dist/cli.js discover --artists "Daft Punk,Justice" --limit 20 --enrich --mood energetic --preview

# Combine genre + mood
node dist/cli.js discover --genre "electronic" --limit 50 --enrich --genre-filter house --mood groovy --preview
```

**Success criteria:**
- ✅ Filters tracks by Last.fm mood tags
- ✅ Checks track moods first, falls back to artist tags
- ✅ Case-insensitive matching
- ✅ Requires --enrich flag

**Commit:** `git commit -m "feat: add --mood filter using Last.fm tags"`

---

### Step 10: Documentation & Examples
**Goal:** Update README.md and ROADMAP.md

**Files to modify:**
- `README.md`
- `ROADMAP.md`

**README additions:**
```markdown
### Enrichment (Phase 1)

Curator can enrich Tidal tracks with external metadata:
- **MusicBrainz:** Artist genres
- **Last.fm:** Track/artist mood tags
- **GetSongBPM:** BPM + key (fills Tidal gaps)

**Setup:**
```bash
# Get API keys (free)
export LASTFM_API_KEY="your_key"  # https://www.last.fm/api/account/create
export GETSONGBPM_API_KEY="your_key"  # https://getsongbpm.com/api
```

**Usage:**
```bash
# Enrich tracks
curator discover --artists "Daft Punk" --limit 10 --enrich --format json

# Filter by real genre (not keyword)
curator discover --genre "electronic" --limit 30 --enrich --genre-filter house --preview

# Filter by mood
curator discover --artists "Khruangbin,Bonobo" --limit 20 --enrich --mood chill --preview

# Combine filters
curator discover --genre "indie" --limit 50 --enrich --genre-filter folk --mood melancholic --preview
```

**Cache:**
Enriched metadata is cached in SQLite (`data/curator.db`). Second run is instant.
```

**ROADMAP.md updates:**
```markdown
### ✅ Completed (Phase 1 — 2026-02-09)

**Enrichment Sources**
- MusicBrainz artist genre lookup
- Last.fm track mood + artist tag lookup
- GetSongBPM BPM + key lookup
- SQLite enrichment cache (avoid redundant API calls)

**Discovery Enhancements**
- `discover --enrich` — opt-in enrichment flag
- `--genre-filter <genre>` — filter by MusicBrainz genre
- `--mood <mood>` — filter by Last.fm mood tags

**Impact:**
- ✅ Solve "no genre data from Tidal" problem
- ✅ Enable mood-based playlist creation
- ✅ Fill BPM gaps for better arrangement
- ✅ 80% of use cases covered with free APIs
```

**Commit:** `git commit -m "docs: add enrichment documentation and examples"`

---

## Testing Strategy

### Unit Tests
**Files to create:**
- `tests/providers/musicbrainz.test.ts` (extend existing)
- `tests/providers/lastfm.test.ts` (new)
- `tests/providers/getsongbpm.test.ts` (new)
- `tests/enrichment/cache.test.ts` (new)
- `tests/enrichment/orchestrator.test.ts` (new)

**Mock external APIs** to avoid rate limiting in tests.

### Integration Tests
**Manual test scenarios:**
```bash
# Scenario 1: Electronic discovery with genre filter
curator discover --genre "techno" --limit 30 --enrich --genre-filter "minimal techno" --preview
# Expected: Narrow results to minimal techno subgenre

# Scenario 2: Mood-based ambient playlist
curator discover --genre "ambient" --limit 40 --enrich --mood "atmospheric" --format ids | \
  curator playlist create --name "Atmospheric Ambient"
# Expected: Creates playlist of atmospheric ambient tracks

# Scenario 3: Chill indie-folk
curator discover --artists "Bon Iver,Fleet Foxes,Iron & Wine" --limit 20 --enrich --mood chill --preview
# Expected: Returns chill tracks from those artists

# Scenario 4: Cache hit (2nd run instant)
time curator discover --artists "Daft Punk" --limit 10 --enrich --preview
# 1st run: ~15 seconds (API calls)
# 2nd run: <1 second (cache hits)
```

### Success Metrics
- ✅ **Coverage:** 50%+ BPM gaps filled by GetSongBPM
- ✅ **Accuracy:** Genre filter returns expected artists (electronic → Daft Punk ✅, Beatles ❌)
- ✅ **Performance:** Cache reduces enrichment time by 90%+
- ✅ **Reliability:** Handles API failures gracefully (doesn't crash, logs error)

---

## Rollout Plan

### Step-by-Step Commits
1. ✅ Create branch
2. ✅ Extend Track type
3. ✅ Add enrichment cache schema
4. ✅ Add MusicBrainz genre lookup
5. ✅ Add Last.fm provider
6. ✅ Add GetSongBPM provider
7. ✅ Add enrichment orchestrator
8. ✅ Integrate into discover command
9. ✅ Add genre filter
10. ✅ Add mood filter
11. ✅ Documentation

### Merge Criteria
Before merging to `main`:
- ✅ All existing tests pass
- ✅ New tests added for providers + orchestrator
- ✅ Manual integration tests successful (3+ scenarios)
- ✅ Documentation complete (README + ROADMAP)
- ✅ No breaking changes (backward compatible)

**Merge command:**
```bash
git checkout main
git merge feature/audio-enrichment
git push origin main
git tag v1.1.0 -m "Phase 1: Metadata enrichment"
git push --tags
```

---

## Environment Setup

**Required API keys:**
```bash
# .env (or export in shell)
LASTFM_API_KEY=your_lastfm_key
GETSONGBPM_API_KEY=your_getsongbpm_key
```

**Get keys:**
1. **Last.fm:** https://www.last.fm/api/account/create (instant, free)
2. **GetSongBPM:** https://getsongbpm.com/api (email signup, free tier)

**No key needed:** MusicBrainz (open API, just needs User-Agent)

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| API rate limits | Cache all responses in SQLite, respect rate limits (1100ms MB, 200ms Last.fm) |
| API downtime | Graceful degradation — log error, continue with partial enrichment |
| Bad matches | Fuzzy matching on artist names, fallback to artist tags if track fails |
| Performance | Enrich in batches, show progress, opt-in flag (not default) |
| Breaking changes | New `enrichment` field is optional, existing code unaffected |

---

## Next Steps After Phase 1

**Phase 2 (optional):**
- Add Discogs for electronic subgenres
- Improve mood vocabulary (curated list of useful tags)
- Mood-aware arrangement (`arrange --mood-arc gentle → epic`)

**Phase 3 (if budget):**
- Cyanite.ai integration (requires audio handling)
- Advanced character/movement filters

---

## Timeline Estimate

| Step | Estimated Time | Cumulative |
|------|----------------|------------|
| 0. Setup branch | 5 min | 5 min |
| 1. Extend Track type | 15 min | 20 min |
| 2. Cache schema | 30 min | 50 min |
| 3. MusicBrainz genres | 1 hour | 1h 50m |
| 4. Last.fm provider | 1.5 hours | 3h 20m |
| 5. GetSongBPM provider | 1 hour | 4h 20m |
| 6. Orchestrator | 2 hours | 6h 20m |
| 7. Integrate into discover | 30 min | 6h 50m |
| 8. Genre filter | 30 min | 7h 20m |
| 9. Mood filter | 30 min | 7h 50m |
| 10. Documentation | 1 hour | 8h 50m |
| **Testing & debugging** | 2 hours | **~11 hours total** |

**Realistic estimate:** 1.5-2 days of focused work, testing each step.

---

**Ready to start? Begin with Step 0 when you're ready!** 🚀
