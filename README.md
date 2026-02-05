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

### MVP status

- `curator sync` currently supports `--only favorites` (Tidal) plus `--dry-run`

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

### From Tidal (v1)
- Favorites (with timestamps)
- Listening history mixes (monthly breakdowns)
- Personal mixes (My Mix 1-5, Daily Discovery)
- Recently played
- User playlists

### From MusicBrainz (enrichment)
- Genre tags
- Mood labels
- Related artists

### Future (v2+)
- Audio feature analysis (Essentia/librosa)
- BPM, key, energy extraction
- Spectral analysis

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
