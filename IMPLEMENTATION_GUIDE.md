# Implementation Guide

**Last Updated:** February 6, 2026, 12:00 PM  
**Status:** Phase 3 Ready for Implementation  
**Next:** Phase 3A - Artist Discovery

---

## ✅ Phase 1 & 2: COMPLETE

**Completed Features:**
- ✅ Audio features sync from Tidal (BPM, Key, Key Scale, Peak)
- ✅ Database storage (50 tracks, 47 with BPM, 44 with Key)
- ✅ Smart `gentle_rise` energy arc implementation
- ✅ BPM-based grouping (low/mid/high buckets)
- ✅ Tempo smoothing (max 15 BPM transitions)
- ✅ Dynamic playlist sizing
- ✅ Full pipeline working: sync → search → filter → arrange → export
- ✅ Tidal playlist creation tested successfully

**See Complete Documentation:**
- [PHASE1_COMPLETE.md](./PHASE1_COMPLETE.md) - Full Phase 1 report
- [COVERAGE_REPORT.md](./COVERAGE_REPORT.md) - Data coverage analysis

---

## 🚧 Phase 3: Discovery (Revised Priority)

Based on the Ed Banger case study (see [LESSONS.md](./LESSONS.md)), we've revised the Phase 3 priorities:

| Phase | Feature | Priority | Time | Status |
|-------|---------|----------|------|--------|
| **3A** | Artist Discovery | HIGHEST | 4-5h | Ready |
| **3B** | Label Discovery (MusicBrainz) | HIGH | 3-4h | Ready |
| **3C** | Diversity Constraints | HIGH | 2-3h | Ready |
| 3D | Genre/Playlist Discovery | MEDIUM | 3-4h | Existing |

**Full Specification:** [PHASE3_SPEC.md](./PHASE3_SPEC.md)

---

## Phase 3A: Artist Discovery (START HERE)

### Goal

```bash
curator discover --artists "Justice,SebastiAn,Breakbot" --limit-per-artist 5
```

### Why This First?

The Ed Banger case study revealed:
- Genre/tag discovery fails for label-based requests
- Artist discovery is simpler to implement
- Unblocks label discovery (Phase 3B depends on this)
- High-value use cases: artist deep-dives, compilations

### Step 1: Extend Direct Helper (2 hours)

Curator stays self-contained. Extend the direct helper to support artist discovery.

**File:** `~/clawd/projects/curator/scripts/tidal_direct.py`

Add flags + handlers:
```python
--search-artists "Justice"     # returns artist list
--artist-top-tracks 57425      # returns top tracks for artist
```

**File:** `~/clawd/projects/curator/src/services/tidalDirect.ts`

Add wrapper functions:
```typescript
searchArtistsDirect(...)
fetchArtistTopTracksDirect(...)
```

**Test:**
```bash
python scripts/tidal_direct.py --session-path ~/clawd/projects/tidal-service/tidal_session.json \
  --search-artists "Justice"
```

### Step 2: Add to Curator (2-3 hours)

**File:** `~/clawd/projects/curator/src/commands/discover.ts`

Add option:
```typescript
.option('--artists <names>', 'Comma-separated artist names')
.option('--limit-per-artist <n>', 'Max tracks per artist', '5')
```

Add handler:
```typescript
if (options.artists) {
  const artistNames = options.artists.split(',').map(s => s.trim());
  const limitPerArtist = parseInt(options.limitPerArtist) || 5;
  
  console.log(`Discovering tracks from ${artistNames.length} artists...`);
  
  const tracks = await discoverByArtists(artistNames, limitPerArtist);
  
  if (tracks.length === 0) {
    console.error('No tracks found');
    process.exit(1);
  }
  
  return formatOutput(tracks, options.format);
}
```

Add discovery function:
```typescript
async function discoverByArtists(
  names: string[],
  limitPerArtist: number
): Promise<Track[]> {
  const allTracks: Track[] = [];
  
  for (const name of names) {
    console.log(`  Searching for artist: ${name}`);
    
    // Search for artist
    const data = await searchArtistsDirect(name, 1);
    
    if (!data.artists || data.artists.length === 0) {
      console.warn(`  ⚠ Artist not found: ${name}`);
      continue;
    }
    
    const artist = data.artists[0];
    console.log(`  ✓ Found: ${artist.name} (ID: ${artist.id})`);
    
    // Get top tracks
    const tracksData = await fetchArtistTopTracksDirect(artist.id, limitPerArtist);
    allTracks.push(...tracksData);
  }
  
  console.log(`\nFound ${allTracks.length} total tracks`);
  
  // Fetch audio features (reuse existing logic)
  return await enrichWithAudioFeatures(allTracks);
}
```

**Test:**
```bash
curator discover --artists "Justice" --limit-per-artist 5 --format json
curator discover --artists "Justice,Daft Punk,Moderat" --limit-per-artist 3
```

---

## Phase 3B: Label Discovery via MusicBrainz (3-4 hours)

### Goal

```bash
curator discover --label "ed banger" --limit-per-artist 3
```

### Implementation

**Step 1: Create MusicBrainz Provider**

**File:** `~/clawd/projects/curator/src/providers/musicbrainz.ts`

```typescript
const MB_BASE_URL = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Curator/1.0 (curator@example.com)';
const RATE_LIMIT_MS = 1100; // 1 request per second + buffer

let lastRequestTime = 0;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mbFetch(path: string): Promise<any> {
  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastRequestTime = Date.now();
  
  const url = `${MB_BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT }
  });
  
  if (!response.ok) {
    throw new Error(`MusicBrainz API error: ${response.status}`);
  }
  
  return response.json();
}

export interface Label {
  mbid: string;
  name: string;
  country?: string;
  founded?: string;
}

export async function searchLabel(name: string): Promise<Label | null> {
  const data = await mbFetch(
    `/label?query=${encodeURIComponent(name)}&fmt=json&limit=1`
  );
  
  const labels = data.labels || [];
  if (labels.length === 0) return null;
  
  const label = labels[0];
  return {
    mbid: label.id,
    name: label.name,
    country: label.country,
    founded: label['life-span']?.begin
  };
}

export async function getLabelArtists(labelMbid: string): Promise<string[]> {
  const data = await mbFetch(
    `/label/${labelMbid}?fmt=json&inc=artist-rels`
  );
  
  const artists: string[] = [];
  for (const rel of data.relations || []) {
    if (rel.type === 'recording contract' && rel.artist) {
      artists.push(rel.artist.name);
    }
  }
  
  return artists;
}
```

**Step 2: Add to Curator Discover**

Add option:
```typescript
.option('--label <name>', 'Record label name (uses MusicBrainz)')
```

Add handler:
```typescript
if (options.label) {
  console.log(`Searching for label: ${options.label}...`);
  
  // Step 1: Search MusicBrainz for label
  const label = await musicbrainz.searchLabel(options.label);
  if (!label) {
    console.error(`Label not found: ${options.label}`);
    process.exit(1);
  }
  
  console.log(`✓ Found: ${label.name} (${label.country}, ${label.founded})`);
  
  // Step 2: Get signed artists
  console.log('Fetching signed artists...');
  const artistNames = await musicbrainz.getLabelArtists(label.mbid);
  console.log(`✓ Found ${artistNames.length} artists`);
  
  // Step 3: Discover tracks from each artist (reuse Phase 3A logic)
  const limitPerArtist = parseInt(options.limitPerArtist) || 3;
  const tracks = await discoverByArtists(artistNames, limitPerArtist);
  
  return formatOutput(tracks, options.format);
}
```

**Test:**
```bash
curator discover --label "ed banger" --limit-per-artist 2
curator discover --label "ninja tune" --limit-per-artist 3 --format json
```

---

## Phase 3C: Diversity Constraints (2-3 hours)

### Goal

```bash
curator arrange --arc gentle_rise --max-per-artist 1
```

### Implementation

**File:** `~/clawd/projects/curator/src/commands/arrange.ts`

Add options:
```typescript
.option('--max-per-artist <n>', 'Maximum tracks per artist')
.option('--max-per-album <n>', 'Maximum tracks per album')
```

Add diversity enforcement:
```typescript
function enforceDiversity(tracks: Track[], options: ArrangeOptions): Track[] {
  let filtered = tracks;
  
  if (options.maxPerArtist) {
    const max = parseInt(options.maxPerArtist);
    filtered = enforceArtistLimit(filtered, max);
    console.log(`Applied --max-per-artist ${max}: ${filtered.length} tracks remain`);
  }
  
  if (options.maxPerAlbum) {
    const max = parseInt(options.maxPerAlbum);
    filtered = enforceAlbumLimit(filtered, max);
    console.log(`Applied --max-per-album ${max}: ${filtered.length} tracks remain`);
  }
  
  return filtered;
}

function enforceArtistLimit(tracks: Track[], max: number): Track[] {
  const artistCounts = new Map<string, number>();
  const result: Track[] = [];
  
  for (const track of tracks) {
    const artistKey = track.artist_name.toLowerCase();
    const count = artistCounts.get(artistKey) || 0;
    
    if (count < max) {
      result.push(track);
      artistCounts.set(artistKey, count + 1);
    }
  }
  
  return result;
}

function enforceAlbumLimit(tracks: Track[], max: number): Track[] {
  const albumCounts = new Map<string, number>();
  const result: Track[] = [];
  
  for (const track of tracks) {
    const albumKey = `${track.artist_name}:${track.album_name}`.toLowerCase();
    const count = albumCounts.get(albumKey) || 0;
    
    if (count < max) {
      result.push(track);
      albumCounts.set(albumKey, count + 1);
    }
  }
  
  return result;
}
```

In the main arrange function, call diversity before BPM sorting:
```typescript
export async function arrange(tracks: Track[], options: ArrangeOptions): Promise<Track[]> {
  // Step 1: Apply diversity constraints
  let filtered = enforceDiversity(tracks, options);
  
  // Step 2: Apply energy arc (BPM-based sorting)
  return arrangeByArc(filtered, options.arc);
}
```

**Test:**
```bash
# Without constraint
curator discover --artists "Justice" --limit 10 | curator arrange --arc gentle_rise | wc -l

# With constraint
curator discover --artists "Justice,Daft Punk" --limit-per-artist 5 | \
  curator arrange --arc gentle_rise --max-per-artist 1 | wc -l
# Should output exactly 2 tracks
```

---

## Full Integration Test

The ultimate test is the Ed Banger workflow:

```bash
# This should work in ~30 seconds and produce a great playlist
curator discover --label "ed banger" --limit-per-artist 3 | \
  curator arrange --arc gentle_rise --max-per-artist 1 | \
  curator export --format tidal | \
  xargs tidal play-fresh
```

Expected:
- 9+ tracks (one per Ed Banger artist)
- BPM sorted (slow → fast → slow)
- Plays immediately via Tidal

---

## Troubleshooting

### Session / Python path issues
```bash
export CURATOR_TIDAL_SESSION_PATH=~/clawd/projects/tidal-service/tidal_session.json
export CURATOR_TIDAL_PYTHON_PATH=~/clawd/projects/tidal-service/.venv/bin/python
```

### MusicBrainz rate limiting
- 1 request per second max
- The provider handles this automatically
- If you see 503 errors, wait a minute

### Missing artists in MusicBrainz
- Not all label-artist relationships are in MusicBrainz
- Can fall back to release browsing (more requests but more complete)
- See PHASE3_SPEC.md for alternative approach

---

## Success Criteria

### Phase 3A
- ✅ Direct helper can search artists + fetch top tracks
- ✅ `curator discover --artists` returns tracks with BPM/Key
- ✅ Pipes correctly to arrange and export

### Phase 3B
- ✅ MusicBrainz provider finds labels and artists
- ✅ `curator discover --label` chains into artist discovery
- ✅ Ed Banger workflow produces correct results

### Phase 3C
- ✅ `--max-per-artist 1` limits to one track per artist
- ✅ Applied before BPM sorting
- ✅ Maintains arc shape

---

**Good luck! 🎵**

The data is there, the patterns are clear, now connect the pipes!
