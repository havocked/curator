# Curator Specification

## Overview

Curator is a CLI toolkit for music curation. It syncs with Tidal, builds taste profiles, and generates playlists using musical rules and AI orchestration.

**Key constraint:** Curator outputs playlists, doesn't play them. Playback is handled by the existing Tidal service.

---

## Current Implementation Status

**Last Updated:** February 6, 2026, 12:00 PM

### ✅ Phase 1 & 2: COMPLETE

**Working Features:**
- ✅ Audio features sync from Tidal (BPM, Key, Key Scale, Peak)
- ✅ Smart arrangement with `gentle_rise` energy arc
- ✅ BPM-based grouping (low ≤90, mid 90-120, high >120)
- ✅ Tempo smoothing (max 15 BPM jumps)
- ✅ Dynamic playlist sizing (adapts to track count)
- ✅ Database storage with 94% BPM coverage, 88% Key coverage
- ✅ End-to-end pipeline: sync → search → filter → arrange → export
- ✅ Tidal playlist creation (successfully tested)

**Commands Implemented:**
- ✅ `curator sync --source tidal --via direct` - Syncs favorites WITH audio features
- ✅ `curator search --favorited --format json` - Returns tracks WITH audio features
- ✅ `curator filter --familiar|--discovery` - Separates known vs new tracks
- ✅ `curator arrange --arc gentle_rise` - REAL intelligent BPM-based curation
- ✅ `curator arrange --max-per-artist N` - Diversity constraint (Phase 3C)
- ✅ `curator export --format tidal` - Outputs track IDs for Tidal API

**Proven Results:**
- Created "Gentle Rise - Curated by Ori" playlist (20 tracks, 56-164 BPM)
- Energy arc validated: Start low (56-84 BPM) → Peak (132-164 BPM) → Smooth transitions
- Database: 50 tracks, 47 with BPM (94%), 44 with Key (88%)

**Reports:**
- [PHASE1_COMPLETE.md](./PHASE1_COMPLETE.md) - Audio features implementation
- [COVERAGE_REPORT.md](./COVERAGE_REPORT.md) - Tidal API coverage testing

---

### 🚧 Phase 3: Discovery (Revised Priority)

**Phase 3A: Artist Discovery** (HIGHEST PRIORITY)
```bash
curator discover --artists "Justice,SebastiAn,Breakbot" --limit-per-artist 5
```

**Phase 3B: Label Discovery** (via MusicBrainz)
```bash
curator discover --label "ed banger" --limit 30
```

**Phase 3C: Diversity Constraints** ✅ COMPLETE
```bash
curator arrange --arc gentle_rise --max-per-artist 1
```

**Phase 3D: Genre/Playlist Discovery** (existing, lower priority)
```bash
curator discover --genre "hip-hop" --tags "boom-bap" --limit 50
```

**Full Specification:** [PHASE3_SPEC.md](./PHASE3_SPEC.md)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      CURATOR CLI                         │
├─────────────────────────────────────────────────────────┤
│  sync → discover → filter → arrange → validate → export │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│      MUSICBRAINZ         │    │         TIDAL            │
│  (labels, artists, ISRC) │    │  (playback, BPM, Key)    │
└──────────────────────────┘    └──────────────────────────┘
               │                           │
               └─────────── ISRC ──────────┘
                    (universal bridge)
```

**Data Flow:**
1. **MusicBrainz** provides: label → artist relationships, ISRCs, genres
2. **Tidal** provides: audio features (BPM, Key), playback, track IDs
3. **ISRC** bridges them: same identifier on both platforms

---

## Data Model

### SQLite Schema

```sql
-- Tracks (synced from Tidal)
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    tidal_id INTEGER UNIQUE NOT NULL,
    title TEXT NOT NULL,
    artist_id INTEGER,
    artist_name TEXT,
    album_id INTEGER,
    album_name TEXT,
    duration_seconds INTEGER,
    isrc TEXT,                    -- Universal identifier (bridges MusicBrainz ↔ Tidal)
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audio features (from Tidal API)
CREATE TABLE audio_features (
    track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
    bpm REAL,              -- From Tidal (94% coverage)
    key TEXT,              -- From Tidal (88% coverage) - e.g., "Eb", "A"
    key_scale TEXT,        -- From Tidal - "MAJOR" or "MINOR"
    peak REAL,             -- From Tidal - loudness peak (0.0 - 1.0)
    source TEXT,           -- 'tidal', 'spotify', 'essentia'
    
    -- Extended features (optional, from Spotify/Essentia)
    energy REAL,           -- 0.0 - 1.0
    danceability REAL,     -- 0.0 - 1.0
    valence REAL,          -- 0.0 (sad) - 1.0 (happy)
    acousticness REAL,     -- 0.0 - 1.0
    instrumentalness REAL, -- 0.0 - 1.0
    
    analyzed_at DATETIME
);

-- Metadata enrichment (from MusicBrainz)
CREATE TABLE track_metadata (
    track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
    musicbrainz_recording_id TEXT,  -- MBID for the recording
    musicbrainz_artist_id TEXT,     -- MBID for the artist
    label_name TEXT,                -- Record label (from MusicBrainz)
    genres TEXT,                    -- JSON array: ["indie-folk", "acoustic"]
    moods TEXT,                     -- JSON array: ["calm", "reflective"]
    tags TEXT,                      -- JSON array of freeform tags
    enriched_at DATETIME
);

-- User taste signals
CREATE TABLE taste_signals (
    id INTEGER PRIMARY KEY,
    track_id INTEGER REFERENCES tracks(id),
    signal_type TEXT NOT NULL,  -- 'favorite', 'played', 'skipped', 'liked'
    signal_source TEXT,         -- 'tidal', 'curator', 'manual'
    timestamp DATETIME,
    metadata TEXT               -- JSON for extra context
);

-- Listening history (from Tidal mixes)
CREATE TABLE listening_history (
    id INTEGER PRIMARY KEY,
    track_id INTEGER REFERENCES tracks(id),
    period TEXT,           -- 'all_time', '2025', '2025-12', '2026-01'
    source_mix_id TEXT,    -- Tidal mix ID
    position INTEGER,      -- Position in mix (proxy for play count)
    synced_at DATETIME
);

-- Generated playlists
CREATE TABLE playlists (
    id INTEGER PRIMARY KEY,
    name TEXT,
    mood TEXT,
    duration_minutes INTEGER,
    track_count INTEGER,
    created_at DATETIME,
    metadata TEXT          -- JSON: energy_arc, discovery_ratio, etc.
);

CREATE TABLE playlist_tracks (
    playlist_id INTEGER REFERENCES playlists(id),
    track_id INTEGER REFERENCES tracks(id),
    position INTEGER,
    PRIMARY KEY (playlist_id, position)
);
```

---

## Commands

### `curator sync`

Sync library data from Tidal.

```bash
# Full sync (favorites, history, mixes)
curator sync --source tidal

# Sync specific data
curator sync --source tidal --only favorites
curator sync --source tidal --only history
curator sync --source tidal --only mixes

# Show what would be synced (dry run)
curator sync --source tidal --dry-run

# Direct sync (default, no tidal-service required)
curator sync --source tidal --via direct
```

---

### `curator discover`

Discover new tracks from various sources.

#### Artist-Based Discovery (Phase 3A)
```bash
# Discover from specific artists
curator discover --artists "Justice,Daft Punk,Moderat" --limit-per-artist 5

# Single artist deep-dive
curator discover --artists "Justice" --limit 20

# Combine with format options
curator discover --artists "Radiohead,Sigur Rós" --limit-per-artist 10 --format json
```

**How it works:**
1. Search Tidal for each artist name
2. Get artist's top tracks (sorted by popularity)
3. Fetch audio features (BPM, Key) for each track
4. Output JSON with all tracks

#### Label-Based Discovery (Phase 3B)
```bash
# Discover from a record label
curator discover --label "ed banger" --limit 30

# With per-artist limit
curator discover --label "ninja tune" --limit-per-artist 3
```

**How it works:**
1. Search MusicBrainz for label → get MBID
2. Query label's artist relationships → get signed artists
3. For each artist: search Tidal → get top tracks
4. Fetch audio features from Tidal
5. Output JSON with all tracks

**MusicBrainz API endpoints used:**
```
GET /ws/2/label?query=<name>&fmt=json           # Search label
GET /ws/2/label/<mbid>?fmt=json&inc=artist-rels  # Get signed artists
```

#### Playlist-Based Discovery
```bash
# Discover from a specific Tidal playlist
curator discover --playlist <playlist-id> --limit 30
```

#### Genre/Tag-Based Discovery
```bash
# Discover from playlist search by genre/tags
curator discover --genre "hip-hop" --tags "boom-bap" --limit 50
```

#### Output Formats
```bash
--format json   # Full metadata (default)
--format text   # Human-readable list
--format ids    # Just Tidal track IDs
```

---

### `curator search`

Find tracks in your synced library.

```bash
# Search favorites
curator search --favorited
curator search --favorited --limit 20 --format json

# Search by audio features
curator search --bpm 100-120
curator search --key "C major"

# Search by history
curator search --played-in 2025-12
curator search --not-played-days 30

# Output formats
curator search --favorited --format json
curator search --favorited --format ids
```

---

### `curator filter`

Filter a list of tracks (stdin or file).

```bash
# Filter by familiarity
curator filter --familiar        # Only tracks you know
curator filter --discovery       # Only new tracks

# Filter by audio features
curator filter --bpm 85-110
curator filter --energy 0.7-1.0

# Chain filters
curator discover --artists "Justice" | \
  curator filter --bpm 100-130 | \
  curator filter --discovery
```

---

### `curator arrange`

Order tracks with musical logic using audio features.

```bash
# Energy arc presets
curator arrange --arc gentle_rise    # Start low → peak → wind down
curator arrange --arc peak_middle    # Moderate → high → moderate
curator arrange --arc wind_down      # High → moderate → low
curator arrange --arc workout        # Build → sustain peak → cool down

# Diversity constraints (NEW)
curator arrange --arc gentle_rise --max-per-artist 1   # Showcase mode
curator arrange --arc gentle_rise --max-per-artist 3   # Allow some repeats
curator arrange --arc gentle_rise --max-per-album 2    # Album diversity

# Sorting options
curator arrange --by tempo           # Smooth tempo transitions
curator arrange --by key             # Circle of fifths compatibility
```

**Energy Arc: `gentle_rise`**
```
[Low: 2 tracks]   → Start easy (75-85 BPM)
[Mid: 4 tracks]   → Build gradually (90-110 BPM)
[High: 6 tracks]  → Peak energy (120-150 BPM)
[Mid: 4 tracks]   → Wind down (100-115 BPM)
[Low: 4 tracks]   → Cool down (75-90 BPM)
```

**Diversity Constraints:**
- `--max-per-artist 1` ensures no artist repeats (showcase mode)
- Applied before BPM sorting
- Maintains arc shape with constrained track pool

**Smoothing Rules:**
- Max 15 BPM jump between consecutive tracks
- Within each bucket: sort ascending (start) or descending (end)

---

### `curator validate`

Check playlist quality.

```bash
# Full validation
curator validate playlist.json

# Specific checks
curator validate playlist.json --check energy-curve
curator validate playlist.json --check tempo-transitions
curator validate playlist.json --check artist-diversity

# Strict mode (fails on warnings)
curator validate playlist.json --strict
```

**Output:**
```
Validating: playlist.json (14 tracks, 58 minutes)

  ✅ Energy curve: smooth rise (0.32 → 0.58 → 0.51)
  ✅ Tempo transitions: all within ±12 BPM
  ✅ Artist diversity: no artist appears more than once
  ⚠️  Key compatibility: track 7→8 (C maj → F# maj, score: 3/10)

Status: PASSED (1 warning)
```

---

### `curator export`

Export playlist in various formats.

```bash
# Export as Tidal track IDs
curator export playlist.json --format tidal

# Export and create Tidal playlist
curator export playlist.json --format tidal-playlist --name "Morning Flow"

# Export as M3U8
curator export playlist.json --format m3u8 --output playlist.m3u8
```

---

## Cross-Platform Integration

### ISRC: The Universal Bridge

**ISRC (International Standard Recording Code)** links tracks across platforms:

| Platform | Identifier | Example |
|----------|------------|---------|
| Tidal | Track ID | `43421710` |
| MusicBrainz | Recording MBID | `d18a1284-d6a1-42d9-...` |
| **ISRC** | Universal | `FR0NT0700420` |
| Spotify | Track URI | `spotify:track:...` |

**Example: Justice - D.A.N.C.E**
```
Tidal:       ID 43421710, ISRC FR0NT0700420, BPM 113, Key A Major
MusicBrainz: MBID d18a1284-..., same ISRC, Label: Ed Banger Records
```

### MusicBrainz Integration

**What MusicBrainz provides:**
- Label → Artist relationships (e.g., "Ed Banger" → Justice, SebastiAn, ...)
- Artist → Recording relationships
- ISRC codes for recordings
- Genre/tag information

**API endpoints:**
```bash
# Search for a label
GET /ws/2/label?query=ed%20banger&fmt=json

# Get label details with signed artists
GET /ws/2/label/{mbid}?fmt=json&inc=artist-rels

# Lookup by ISRC
GET /ws/2/isrc/{isrc}?fmt=json&inc=artist-credits
```

**Rate limiting:** 1 request/second, User-Agent required

---

## Configuration

```yaml
# ~/.config/curator/config.yaml

# Tidal integration
tidal:
  service_url: http://localhost:3001
  session_path: ~/clawd/projects/tidal-service/tidal_session.json
  python_path: ~/clawd/projects/tidal-service/.venv/bin/python

# MusicBrainz integration
musicbrainz:
  user_agent: "Curator/1.0 (your@email.com)"
  rate_limit_ms: 1000

# Database
database:
  path: ~/clawd/projects/curator/data/curator.db

# Defaults
defaults:
  duration: 60              # minutes
  familiar_ratio: 0.7       # 70% familiar, 30% discovery
  energy_arc: gentle_rise
  tempo_max_delta: 15       # BPM
  max_per_artist: null      # No limit by default

# Validation thresholds
validation:
  key_compatibility_min: 5  # 1-10 scale
  tempo_delta_max: 20       # BPM between adjacent tracks
```

---

## Example Workflows

### Label Showcase (Ed Banger)
```bash
curator discover --label "ed banger" --limit-per-artist 3 | \
  curator arrange --arc gentle_rise --max-per-artist 1 | \
  curator export --format tidal
```

### Artist Deep-Dive
```bash
curator discover --artists "Radiohead" --limit 30 | \
  curator filter --bpm 80-120 | \
  curator arrange --arc wind_down | \
  curator export --format tidal
```

### Multi-Artist Compilation
```bash
curator discover --artists "Justice,Daft Punk,Moderat,Gesaffelstein" \
  --limit-per-artist 5 | \
  curator arrange --arc gentle_rise --max-per-artist 2 | \
  curator validate --check artist-diversity | \
  curator export --format tidal-playlist --name "French Touch Mix"
```

---

## Development

```bash
# Setup
cd ~/clawd/projects/curator
npm install

# Run in dev mode
npm run dev -- sync --source tidal

# Build
npm run build

# Test
npm test

# Link globally
npm link
```

## Dependencies

```json
{
  "commander": "^11.0.0",    // CLI framework
  "better-sqlite3": "^9.0.0", // Database
  "chalk": "^5.0.0",         // Terminal colors
  "ora": "^7.0.0",           // Spinners
  "yaml": "^2.0.0"           // Config files
}
```
