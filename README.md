# Curator

A CLI-first music curation toolkit. Understands your taste, builds playlists with intention.

## Philosophy

**Tools, not magic.** Curator is a composable toolkit, not a monolithic "make me a playlist" button. Each command does one thing well. Chain them together for complex workflows.

**Close the loop.** Every operation can be validated. If it can't be tested, it shouldn't be automated.

**AI uses tools.** The curator provides the instruments — search, filter, arrange, validate. AI (Ori) orchestrates them intelligently rather than generating playlists out of thin air.

## Quick Start

```bash
# Sync your Tidal library
curator sync --source tidal

# Build taste profile from listening history
curator profile --build

# Generate a playlist
curator generate --mood morning --duration 60

# Validate it
curator validate playlist.json

# Play via Tidal service
tidal queue playlist.json
```

## Current Status

### ✅ Working Commands (MVP)
- `curator sync --source tidal --only favorites` - Syncs favorites from Tidal (default `--via direct`)
- `curator search --favorited --format json|text|ids` - Query synced favorites
- `curator filter --familiar|--discovery` - Separate known vs new tracks
- `curator arrange --arc flat|gentle_rise --by tempo|key` - BPM-based ordering + gentle rise arc
- `curator export --format tidal` - Output track IDs for playback

**Direct sync notes:**
- Uses `~/clawd/projects/tidal-service/tidal_session.json` by default
- Override with `CURATOR_TIDAL_SESSION_PATH` or `tidal.session_path` in config

### 🚧 In Progress
- `curator arrange` - Currently basic sorting only, needs smart implementation:
  - ✅ Infrastructure in place
  - ❌ Real energy arc logic (gentle_rise, etc.) - **needs implementation**
  - ❌ Tempo smoothing (<15 BPM transitions) - **needs implementation**
  - ❌ Key compatibility (Circle of Fifths) - **needs implementation**

### 📋 Next Steps
1. **Update sync command** - Store BPM/Key from Tidal in database
2. **Implement gentle_rise arc** - Use real audio features for intelligent ordering
3. **Add tempo smoothing** - Prevent jarring BPM jumps
4. **Build more arcs** - peak_and_fade, rollercoaster, etc.

### 📊 Data Status
- **Tidal audio features:** 94% BPM, 88% Key coverage (tested on 50 favorites)
- **Database:** Tracks and favorites synced, audio features not yet stored
- **See:** [COVERAGE_REPORT.md](./COVERAGE_REPORT.md) for full analysis

## Core Principles

### 1. Separation of Concerns

```
curator → outputs playlist → player consumes it
```

Curator doesn't play music. It outputs playlists (JSON, M3U8, Tidal IDs). The existing Tidal service handles playback.

### 2. Composable Commands

```bash
# Chain operations
curator search --genre indie-folk --energy 0.4-0.7 | \
  curator filter --not-recently-played | \
  curator arrange --arc gentle_rise | \
  curator validate --strict | \
  curator export --format tidal
```

### 3. Validation Loops

```bash
# Curator can check its own work
curator validate playlist.json \
  --check energy-curve \
  --check tempo-transitions \
  --check discovery-ratio

# Output:
# ✅ Energy curve: smooth (0.32 → 0.61 → 0.48)
# ⚠️  Tempo jump: track 4→5 (142 → 98 BPM)
# ✅ Discovery: 70% familiar, 30% new
```

### 4. Data-Driven Curation

No random shuffling. Playlists are built from:
- **Your taste profile** (from Tidal history)
- **Musical rules** (key compatibility, tempo flow)
- **Intentional structure** (energy arcs, discovery balance)

## Data Sources

### From Tidal (Primary) ✅
**94% coverage** of audio features - better than expected!

- **Favorites** (with timestamps)
- **Audio features:** BPM (94%), Key (88%) - directly from Tidal API
- **Track metadata:** Artist, album, duration, ISRC
- **Listening history:** Personal mixes (My Mix 1-5, Daily Discovery)
- User playlists, recently played

**Coverage Report:** See [COVERAGE_REPORT.md](./COVERAGE_REPORT.md)

### Future Enhancements (v2+)
- **Spotify API** (optional): Fill gaps for the 6% of tracks without Tidal features
- **Advanced features:** Energy, danceability, valence (via Spotify)
- **MusicBrainz:** Genre tags, mood labels (enrichment)
- **Local analysis:** Essentia/librosa for custom audio analysis

## Installation

```bash
# Prerequisites
node >= 18
python >= 3.9 (for audio analysis, future)

# Install
cd ~/clawd/projects/curator
npm install
npm link  # Makes 'curator' available globally
```

## Commands

See [SPEC.md](./SPEC.md) for detailed command reference.

| Command | Description |
|---------|-------------|
| `curator sync` | Sync library from Tidal |
| `curator profile` | Build/view taste profile |
| `curator search` | Find tracks matching criteria |
| `curator filter` | Filter track lists |
| `curator arrange` | Order tracks with musical logic |
| `curator validate` | Check playlist quality |
| `curator export` | Output in various formats |
| `curator history` | View listening history |

## Integration with Tidal Service

Curator outputs, Tidal plays:

```bash
# Generate and play in one pipeline
curator generate --mood evening | tidal queue --stdin

# Or save first, play later
curator generate --mood focus --duration 90 > focus.json
tidal queue focus.json
```

## Project Structure

```
curator/
├── src/
│   ├── cli.ts              # Entry point
│   ├── commands/           # Individual commands
│   │   ├── sync.ts
│   │   ├── profile.ts
│   │   ├── search.ts
│   │   ├── filter.ts
│   │   ├── arrange.ts
│   │   ├── validate.ts
│   │   └── export.ts
│   ├── providers/          # Data sources
│   │   ├── tidal.ts
│   │   └── musicbrainz.ts
│   ├── core/               # Business logic
│   │   ├── profile.ts
│   │   ├── arranger.ts
│   │   └── validator.ts
│   └── db/                 # Local storage
│       └── schema.ts
├── data/
│   └── curator.db          # SQLite database
├── package.json
├── tsconfig.json
└── README.md
```

## Why CLI?

From [Peter Steinberger's philosophy](../docs/peter-steinberger-philosophy.md):

> "Models are really good at using Bash... With a CLI, you can chain, filter, script. MCPs pre-export all functions upfront and you can't chain them."

CLI enables:
- **Composability** — pipe commands together
- **Agent-friendliness** — AI can discover and use tools
- **Scriptability** — automate workflows
- **Fast feedback loops** — validate locally, iterate quickly

## License

MIT
