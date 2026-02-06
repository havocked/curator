# Phase 3: Discovery Command - Specification

**Status:** Not Started  
**Priority:** High  
**Estimated Time:** 6-8 hours  
**Prerequisite:** Phase 1 & 2 Complete ✅

---

## Problem Statement

**Current limitation:** Curator can only work with your synced favorites (~50 tracks).

**Phase 3 goal:** Discover NEW tracks from Tidal's catalog based on search criteria, enabling unlimited playlist possibilities.

---

## The Vision: Boat Party Scenario

### User Request (via WhatsApp):
> "hey i'm on a boat with my friends, I need good hip hop bangers with big boom bap style followed with more electro style but still hip hop"

### What Needs to Happen:

```bash
# 1. Discover boom bap tracks (not in favorites)
curator discover \
  --genre "hip-hop" \
  --tags "boom-bap,90s-hip-hop,east-coast" \
  --energy high \
  --limit 50

# 2. Discover electro hip hop tracks
curator discover \
  --genre "hip-hop" \
  --tags "electro,trap,electronic-hip-hop" \
  --energy high \
  --limit 50

# 3. Filter, arrange, export
... | curator filter --energy 0.75-1.0 | \
    curator arrange --structure boom:12,electro:12 | \
    curator export --format tidal
```

**Result:** Curated playlist with tracks you've never synced, based on criteria.

---

## Command Specification

### Basic Usage

```bash
curator discover [options]
```

### Options

```bash
--genre <genre>              # Music genre (hip-hop, indie-folk, electronic)
--tags <tags>                # Comma-separated style tags (boom-bap,trap)
--year <range>               # Release year range (2020-2026)
--energy <level>             # Energy level (low|medium|high or 0.0-1.0)
--bpm <range>                # BPM range (85-110)
--min-popularity <number>    # Minimum popularity/listeners
--source <source>            # Discovery source (search|playlist|similar)
--limit <number>             # Max tracks to return (default: 50)
--format <format>            # Output format (json|text|ids)

# Advanced (Phase 3B+)
--similar-to <artist-id>     # Find tracks similar to artist
--exclude-known              # Exclude already synced tracks
--discovery-ratio <0-1>      # Proportion of unknown tracks
```

### Output Format

**JSON (default):**
```json
{
  "count": 50,
  "source": "tidal-playlists",
  "query": {
    "genre": "hip-hop",
    "tags": ["boom-bap"],
    "limit": 50
  },
  "tracks": [
    {
      "id": 12345,
      "title": "Shook Ones Pt. II",
      "artist": "Mobb Deep",
      "album": "The Infamous",
      "duration": 284,
      "audio_features": {
        "bpm": 92,
        "key": "F# minor"
      }
    },
    ...
  ]
}
```

---

## Discovery Sources

### Source 1: Tidal Playlists (MVP - Start Here)

**Strategy:** Query Tidal's curated playlists by genre/mood

**Playlists to target:**
- Genre-specific: "Boom Bap Essentials", "Indie Folk Rising"
- Mood-based: "Focus Flow", "Party Starters"
- Era-based: "90s Hip Hop", "New School"

**Implementation:**
```typescript
async function discoverFromPlaylists(query: DiscoverQuery): Promise<Track[]> {
  // 1. Find playlists matching criteria
  const playlists = await findMatchingPlaylists(query.genre, query.tags);
  
  // 2. Fetch tracks from those playlists
  const tracks: Track[] = [];
  for (const playlist of playlists) {
    const playlistTracks = await getPlaylistTracks(playlist.id);
    tracks.push(...playlistTracks);
  }
  
  // 3. Filter by additional criteria (year, BPM, etc.)
  const filtered = filterByCriteria(tracks, query);
  
  // 4. Fetch audio features for new tracks
  const enriched = await enrichWithAudioFeatures(filtered);
  
  // 5. Store in database (cache for future)
  await storeDiscoveredTracks(enriched);
  
  return enriched.slice(0, query.limit);
}
```

**Tidal API Endpoints:**
```typescript
// List user playlists (already working in tidal-service)
GET /playlists

// Search playlists by keyword
GET /search?q=boom+bap&type=playlist

// Get playlist tracks
GET /playlist/{id}
```

---

### Source 2: Tidal Search (Phase 3A)

**Strategy:** Direct search by keywords

**Implementation:**
```typescript
async function discoverFromSearch(query: DiscoverQuery): Promise<Track[]> {
  const searchQuery = buildSearchQuery(query);
  
  // Tidal search endpoint (already in tidal-service)
  const results = await tidalSearch(searchQuery, 'track', query.limit * 2);
  
  const filtered = filterByCriteria(results, query);
  const enriched = await enrichWithAudioFeatures(filtered);
  
  await storeDiscoveredTracks(enriched);
  
  return enriched.slice(0, query.limit);
}
```

---

### Source 3: Similar Artists (Phase 3B - Future)

**Strategy:** Seed from your favorites, discover similar

**Implementation:**
```typescript
async function discoverSimilar(artistId: string): Promise<Track[]> {
  // Tidal may have similar artists endpoint
  const similar = await getSimilarArtists(artistId);
  
  const tracks: Track[] = [];
  for (const artist of similar) {
    const topTracks = await getArtistTopTracks(artist.id);
    tracks.push(...topTracks);
  }
  
  return tracks;
}
```

---

## Database Schema Updates

### New Table: `track_metadata_extended`

```sql
CREATE TABLE IF NOT EXISTS track_metadata_extended (
    track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
    release_year INTEGER,
    genres TEXT,              -- JSON: ["hip-hop", "boom-bap"]
    tags TEXT,                -- JSON: ["90s", "east-coast"]
    popularity INTEGER,       -- 0-100 (if available)
    artist_followers INTEGER, -- Listener count proxy
    discovered_via TEXT,      -- "playlist:boom-bap-essentials", "search:hip-hop"
    discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### New Table: `discovery_cache`

```sql
CREATE TABLE IF NOT EXISTS discovery_cache (
    id INTEGER PRIMARY KEY,
    query_hash TEXT UNIQUE,   -- MD5 of query parameters
    source TEXT,              -- "playlist", "search", "similar"
    track_ids TEXT,           -- JSON array of track IDs
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME       -- Cache expiry (24-48h)
);
```

**Why cache?**
- Same query again = instant response
- Tidal API rate limiting
- Consistent results for same criteria

---

## Implementation Plan

### Step 1: Discover from Playlist ID (Minimal MVP - 2 hours)

**Goal:** Can specify a Tidal playlist ID, get tracks with audio features

```bash
curator discover --playlist 2b2653e2-... --limit 30
```

**What to build:**
1. Add `--playlist <id>` option to CLI
2. Call tidal-service `/playlist/{id}` endpoint
3. Extract track list
4. Fetch audio features for each track (reuse Phase 1 logic)
5. Store in database
6. Output JSON

**Testing:**
```bash
# Find a Tidal playlist ID (e.g., "Boom Bap Essentials")
curator discover --playlist <id> --limit 20 | \
  curator arrange --arc gentle_rise | \
  curator export --format tidal
```

**Deliverable:** Can discover tracks from ANY Tidal playlist

---

### Step 2: Discover from Genre/Tags (3-4 hours)

**Goal:** Find playlists matching criteria, aggregate tracks

```bash
curator discover --genre hip-hop --tags boom-bap --limit 50
```

**What to build:**
1. Playlist mapping: genre/tags → Tidal playlist IDs
2. Option A: Hardcode known playlists in config
3. Option B: Search Tidal playlists by keyword
4. Aggregate tracks from multiple playlists
5. Deduplicate
6. Fetch audio features
7. Output JSON

**Playlist Mapping (Option A - Quick):**
```json
{
  "genres": {
    "hip-hop": {
      "boom-bap": ["playlist-id-1", "playlist-id-2"],
      "electro": ["playlist-id-3", "playlist-id-4"]
    },
    "indie-folk": {
      "acoustic": ["playlist-id-5"],
      "rising": ["playlist-id-6"]
    }
  }
}
```

**Playlist Search (Option B - Better):**
```typescript
// Search Tidal for playlists
const playlists = await tidalSearch("boom bap", "playlist", 10);
// Filter by relevance
// Aggregate tracks
```

**Recommendation:** Start with Option A (hardcoded), migrate to Option B later.

---

### Step 3: Enhanced Filtering (1-2 hours)

**Goal:** Filter discovered tracks by additional criteria

```bash
curator discover --genre hip-hop | \
  curator filter --bpm 85-110 --energy 0.7-1.0 --year 2020-2026
```

**What to build:**
1. Add `--bpm <range>` to filter command
2. Add `--energy <range>` to filter command
3. Add `--year <range>` to filter command
4. Query database for audio features
5. Filter tracks matching criteria

**Note:** Most logic already exists from Phase 2, just expose via CLI options.

---

### Step 4: Smart Caching (1 hour)

**Goal:** Same query = instant response

```typescript
async function discoverWithCache(query: DiscoverQuery): Promise<Track[]> {
  // 1. Hash query parameters
  const hash = hashQuery(query);
  
  // 2. Check cache
  const cached = await getCachedDiscovery(hash);
  if (cached && !isExpired(cached)) {
    console.log("Using cached results");
    return cached.tracks;
  }
  
  // 3. Cache miss: perform discovery
  const tracks = await discover(query);
  
  // 4. Store in cache (expire in 24h)
  await cacheDiscovery(hash, tracks, 24 * 60 * 60 * 1000);
  
  return tracks;
}
```

---

## Testing Strategy

### Test 1: Single Playlist Discovery

```bash
curator discover --playlist <boom-bap-playlist-id> --limit 20
# Should return 20 boom bap tracks with audio features
# Verify: Check database for new tracks
```

### Test 2: Genre-Based Discovery

```bash
curator discover --genre hip-hop --tags boom-bap --limit 50
# Should return 50 boom bap tracks from multiple playlists
# Verify: No duplicates, all have audio features
```

### Test 3: Full Pipeline (Boat Party)

```bash
# Boom bap section
curator discover --genre hip-hop --tags boom-bap --limit 50 | \
  curator filter --energy 0.75-1.0 --limit 12 > boom.json

# Electro section
curator discover --genre hip-hop --tags electro --limit 50 | \
  curator filter --energy 0.8-1.0 --limit 12 > electro.json

# Combine and arrange
cat boom.json electro.json | \
  curator arrange --arc custom --structure boom:12,electro:12 | \
  curator export --format tidal
# Should create playlist matching boat party request
```

### Test 4: Cache Hit

```bash
# Run same query twice
curator discover --genre hip-hop --tags boom-bap --limit 20
# Second run should be instant (< 1 second)
```

---

## Integration with Existing Code

### Files to Create:
```
src/commands/discover.ts          # New command
src/services/tidalDiscover.ts     # Discovery logic
src/lib/playlistMap.ts            # Genre → Playlist mapping (config)
```

### Files to Modify:
```
src/cli.ts                        # Register discover command
src/db/schema.ts                  # Add new tables
src/db/index.ts                   # Add cache queries
src/commands/filter.ts            # Add BPM/energy/year filters
```

### Reuse from Phase 1:
```typescript
// Audio features fetching (already working!)
import { fetchAudioFeatures } from './services/tidalDirect';

// Just call it for new tracks
for (const track of discoveredTracks) {
  const features = await fetchAudioFeatures(track.id);
  await storeAudioFeatures(db, track.id, features);
}
```

---

## Success Criteria

### Minimal Success (Step 1):
- ✅ Can discover tracks from a Tidal playlist ID
- ✅ Tracks have audio features (BPM, Key)
- ✅ Stored in database
- ✅ Output as JSON for piping

### Full Success (Step 2-4):
- ✅ Can discover by genre/tags
- ✅ Finds tracks from multiple playlists
- ✅ Deduplicates and filters
- ✅ Cache working (instant second query)
- ✅ Can create "boat party" playlist from natural language request

### Real-World Test:
```
"Build me a 60-minute indie-folk playlist from 2024-2026, 
rising energy, under 100k listeners per artist"

→ Should work end-to-end with discover + filter + arrange
```

---

## Known Limitations & Future Work

### Phase 3 Limitations:
- Genre/tag mapping requires manual curation (hardcoded playlists)
- No "popularity" filtering yet (need artist follower data)
- No "similar artists" discovery (needs Tidal API support)

### Phase 4 Ideas (Later):
- Smart playlist recommendation (learn from usage)
- ListenBrainz integration (open collaborative filtering)
- Spotify cross-reference (match via ISRC, get additional metadata)
- Machine learning taste model

---

## Time Estimates

| Step | Task | Time |
|------|------|------|
| 1 | Discover from playlist ID | 2h |
| 2 | Genre/tag discovery | 3-4h |
| 3 | Enhanced filtering | 1-2h |
| 4 | Smart caching | 1h |
| **Total** | **Phase 3 MVP** | **7-9h** |

---

## Next Agent: Start Here

### Quick Start Checklist:

1. **Read this spec** ✅
2. **Verify Phase 1 & 2 working:**
   ```bash
   curator sync --source tidal --only favorites
   curator search --favorited --limit 5 --format json
   curator arrange --arc gentle_rise
   ```
3. **Implement Step 1** (playlist ID discovery - 2h)
4. **Test:** Create playlist from Tidal curated list
5. **Implement Step 2** (genre-based - 3-4h)
6. **Test:** Boat party scenario
7. **Polish:** Caching, error handling
8. **Document:** Update README with discover command

### Questions to Ask:

- **Tidal API:** What playlist endpoints does tidal-service expose?
- **Genre mapping:** Should we hardcode playlists or search Tidal?
- **Cache duration:** 24h? 48h? Configurable?
- **Error handling:** What if playlist is empty or API fails?

---

## Success Looks Like:

```bash
# User (via WhatsApp):
"Build me a boom bap hip hop playlist"

# Ori (behind the scenes):
curator discover --genre hip-hop --tags boom-bap --limit 30 | \
  curator filter --energy 0.75-1.0 | \
  curator arrange --arc gentle_rise | \
  curator export --format tidal

# Result:
✅ "Boom Bap Bangers - Curated by Ori" 
   20 tracks, 92-110 BPM, intelligent energy arc
   [Tidal link]
```

**The vision is within reach!** 🚀

---

**Status:** Ready for implementation  
**Blockers:** None (Phase 1 & 2 complete)  
**Estimated completion:** 7-9 hours focused work
