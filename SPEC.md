# Curator Specification

## Overview

Curator is a CLI toolkit for music curation. It syncs with Tidal, builds taste profiles, and generates playlists using musical rules and AI orchestration.

**Key constraint:** Curator outputs playlists, doesn't play them. Playback is handled by the existing Tidal service.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      CURATOR CLI                         │
├─────────────────────────────────────────────────────────┤
│  sync → profile → search → filter → arrange → validate  │
│                         ↓                                │
│                    export (JSON/M3U8)                    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    TIDAL SERVICE                         │
│                  (localhost:3001)                        │
│                      playback                            │
└─────────────────────────────────────────────────────────┘
```

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
    isrc TEXT,
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audio features (future: from analysis)
CREATE TABLE audio_features (
    track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
    bpm REAL,
    key TEXT,              -- e.g., "C major", "A minor"
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
    genres TEXT,           -- JSON array: ["indie-folk", "acoustic"]
    moods TEXT,            -- JSON array: ["calm", "reflective"]
    tags TEXT,             -- JSON array of freeform tags
    musicbrainz_id TEXT,
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

**MVP status:** Only `--only favorites` and `--dry-run` are implemented so far.

```bash
# Full sync (favorites, history, mixes)
curator sync --source tidal

# Sync specific data
curator sync --source tidal --only favorites
curator sync --source tidal --only history
curator sync --source tidal --only mixes

# Show what would be synced (dry run)
curator sync --source tidal --dry-run
```

**Data synced:**
- Favorites (tracks, albums, artists) with timestamps
- Listening history mixes (monthly: Jan 2026, Dec 2025, etc.)
- Personal mixes (My Most Listened, My Mix 1-5, Daily Discovery)
- Recently played

**Output:**
```
Syncing from Tidal...
  ✓ Favorites: 50 tracks, 8 albums, 30 artists
  ✓ History: 7 mixes (442 unique tracks)
  ✓ Personal mixes: 6 mixes (209 tracks)
  ✓ Recently played: 10 items
Sync complete. 523 tracks in library.
```

---

### `curator profile`

Build and view taste profile.

```bash
# Build/rebuild profile from synced data
curator profile --build

# View current profile
curator profile --show

# Export profile as JSON
curator profile --export > profile.json

# Profile for specific time period
curator profile --period 2025-12
```

**Profile structure:**
```json
{
  "generated_at": "2026-02-04T20:30:00Z",
  "track_count": 523,
  "top_genres": [
    {"genre": "indie-folk", "weight": 0.35},
    {"genre": "electronic", "weight": 0.20},
    {"genre": "jazz", "weight": 0.15}
  ],
  "top_artists": [
    {"artist": "Four Tet", "play_count": 24},
    {"artist": "Radiohead", "play_count": 18}
  ],
  "avg_energy": 0.58,
  "avg_valence": 0.62,
  "preferred_tempo_range": [100, 130],
  "listening_patterns": {
    "morning": {"energy": 0.4, "genres": ["ambient", "classical"]},
    "evening": {"energy": 0.6, "genres": ["indie", "electronic"]}
  }
}
```

---

### `curator search`

Find tracks matching criteria.

**MVP status:** Only `--favorited` is supported (outputs text/json/ids).

```bash
# Search by mood/genre
curator search --mood morning
curator search --genre indie-folk
curator search --genre electronic --genre ambient  # OR

# Search by audio features (when available)
curator search --energy 0.3-0.6
curator search --bpm 100-120
curator search --key "C major"

# Search by history
curator search --favorited
curator search --played-in 2025-12
curator search --not-played-days 30

# Combine filters
curator search --mood focus --energy 0.4-0.6 --not-played-days 14

# Limit results
curator search --mood morning --limit 50

# Output format
curator search --mood morning --format json
curator search --mood morning --format ids  # Just Tidal IDs
```

**Output (default):**
```
Found 47 tracks matching: mood=morning, energy=0.3-0.6

  1. Nils Frahm - Says (0.42 energy, ambient)
  2. Bonobo - Kerala (0.51 energy, electronic)
  3. Khruangbin - Time (0.38 energy, psychedelic)
  ...
```

---

### `curator filter`

Filter a list of tracks (stdin or file).

```bash
# Filter out recently played
cat candidates.json | curator filter --not-played-days 7

# Filter for key compatibility with seed track
curator filter --key-compatible --seed-track 12345

# Filter for smooth tempo transitions
curator filter --tempo-smooth --max-delta 15

# Filter by discovery (familiar vs new)
curator filter --familiar        # Only tracks you know
curator filter --discovery       # Only new tracks
curator filter --discovery-ratio 0.3  # 30% new

# Chain filters
curator search --mood evening | \
  curator filter --not-played-days 14 | \
  curator filter --discovery-ratio 0.2
```

---

### `curator arrange`

Order tracks with musical logic.

```bash
# Arrange by energy arc
curator arrange tracks.json --arc gentle_rise
curator arrange tracks.json --arc peak_middle
curator arrange tracks.json --arc wind_down

# Arrange by key (circle of fifths)
curator arrange tracks.json --by key

# Arrange by tempo (smooth transitions)
curator arrange tracks.json --by tempo

# Combined arrangement
curator arrange tracks.json --arc gentle_rise --smooth-tempo --smooth-key

# Custom energy curve
curator arrange tracks.json --energy-curve "0.3,0.5,0.7,0.6,0.4"
```

**Energy arc presets:**
- `flat` — Consistent energy throughout
- `gentle_rise` — 0.3 → 0.5 → 0.6 (morning, focus)
- `peak_middle` — 0.4 → 0.7 → 0.5 (dinner party)
- `wind_down` — 0.6 → 0.4 → 0.3 (evening)
- `workout` — 0.5 → 0.8 → 0.9 → 0.7 (exercise)

---

### `curator validate`

Check playlist quality.

```bash
# Full validation
curator validate playlist.json

# Specific checks
curator validate playlist.json --check energy-curve
curator validate playlist.json --check tempo-transitions
curator validate playlist.json --check key-compatibility
curator validate playlist.json --check discovery-ratio
curator validate playlist.json --check duration

# Strict mode (fails on warnings)
curator validate playlist.json --strict

# Output format
curator validate playlist.json --format json
```

**Output:**
```
Validating: playlist.json (14 tracks, 58 minutes)

  ✅ Energy curve: smooth rise (0.32 → 0.58 → 0.51)
  ✅ Tempo transitions: all within ±12 BPM
  ⚠️  Key compatibility: track 7→8 (C maj → F# maj, score: 3/10)
  ✅ Discovery ratio: 71% familiar, 29% new
  ✅ Duration: 58 min (target: 60 ±5)

Status: PASSED (1 warning)
```

**Exit codes:**
- `0` — Passed
- `1` — Failed (errors)
- `2` — Passed with warnings (fails in `--strict` mode)

---

### `curator export`

Export playlist in various formats.

```bash
# Export as Tidal track IDs (for tidal queue)
curator export playlist.json --format tidal

# Export as M3U8
curator export playlist.json --format m3u8 --output playlist.m3u8

# Export as JSON (full metadata)
curator export playlist.json --format json

# Export and create Tidal playlist
curator export playlist.json --format tidal-playlist --name "Morning Flow"
```

---

### `curator generate`

High-level command that chains search → filter → arrange → validate.

```bash
# Generate playlist by mood
curator generate --mood morning --duration 60

# Generate with constraints
curator generate \
  --mood focus \
  --duration 90 \
  --familiar-ratio 0.7 \
  --energy-arc gentle_rise

# Generate and play immediately
curator generate --mood evening | tidal queue --stdin

# Generate with explanation (shows reasoning)
curator generate --mood morning --explain
```

**Explanation output:**
```
Generating: mood=morning, duration=60min, familiar=70%

Step 1: Search
  Query: mood=morning, energy=0.3-0.6
  Found: 127 candidates

Step 2: Filter
  - Removed 34 played in last 7 days
  - Applied discovery ratio (70/30)
  Remaining: 52 tracks

Step 3: Arrange
  - Arc: gentle_rise (0.35 → 0.55 → 0.48)
  - Sorted by tempo compatibility
  - Adjusted for key transitions
  Selected: 14 tracks (62 min)

Step 4: Validate
  ✅ All checks passed

Output: playlist.json
```

---

### `curator history`

View and explore listening history.

```bash
# Show history summary
curator history

# Show specific period
curator history --period 2025-12
curator history --period 2025

# Show top tracks
curator history --top 20

# Show by artist
curator history --by artist

# Export history
curator history --export > history.json
```

---

## Configuration

```yaml
# ~/.config/curator/config.yaml

# Tidal integration
tidal:
  service_url: http://localhost:3001

# Database
database:
  path: ~/clawd/projects/curator/data/curator.db

# Defaults
defaults:
  duration: 60              # minutes
  familiar_ratio: 0.7       # 70% familiar, 30% discovery
  energy_arc: gentle_rise
  tempo_max_delta: 15       # BPM

# Validation thresholds
validation:
  key_compatibility_min: 5  # 1-10 scale
  tempo_delta_max: 20       # BPM between adjacent tracks
  energy_delta_max: 0.25    # Between adjacent tracks
```

---

## Integration Patterns

### AI Orchestration (Ori)

Instead of calling `curator generate`, Ori can orchestrate the pipeline:

```bash
# Ori's workflow for "make me a morning playlist"

# 1. Check recent profile
curator profile --show --format json > /tmp/profile.json

# 2. Search with context
curator search \
  --mood morning \
  --energy 0.3-0.6 \
  --limit 100 \
  --format json > /tmp/candidates.json

# 3. Filter based on what Ori knows
cat /tmp/candidates.json | \
  curator filter --not-played-days 7 | \
  curator filter --discovery-ratio 0.3 > /tmp/filtered.json

# 4. Arrange with custom arc
curator arrange /tmp/filtered.json \
  --arc gentle_rise \
  --duration 60 > /tmp/arranged.json

# 5. Validate
curator validate /tmp/arranged.json --strict

# 6. If validation fails, Ori can fix
curator arrange /tmp/filtered.json \
  --arc gentle_rise \
  --duration 60 \
  --avoid-track 12345 > /tmp/arranged-v2.json

# 7. Export and play
curator export /tmp/arranged-v2.json --format tidal | tidal queue --stdin
```

### Cron/Scheduled Playlists

```bash
# Daily discovery playlist at 7am
0 7 * * * curator generate --mood morning --duration 45 | tidal queue --stdin
```

---

## Future Enhancements (v2+)

### Audio Analysis
- Integrate Essentia/librosa for feature extraction
- Analyze Tidal preview URLs or cached audio
- Extract: BPM, key, energy, spectral features

### Seasonal Context
- Track when songs were added/played
- "What was I listening to last spring?"
- Seasonal playlist generation

### Smart Discovery
- Use MusicBrainz relationships
- "Artists similar to X"
- Genre exploration paths

### Feedback Loop
- Track skips vs. completions
- Adjust profile based on actual behavior
- "You skipped 3 electronic tracks → adjusting"

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
  "table": "^6.0.0"          // Table output
}
```
