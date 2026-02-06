# Phase 3: Discovery - Revised Specification

**Last Updated:** February 6, 2026  
**Status:** Ready for Implementation  
**Prerequisite:** Phase 1 & 2 Complete ✅

---

## Priority Order (Revised)

Based on real-world testing (see [LESSONS.md](./LESSONS.md)):

| Phase | Feature | Priority | Time Est. |
|-------|---------|----------|-----------|
| **3A** | Artist Discovery | HIGHEST | 4-5 hours |
| **3B** | Label Discovery (MusicBrainz) | HIGH | 3-4 hours |
| **3C** | Diversity Constraints | HIGH | 2-3 hours |
| 3D | Genre/Playlist Discovery | MEDIUM | 3-4 hours |

**Why this order?**
- Ed Banger case study proved artist discovery more urgent than genre discovery
- Labels = collections of artists, need artist-level access first
- Diversity constraints essential for showcase playlists

---

## Phase 3A: Artist Discovery

### Command Specification

```bash
curator discover --artists "Justice,SebastiAn,Breakbot" --limit-per-artist 5
```

### Options

```bash
--artists <names>           # Comma-separated artist names (required for this mode)
--limit-per-artist <n>      # Max tracks per artist (default: 5)
--limit <n>                 # Total max tracks (optional)
--format <format>           # json|text|ids (default: json)
```

### Implementation

**Step 1: Add to tidal-service (2 hours)**

Add to `tidal_controller.py`:
```python
def search_artists(self, query: str, limit: int = 10) -> list[Dict[str, Any]]:
    """Search for artists by name."""
    results = self.session.search(query, models=[tidalapi.Artist], limit=limit)
    artists = []
    for artist in results.get('artists', []):
        artists.append({
            "id": artist.id,
            "name": artist.name,
            "picture": self._safe_get_image(artist, 320)
        })
    return artists

def get_artist_top_tracks(self, artist_id: int, limit: int = 10) -> list[Dict[str, Any]]:
    """Get artist's top tracks with audio features."""
    artist = self.session.artist(artist_id)
    tracks = artist.get_top_tracks(limit=limit)
    return [self.get_track_info(t) for t in tracks]
```

Add routes to `routes/library.py`:
```python
@router.get("/artists/search")
async def search_artists(q: str, limit: int = 10):
    """Search for artists by name."""
    artists = ctx.tidal.search_artists(q, limit=limit)
    return {"query": q, "count": len(artists), "artists": artists}

@router.get("/artist/{artist_id}/top-tracks")
async def get_artist_top_tracks(artist_id: int, limit: int = 10):
    """Get artist's top tracks."""
    tracks = ctx.tidal.get_artist_top_tracks(artist_id, limit=limit)
    return {"artist_id": artist_id, "count": len(tracks), "tracks": tracks}
```

**Step 2: Add to curator (2-3 hours)**

Add `--artists` option to `src/commands/discover.ts`:
```typescript
.option('--artists <names>', 'Comma-separated artist names')
.option('--limit-per-artist <n>', 'Max tracks per artist', '5')

// In handler:
if (options.artists) {
  const artistNames = options.artists.split(',').map(s => s.trim());
  const tracks = await discoverByArtists(artistNames, parseInt(options.limitPerArtist));
  return formatOutput(tracks, options.format);
}
```

Implement discovery logic:
```typescript
async function discoverByArtists(
  names: string[],
  limitPerArtist: number
): Promise<Track[]> {
  const allTracks: Track[] = [];
  
  for (const name of names) {
    // Search for artist
    const artistResults = await tidalService.searchArtists(name, 1);
    if (artistResults.artists.length === 0) {
      console.warn(`Artist not found: ${name}`);
      continue;
    }
    
    const artist = artistResults.artists[0];
    
    // Get top tracks
    const tracksResult = await tidalService.getArtistTopTracks(artist.id, limitPerArtist);
    allTracks.push(...tracksResult.tracks);
  }
  
  // Fetch audio features for all tracks
  return await enrichWithAudioFeatures(allTracks);
}
```

### Testing

```bash
# Single artist
curator discover --artists "Justice" --limit 5
# Should return 5 Justice tracks with BPM/Key

# Multiple artists
curator discover --artists "Justice,Daft Punk,Moderat" --limit-per-artist 3
# Should return 9 tracks (3 per artist)

# Full pipeline
curator discover --artists "Justice,SebastiAn,Breakbot" --limit-per-artist 3 | \
  curator arrange --arc gentle_rise | \
  curator export --format tidal
# Should output BPM-sorted track IDs
```

---

## Phase 3B: Label Discovery (MusicBrainz)

### Command Specification

```bash
curator discover --label "ed banger" --limit 30
```

### Options

```bash
--label <name>              # Label name (required for this mode)
--limit-per-artist <n>      # Max tracks per artist (default: 3)
--limit <n>                 # Total max tracks (optional)
--format <format>           # json|text|ids (default: json)
```

### The ISRC Bridge

**Why MusicBrainz + Tidal:**
- MusicBrainz has label → artist relationships (Tidal doesn't)
- Tidal has audio features (BPM, Key) (MusicBrainz doesn't)
- ISRC links them: same identifier on both platforms

**Flow:**
```
┌────────────────┐     ┌─────────────────┐     ┌────────────────┐
│  MusicBrainz   │     │      ISRC       │     │     Tidal      │
│                │     │    (Bridge)     │     │                │
│  Label: MBID   │────▶│  FR0NT0700420   │────▶│  Track ID      │
│  Artists: list │     │  (universal)    │     │  BPM: 113      │
│                │     │                 │     │  Key: A Major  │
└────────────────┘     └─────────────────┘     └────────────────┘
```

### Implementation

**Step 1: Add MusicBrainz provider (2 hours)**

Create `src/providers/musicbrainz.ts`:
```typescript
const MB_BASE_URL = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Curator/1.0 (curator@example.com)';
const RATE_LIMIT_MS = 1100; // 1 request per second + buffer

let lastRequestTime = 0;

async function mbFetch(path: string): Promise<any> {
  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastRequestTime = Date.now();
  
  const response = await fetch(`${MB_BASE_URL}${path}`, {
    headers: { 'User-Agent': USER_AGENT }
  });
  return response.json();
}

export async function searchLabel(name: string): Promise<Label | null> {
  const data = await mbFetch(`/label?query=${encodeURIComponent(name)}&fmt=json&limit=1`);
  const labels = data.labels || [];
  if (labels.length === 0) return null;
  
  return {
    mbid: labels[0].id,
    name: labels[0].name,
    country: labels[0].country,
    founded: labels[0]['life-span']?.begin
  };
}

export async function getLabelArtists(labelMbid: string): Promise<string[]> {
  const data = await mbFetch(`/label/${labelMbid}?fmt=json&inc=artist-rels`);
  
  const artists: string[] = [];
  for (const rel of data.relations || []) {
    if (rel.type === 'recording contract' && rel.artist) {
      artists.push(rel.artist.name);
    }
  }
  return artists;
}
```

**Step 2: Add label discovery to curator (1-2 hours)**

Add `--label` option to `src/commands/discover.ts`:
```typescript
.option('--label <name>', 'Record label name (uses MusicBrainz)')

// In handler:
if (options.label) {
  // Step 1: Search MusicBrainz for label
  const label = await musicbrainz.searchLabel(options.label);
  if (!label) {
    console.error(`Label not found: ${options.label}`);
    process.exit(1);
  }
  
  // Step 2: Get signed artists
  const artistNames = await musicbrainz.getLabelArtists(label.mbid);
  console.log(`Found ${artistNames.length} artists on ${label.name}`);
  
  // Step 3: Discover tracks from each artist (reuse Phase 3A logic)
  const tracks = await discoverByArtists(artistNames, options.limitPerArtist);
  return formatOutput(tracks, options.format);
}
```

### Testing

```bash
# Label discovery
curator discover --label "ed banger" --limit-per-artist 2
# Should return tracks from Justice, SebastiAn, Mr. Oizo, etc.

# Full Ed Banger workflow (the original use case!)
curator discover --label "ed banger" --limit-per-artist 3 | \
  curator arrange --arc gentle_rise --max-per-artist 1 | \
  curator export --format tidal
# Should output 9+ tracks, one per artist, BPM-sorted
```

### MusicBrainz API Reference

**Search for label:**
```
GET /ws/2/label?query=ed%20banger&fmt=json&limit=1
```

Response:
```json
{
  "labels": [{
    "id": "9cdc4159-ec50-47f0-a7a2-e107618d5246",
    "name": "Ed Banger Records",
    "country": "FR",
    "life-span": { "begin": "2003" }
  }]
}
```

**Get label with artist relationships:**
```
GET /ws/2/label/9cdc4159-ec50-47f0-a7a2-e107618d5246?fmt=json&inc=artist-rels
```

Response includes:
```json
{
  "relations": [
    {
      "type": "recording contract",
      "artist": { "id": "...", "name": "Justice" }
    },
    {
      "type": "recording contract", 
      "artist": { "id": "...", "name": "SebastiAn" }
    }
  ]
}
```

---

## Phase 3C: Diversity Constraints

### Command Specification

```bash
curator arrange --arc gentle_rise --max-per-artist 1
```

### Options

```bash
--max-per-artist <n>    # Maximum tracks per artist
--max-per-album <n>     # Maximum tracks per album (optional)
```

### Implementation

Add to `src/commands/arrange.ts`:
```typescript
.option('--max-per-artist <n>', 'Maximum tracks per artist')
.option('--max-per-album <n>', 'Maximum tracks per album')

// In arrange logic, before BPM sorting:
function enforceDiversity(tracks: Track[], options: ArrangeOptions): Track[] {
  let filtered = tracks;
  
  if (options.maxPerArtist) {
    filtered = enforceArtistLimit(filtered, parseInt(options.maxPerArtist));
  }
  
  if (options.maxPerAlbum) {
    filtered = enforceAlbumLimit(filtered, parseInt(options.maxPerAlbum));
  }
  
  return filtered;
}

function enforceArtistLimit(tracks: Track[], max: number): Track[] {
  const artistCounts = new Map<string, number>();
  const result: Track[] = [];
  
  for (const track of tracks) {
    const count = artistCounts.get(track.artist_name) || 0;
    
    if (count < max) {
      result.push(track);
      artistCounts.set(track.artist_name, count + 1);
    }
  }
  
  return result;
}
```

### Testing

```bash
# Without diversity constraint (may have repeats)
curator discover --artists "Justice" --limit 10 | curator arrange --arc gentle_rise

# With diversity constraint
curator discover --artists "Justice,Daft Punk" --limit-per-artist 5 | \
  curator arrange --arc gentle_rise --max-per-artist 1
# Should output exactly 2 tracks (one per artist)

# Ed Banger showcase
curator discover --label "ed banger" --limit-per-artist 3 | \
  curator arrange --arc gentle_rise --max-per-artist 1
# Should output one track per artist, BPM-sorted
```

---

## Phase 3D: Genre/Playlist Discovery

(Lower priority - existing implementation works for some use cases)

### Existing Commands

```bash
curator discover --playlist <playlist-id> --limit 30
curator discover --genre "hip-hop" --tags "boom-bap" --limit 50
```

### Improvements (if time permits)

- Add `--year` filter
- Add `--bpm` range filter
- Add search-based discovery (Tidal track search)
- Add caching for repeated queries

---

## Success Criteria

### Phase 3A (Artist Discovery)
- ✅ Can discover tracks from specific artist names
- ✅ Tracks have audio features (BPM, Key)
- ✅ Output as JSON for piping
- ✅ Works with arrange command

### Phase 3B (Label Discovery)
- ✅ Can discover artists from label name via MusicBrainz
- ✅ Chain into artist discovery for tracks
- ✅ Full label showcase workflow works

### Phase 3C (Diversity Constraints)
- ✅ `--max-per-artist` limits artist repeats
- ✅ Applied before BPM sorting
- ✅ Maintains arc shape with constrained pool

### Real-World Test

The ultimate test is the Ed Banger workflow:

```bash
curator discover --label "ed banger" --limit-per-artist 3 | \
  curator arrange --arc gentle_rise --max-per-artist 1 | \
  curator export --format tidal

# Expected output:
# - 9+ tracks (one per Ed Banger artist)
# - BPM sorted (slow → fast → slow)
# - Ready to play via tidal play-fresh
```

If this works in ~30 seconds and produces a playlist indistinguishable from manual curation, Phase 3 is complete.

---

## Implementation Order

1. **Week 1: Phase 3A (Artist Discovery)**
   - Add tidal-service endpoints (2 hours)
   - Add curator `--artists` flag (2-3 hours)
   - Test with Justice, Radiohead, etc.

2. **Week 1-2: Phase 3C (Diversity Constraints)** ✅ COMPLETE
   - Add `--max-per-artist` to arrange (2-3 hours) ✅
   - Test with multi-artist discovery ✅

3. **Week 2: Phase 3B (Label Discovery)**
   - Add MusicBrainz provider (2 hours)
   - Add curator `--label` flag (1-2 hours)
   - Test Ed Banger workflow end-to-end

4. **If time: Phase 3D improvements**
   - Caching, year filters, etc.

---

## Files to Create/Modify

### New Files
```
src/providers/musicbrainz.ts          # MusicBrainz API client
```

### Modified Files
```
# tidal-service
tidal_controller.py                   # Add search_artists, get_artist_top_tracks
routes/library.py                     # Add /artists/search, /artist/{id}/top-tracks

# curator
src/commands/discover.ts              # Add --artists, --label options
src/commands/arrange.ts               # Add --max-per-artist, --max-per-album
src/cli.ts                            # Wire up new options
```

---

## Questions to Resolve

1. **tidal-service running?** Artist endpoints need tidal-service, or should we add direct Tidal access to curator?
2. **MusicBrainz rate limiting:** 1 req/sec. Should we cache label lookups?
3. **Missing artists:** MusicBrainz may not have all label-artist relationships. Fall back to release browsing?

---

**Status:** Ready for implementation  
**Blockers:** None  
**Estimated total time:** 10-14 hours
