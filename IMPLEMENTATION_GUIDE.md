# Implementation Guide for Smart Arrange

**Last Updated:** February 6, 2026  
**For:** Next agent continuing implementation in Cursor

---

## Current Situation

### ✅ What Works
- CLI pipeline: sync → search → filter → export → play
- Database: Tracks and favorites synced from Tidal
- Audio features stored (BPM/Key) via direct Tidal sync
- Gentle rise arc + basic tempo/key sorting in arrange

### ❌ What's Missing
- More arcs: `peak_middle`, `wind_down`, `workout`
- Key compatibility logic (circle of fifths)
- No key compatibility logic

---

## Data Available from Tidal

**Coverage (tested on 50 favorites):**
- BPM: 94% (47/50 tracks)
- Key: 88% (44/50 tracks)
- Key Scale: 88% (MAJOR/MINOR)
- Peak: 100% (loudness)

**Access:** Via `tidalapi` library - see `/tmp/test_tidal_features.py`

---

## Implementation Steps

### Phase 1: Store Audio Features (1-2 hours) ✅ Complete

**File:** `src/commands/sync.ts`

**What to do:**
1. When syncing tracks, extract audio features from Tidal:
   ```typescript
   const track = await tidal.getTrack(id);
   const audioFeatures = {
     bpm: track.bpm,
     key: track.key,
     key_scale: track.key_scale,
     peak: track.peak
   };
   ```

2. Store in `audio_features` table:
   ```sql
   INSERT INTO audio_features (track_id, bpm, key, key_scale, peak, source)
   VALUES (?, ?, ?, ?, ?, 'tidal');
   ```

3. Update database schema if needed (see SPEC.md)

**Test:**
```bash
curator sync --source tidal --only favorites
# Check database: audio_features table should have data
sqlite3 data/curator.db "SELECT COUNT(*) FROM audio_features WHERE bpm IS NOT NULL"
```

---

### Phase 2: Implement Gentle Rise Arc (2-3 hours) ✅ Complete (MVP)

**File:** `src/commands/arrange.ts`

**Current code:** Gentle rise arc implemented with BPM buckets + smoothing

**What to build:**

```typescript
function arrangeGentleRise(tracks: Track[]): Track[] {
  // 1. Group tracks by BPM ranges
  const low = tracks.filter(t => t.bpm >= 56 && t.bpm <= 90);   // Chill
  const mid = tracks.filter(t => t.bpm > 90 && t.bpm <= 120);   // Moderate
  const high = tracks.filter(t => t.bpm > 120 && t.bpm <= 172); // Energetic
  
  // 2. Build energy arc structure (12-track playlist example)
  // Start: 2 low tracks
  // Build: 3 mid tracks (ascending BPM within bucket)
  // Peak: 3 high tracks (highest energy)
  // Descend: 2 mid tracks (descending BPM)
  // End: 2 low tracks
  
  const arc = [
    ...selectFromBucket(low, 2, 'ascending'),
    ...selectFromBucket(mid, 3, 'ascending'),
    ...selectFromBucket(high, 3, 'peak'),
    ...selectFromBucket(mid, 2, 'descending'),
    ...selectFromBucket(low, 2, 'descending')
  ];
  
  // 3. Smooth transitions: no >15 BPM jumps
  return smoothTempoTransitions(arc, maxDelta: 15);
}

function smoothTempoTransitions(tracks: Track[], maxDelta: number): Track[] {
  // If consecutive tracks have >maxDelta BPM difference,
  // try to find a better track from the pool to bridge the gap
  // This is the "secret sauce" - prevents jarring jumps
}
```

**Algorithm Details:**

**Energy Buckets:**
- Low: 56-90 BPM (Billie Eilish - Lost Cause 75, Boards of Canada - Roygbiv 84)
- Mid: 90-120 BPM (John Moreland 89, George Ezra 94, Soundgarden 106)
- High: 120-172 BPM (Pouya - 1000 Rounds 150, PNL - Tempête 130)

**Gentle Rise Pattern (20 tracks):**
```
[Low: 2 tracks]   → Start easy (75-85 BPM)
[Mid: 4 tracks]   → Build gradually (90-110 BPM)
[High: 6 tracks]  → Peak energy (120-150 BPM)
[Mid: 4 tracks]   → Wind down (100-115 BPM)
[Low: 4 tracks]   → Cool down (75-90 BPM)
```

**Smoothing Rules:**
- Within each bucket: sort ascending (start) or descending (end)
- Between buckets: try to minimize BPM jumps
- Max jump: 15 BPM (configurable)
- If jump unavoidable, prefer gradual build over sudden drop

**Test:**
```bash
curator search --favorited --format json | \
  curator arrange --arc gentle_rise | \
  curator export --format tidal | \
  xargs ~/clawd/skills/tidal/scripts/tidal queue

# Play it and FEEL the difference
# Should start mellow, build energy, peak, wind down
```

---

### Phase 3: Add More Arcs (1-2 hours each)

Once `gentle_rise` works, add:

**peak_middle:**
```
[Mid: 3] → [High: 6] → [Mid: 3]
```

**wind_down:**
```
[High: 4] → [Mid: 6] → [Low: 4]
```

**workout:**
```
[Mid: 2] → [High: 8] → [Mid: 2] → [Low: 2]
```

---

### Phase 4: Key Compatibility (Advanced, 2-3 hours)

**Circle of Fifths:**
```typescript
const circleOfFifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];

function keyDistance(key1: string, key2: string): number {
  const idx1 = circleOfFifths.indexOf(key1);
  const idx2 = circleOfFifths.indexOf(key2);
  if (idx1 === -1 || idx2 === -1) return Infinity;
  
  const distance = Math.abs(idx1 - idx2);
  return Math.min(distance, 12 - distance); // Circular distance
}

function arrangeByKeyCompatibility(tracks: Track[]): Track[] {
  // Start with any track
  // For each next track, prefer keys that are close on circle of fifths
  // Distance 1 = perfect fifth (very harmonious)
  // Distance 6 = tritone (very dissonant)
}
```

**Good transitions:**
- C → G (distance 1, perfect fifth)
- G → D (distance 1)
- C → F (distance 1 backwards)

**Bad transitions:**
- C → F# (distance 6, tritone - jarring)
- C → C# (distance 1 on circle but semitone clash)

---

## Testing Strategy

### Unit Tests
```typescript
// tests/arrange.test.ts
describe('arrangeGentleRise', () => {
  it('should start with low BPM tracks', () => {
    const tracks = createMockTracks([75, 120, 85, 150]);
    const arranged = arrangeGentleRise(tracks);
    expect(arranged[0].bpm).toBeLessThan(90);
  });
  
  it('should peak in the middle', () => {
    const tracks = createMockTracks([75, 120, 85, 150, 80, 140]);
    const arranged = arrangeGentleRise(tracks);
    const midPoint = Math.floor(arranged.length / 2);
    expect(arranged[midPoint].bpm).toBeGreaterThan(120);
  });
  
  it('should end with low BPM tracks', () => {
    const tracks = createMockTracks([75, 120, 85, 150]);
    const arranged = arrangeGentleRise(tracks);
    expect(arranged[arranged.length - 1].bpm).toBeLessThan(90);
  });
});
```

### Integration Test
```bash
# Generate playlist, play it, observe the energy flow
curator search --favorited --limit 20 --format json | \
  curator arrange --arc gentle_rise | \
  tee /tmp/playlist.json | \
  curator export --format tidal | \
  xargs ~/clawd/skills/tidal/scripts/tidal queue

# Check the playlist structure
cat /tmp/playlist.json | jq '.tracks[] | {title, artist, bpm}'

# Should see:
# Start: 75-90 BPM
# Middle: 120-150 BPM (peak)
# End: 75-90 BPM
```

---

## Edge Cases to Handle

### 1. Not Enough Tracks in a Bucket
```typescript
// If there are only 2 high-energy tracks but need 6:
// - Use what you have
// - Fill remaining slots with mid-high tracks
// - Maintain the arc shape as best as possible
```

### 2. Missing BPM Data (6% of tracks)
```typescript
// Option A: Exclude tracks without BPM
// Option B: Place them at the end
// Option C: Estimate from genre/mood (future)
```

### 3. Extreme BPM Jumps (unavoidable)
```typescript
// If gap >15 BPM and no bridge track available:
// - Allow the jump but log a warning
// - Suggest alternative arrangements
// - Consider fetching Spotify data for better options
```

---

## Code Locations

**Files to modify:**
- `src/commands/sync.ts` - Add audio features extraction
- `src/commands/arrange.ts` - Replace sorting with smart logic
- `src/db/schema.ts` - Ensure audio_features table exists
- `src/db/index.ts` - Add queries for audio features

**Files to reference:**
- `/tmp/test_tidal_features.py` - How to get BPM/Key from Tidal
- `COVERAGE_REPORT.md` - Data coverage analysis
- `SPEC.md` - Database schema and command specs

**Testing:**
- `~/clawd/projects/tidal-service/` - For playback integration testing
- `~/clawd/skills/tidal/scripts/tidal` - CLI for playing results

---

## Success Criteria

### Minimum Viable Implementation
- ✅ Sync stores BPM/Key in database
- ✅ `arrange --arc gentle_rise` produces playlists that:
  - Start at low-mid energy (75-95 BPM)
  - Build to high energy (120-150 BPM) in middle
  - Wind down to low energy (75-95 BPM) at end
  - Have no >15 BPM jumps between consecutive tracks

### How to Verify
1. **Database check:** `audio_features` table populated after sync
2. **Structure check:** Playlist starts low, peaks middle, ends low
3. **Smoothness check:** No jarring BPM transitions
4. **Feel check:** Play the playlist - does it FEEL right?

The last one is key: if it doesn't feel like a well-curated playlist, iterate!

---

## Resources

**Tidal API Access:**
```python
# In Python (for testing):
from tidal_controller import TidalController
controller = TidalController('path/to/tidal_session.json')
track = controller.get_track(track_id)
print(track.bpm, track.key, track.key_scale)
```

**TypeScript Integration:**
```typescript
// Call Python script or port logic to TypeScript
// tidalapi has TypeScript equivalent: tidal-api-wrapper
```

**References:**
- Peter's Philosophy: Close the loop, validate your work
- Coverage Report: 94% BPM, 88% Key from Tidal
- Current arrange: Just sorts arrays (lines 143-190 in arrange.ts)

---

## Questions for the Next Agent

1. **Database:** Does `audio_features` table exist in current schema? If not, migration needed.
2. **Tidal integration:** Should we call Python script or port to TypeScript?
3. **Testing:** Should we write tests first (TDD) or build then test?
4. **Playlist size:** Should gentle_rise adapt to any playlist length, or assume 12-20 tracks?

---

**Good luck! 🎵**

The data is there (94% coverage), the pipeline works, now make it smart!
