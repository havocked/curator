# Curator - Current Status

**Last Updated:** February 6, 2026, 2:00 AM  
**Repository:** https://github.com/havocked/curator

---

## ✅ What's Working (Phase 1 & 2 Complete)

### Commands Implemented:

```bash
# 1. Sync favorites from Tidal (with audio features)
curator sync --source tidal --only favorites --via direct
# Result: 50 tracks synced, 47 with BPM (94%), 44 with Key (88%)

# 2. Search your favorites (with audio features in output)
curator search --favorited --limit 20 --format json
# Result: JSON with audio_features {bpm, key} for each track

# 3. Filter tracks
curator filter --familiar|--discovery
# Result: Separate known vs new tracks

# 4. Arrange with intelligent energy arc
curator arrange --arc gentle_rise
# Result: BPM-based grouping, smooth transitions, energy progression

# 5. Export to Tidal IDs
curator export --format tidal
# Result: Space-separated track IDs ready for Tidal API
```

### Full Pipeline Example:

```bash
curator search --favorited --limit 20 --format json | \
  curator arrange --arc gentle_rise | \
  curator export --format tidal
# Creates intelligently curated playlist with energy arc
```

### Proven Results:

✅ **Created test playlist:** "Gentle Rise - Curated by Ori"
- 20 tracks
- BPM progression: 56 → 90 → 110 → 164 (smooth energy arc)
- Successfully saved to Tidal account
- Tidal Playlist ID: `2d2653e2-4c68-4c36-92aa-d30bf80d8746`

### Database Status:

```sql
-- Current data
SELECT COUNT(*) FROM tracks;                          -- 50
SELECT COUNT(*) FROM audio_features WHERE bpm IS NOT NULL;  -- 47 (94%)
SELECT COUNT(*) FROM audio_features WHERE key IS NOT NULL;  -- 44 (88%)
```

---

## 📊 Architecture

```
User Request (WhatsApp/CLI)
          ↓
    ┌──────────┐
    │  sync    │ ← Fetch favorites + audio features from Tidal
    └────┬─────┘
         ↓
    ┌──────────┐
    │ search   │ ← Query favorites from database
    └────┬─────┘
         ↓
    ┌──────────┐
    │ filter   │ ← Apply criteria (familiar/discovery)
    └────┬─────┘
         ↓
    ┌──────────┐
    │ arrange  │ ← Intelligent BPM-based ordering (gentle_rise)
    └────┬─────┘
         ↓
    ┌──────────┐
    │ export   │ ← Output track IDs
    └────┬─────┘
         ↓
   Tidal API (create playlist)
```

---

## ❌ What's Missing (Phase 3 - Next Priority)

### Current Limitation:

**Can only curate from synced favorites (~50 tracks)**

Need to discover NEW tracks from Tidal's catalog for unlimited possibilities.

### Phase 3 Goal: Discovery Command

```bash
# Discover tracks by genre/tags
curator discover \
  --genre "hip-hop" \
  --tags "boom-bap" \
  --limit 50
# Returns 50 new tracks from Tidal playlists with audio features
```

### Blocked Use Cases:

❌ "Build me a boom bap → electro hip hop playlist for a boat party"
- Requires: Discovery to find boom bap + electro tracks beyond favorites

❌ "60-minute indie-folk playlist from 2024-2026, rising energy"
- Requires: Discovery with year/genre/energy filters

❌ "Workout playlist, high energy, 130+ BPM"
- Requires: Discovery with BPM filtering

**Once Phase 3 is complete:** All these become possible! 🚀

---

## 📋 Implementation Status by Feature

| Feature | Status | Details |
|---------|--------|---------|
| **Audio features sync** | ✅ Complete | BPM/Key from Tidal, 94%/88% coverage |
| **Database storage** | ✅ Complete | SQLite with audio_features table |
| **Search favorites** | ✅ Complete | JSON/text/IDs output formats |
| **Filter familiar/discovery** | ✅ Complete | Separates known vs new |
| **Gentle rise arc** | ✅ Complete | BPM-based grouping, tempo smoothing |
| **Export to Tidal** | ✅ Complete | Track IDs ready for API |
| **Playlist creation** | ✅ Tested | Successfully created in Tidal account |
| **Discovery command** | ❌ Not Started | Phase 3 - Next priority |
| **Advanced filtering** | ⚠️ Partial | Has familiar/discovery, needs BPM/energy/year |
| **More energy arcs** | ❌ Not Started | peak_middle, wind_down, workout |
| **Key compatibility** | ❌ Not Started | Circle of Fifths logic |

---

## 🎯 Next Steps for Phase 3

### Minimal MVP (2 hours):
```bash
curator discover --playlist <tidal-playlist-id> --limit 30
# Can pull tracks from any Tidal playlist
```

### Full Implementation (7-9 hours):
```bash
curator discover --genre hip-hop --tags boom-bap --limit 50
# Searches Tidal playlists by genre/tags
# Aggregates tracks from multiple playlists
# Fetches audio features
# Caches for instant repeat queries
```

### Documentation:
- **Detailed spec:** [PHASE3_SPEC.md](./PHASE3_SPEC.md)
- **Step-by-step guide:** Implementation plan with code examples
- **Testing strategy:** How to validate discovery works
- **Success criteria:** What "done" looks like

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| **README.md** | User-facing overview, quick start, philosophy |
| **SPEC.md** | Technical specification, architecture, data model |
| **STATUS.md** | This file - current state snapshot |
| **PHASE1_COMPLETE.md** | Phase 1 implementation report + testing |
| **PHASE3_SPEC.md** | Phase 3 discovery specification |
| **COVERAGE_REPORT.md** | Tidal audio features coverage analysis |
| **IMPLEMENTATION_GUIDE.md** | Historical - Phase 1 & 2 guide |

---

## 🚀 Quick Start for Next Agent

### 1. Verify Current State:
```bash
cd ~/clawd/projects/curator
npm run build

# Test what's working
curator sync --source tidal --only favorites --dry-run
curator search --favorited --limit 5 --format json
curator arrange --arc gentle_rise --help
```

### 2. Read Phase 3 Spec:
```bash
cat PHASE3_SPEC.md
# Complete specification with:
# - Command design
# - Discovery sources
# - Database schema
# - Implementation steps
# - Testing strategy
```

### 3. Start Implementation:
```bash
# Step 1: Minimal MVP (2h)
# Add discover command for playlist ID
touch src/commands/discover.ts

# Step 2: Genre/tags discovery (3-4h)
# Build playlist mapping and search

# Step 3: Enhanced filtering (1-2h)
# Add BPM/energy/year filters

# Step 4: Smart caching (1h)
# Implement query cache
```

---

## 💾 Database State

**Location:** `~/clawd/projects/curator/data/curator.db`

**Size:** 49 KB

**Current Tables:**
- `tracks` - 50 rows (your synced favorites)
- `audio_features` - 47 rows with BPM, 44 with Key
- `taste_signals` - 50 rows (favorite signals)

**Schema:**
```sql
-- Already exists (working)
tracks
audio_features
taste_signals
track_metadata
listening_history
playlists
playlist_tracks

-- Phase 3 will add
track_metadata_extended  -- Genre, tags, popularity
discovery_cache          -- Query cache for speed
```

---

## 🎵 Test Playlist Details

**Name:** "Gentle Rise - Curated by Ori"  
**Tidal URL:** https://tidal.com/browse/playlist/2d2653e2-4c68-4c36-92aa-d30bf80d8746  
**Created:** February 6, 2026

**Energy Arc:**
- Start: Breathe (Alfa Mist) - 56 BPM
- Build: Barcelona (George Ezra) - 94 BPM → Johannesburg (Africa Express) - 100 BPM
- Peak: Djourou (Ballaké Sissoko) - 164 BPM
- End: Heat Waves (Glass Animals) - 162 BPM

**Result:** ✅ Smooth energy progression, no jarring transitions

---

## ⚙️ Configuration

**Default paths:**
- Tidal session: `~/clawd/projects/tidal-service/tidal_session.json`
- Database: `~/clawd/projects/curator/data/curator.db`
- Python: `~/clawd/projects/tidal-service/.venv/bin/python`

**Environment variables:**
- `CURATOR_TIDAL_SESSION_PATH` - Override session path
- `CURATOR_TIDAL_PYTHON_PATH` - Override Python interpreter
- `CURATOR_DB_PATH` - Override database location

---

## 🔧 Tools & Dependencies

**Runtime:**
- Node.js >= 18
- TypeScript
- Python 3.9 (for Tidal API access)

**Python packages (in tidal-service venv):**
- tidalapi
- urllib3

**Node packages:**
- commander (CLI framework)
- better-sqlite3 (database)
- yaml (config)

---

## 📞 Integration Points

### Tidal Service (localhost:3001)
```bash
GET /playlist/{id}          # Get playlist tracks
POST /playlists/create      # Create new playlist
GET /search                 # Search Tidal
GET /playlists             # List user playlists
```

### Python Script (scripts/tidal_direct.py)
```bash
python3 scripts/tidal_direct.py \
  --session-path <path> \
  --limit 50
# Returns JSON with favorites + audio features
```

---

## 🎯 Vision: Natural Language Use Case

### Goal (After Phase 3):

**User (via WhatsApp):**
> "hey i'm on a boat with my friends, I need good hip hop bangers with big boom bap style followed with more electro style but still hip hop"

**Ori (behind the scenes):**
```bash
# Discover boom bap
curator discover --genre hip-hop --tags boom-bap --limit 50 | \
  curator filter --energy 0.75-1.0 --limit 12 > boom.json

# Discover electro hip hop
curator discover --genre hip-hop --tags electro --limit 50 | \
  curator filter --energy 0.8-1.0 --limit 12 > electro.json

# Combine and arrange
cat boom.json electro.json | \
  curator arrange --structure boom:12,electro:12 | \
  curator export --format tidal
# Create playlist via Tidal API
```

**Ori (to user):**
> ✅ Playlist ready: "Boom Bap → Electro Hip Hop - Boat Party"
> 24 tracks, smooth transition at midpoint
> [Tidal link]

**Status:** Blocked by Phase 3 (discovery command)

---

## 📈 Progress Timeline

| Date | Phase | Achievement |
|------|-------|-------------|
| Feb 5 | Phase 0 | Project initialization, spec writing |
| Feb 6, 00:00 | Phase 1 | Audio features sync implemented ✅ |
| Feb 6, 01:30 | Phase 2 | Gentle rise arc implemented ✅ |
| Feb 6, 02:00 | Phase 3 | Documentation complete, ready for implementation |

**Next:** Phase 3 implementation (7-9 hours estimated)

---

**Current Status:** 🟢 Ready for Phase 3  
**Blockers:** None  
**Last Verified:** February 6, 2026, 2:00 AM
