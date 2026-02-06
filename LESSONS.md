# Lessons from Real Usage

This document captures insights from real-world playlist creation attempts, informing how Curator should evolve.

---

## Ed Banger Playlist (February 6, 2026)

### The Request

> "Create a playlist of Ed Banger Records artists, starting slow and building to high energy, with no artist repeats (full showcase)."

### What We Tried

**Attempt 1: Genre/Tag Discovery**
```bash
curator discover --genre "electronic" --tags "french,electro,ed-banger" --limit 30
```

**Result:** Failed. Got Four Tet, James Blake, Burial — general electronic music, not Ed Banger artists.

**Why it failed:**
- Curator searched Tidal playlists by tags/genre keywords
- "Ed Banger" isn't a common playlist tag on Tidal
- Tidal categorizes by genre (electronic, french house), not by record label

**Attempt 2: Artist-specific tags**
```bash
curator discover --genre "electronic" --tags "justice,french-house,electro-house" --limit 30
```

**Result:** Same problem — got general electronic music, no Ed Banger focus.

### What Actually Worked (Manual Process)

Had to bypass Curator entirely and use direct Tidal API calls:

```bash
# Search for each artist manually
curl -s "http://localhost:3001/search?q=justice&type=artists&limit=10"
curl -s "http://localhost:3001/search?q=sebastian&type=artists&limit=10"
curl -s "http://localhost:3001/search?q=breakbot&type=artists&limit=10"
# ... repeated 9 times
```

Then manually:
1. Selected one representative track per artist
2. Sorted by "energy feel" (not actual BPM data)
3. Ensured one track per artist (showcase constraint)
4. Created playlist via Tidal API

**Time spent:** ~30 minutes of manual work

### Key Insights

#### 1. Genre/tag discovery insufficient for label-based requests
- Ed Banger is a **record label**, not a genre
- Labels = collections of **artists**, not musical styles
- Need a different discovery path: label → artists → tracks

#### 2. Artist discovery more urgent than genre discovery
- For label showcases, need to search by artist names
- For deep-dives, need artist-specific discovery
- This should be Phase 3A priority

#### 3. MusicBrainz as the label source
- MusicBrainz has label → artist relationships
- Query: `/ws/2/label/{mbid}?inc=artist-rels` returns signed artists
- No static JSON needed — fully dynamic and scalable

#### 4. ISRC is the universal bridge
- Each Tidal track has an ISRC
- Same ISRC exists in MusicBrainz
- Enables: MusicBrainz metadata (labels) + Tidal audio features (BPM)

**Example:**
```
Justice - D.A.N.C.E
├── Tidal:       ID 43421710, ISRC FR0NT0700420, BPM 113
└── MusicBrainz: ISRC FR0NT0700420, Label: Ed Banger Records
```

#### 5. Diversity constraints essential for showcase playlists
- "One per artist" is a common requirement
- Currently no way to enforce this in `arrange`
- Need `--max-per-artist` flag

#### 6. BPM data exists but wasn't used
- Curator has BPM data (94% coverage)
- `arrange --arc gentle_rise` uses BPM-based sorting
- But the manual process bypassed this entirely
- Pipeline was broken: discovery → arrange not connected

### The Ideal Workflow

What **should** have worked:

```bash
# Step 1: Discover from label (via MusicBrainz)
curator discover --label "ed banger" --limit-per-artist 3 | \

# Step 2: Arrange with diversity constraint and energy arc
  curator arrange --arc gentle_rise --max-per-artist 1 | \

# Step 3: Export to Tidal
  curator export --format tidal
```

**Result:** 9 tracks, one per artist, BPM-sorted, 30 seconds total.

### What We're Building

Based on this experience:

| Feature | Priority | Status |
|---------|----------|--------|
| `--artists` flag for discover | Phase 3A | Planned |
| `--label` flag with MusicBrainz | Phase 3B | Planned |
| `--max-per-artist` for arrange | Phase 3C | Planned |
| MusicBrainz provider integration | Phase 3B | Planned |
| tidal-service artist endpoints | Phase 3A | Needed |

### Metrics

**Before (manual):**
- 9 curl commands for artist searches
- Manual track selection by "feel"
- Manual energy ordering
- ~30 minutes total

**After (with planned features):**
- 1 pipeline command
- Automated BPM-based arrangement
- Automated diversity enforcement
- ~30 seconds total

---

## Future Case Studies

(Add new lessons as they arise)

### Boat Party Hip-Hop (Planned)

**Request:** "Boom bap → electro hip hop playlist for a boat party"

**Challenge:** Need to discover tracks from a genre, not a label

**Solution:** Genre/playlist discovery (Phase 3D)

---

## Summary

The Ed Banger case study revealed:

1. **Artist/label discovery is more urgent** than genre discovery
2. **MusicBrainz is the right source** for label data (not static JSON)
3. **ISRC bridges platforms** — same code on Tidal, MusicBrainz, Spotify
4. **Diversity constraints are essential** for showcase playlists
5. **The pipeline needs to be connected** — discovery → arrange → export

These insights directly shaped the Phase 3 specification revision.
