# Curator

A CLI-first music curation toolkit for building intelligent playlists from Tidal's catalog.

## Quick Start

```bash
cd ~/clawd/projects/curator
npm install && npm run build

# Discover → Arrange → Export pipeline
node dist/cli.js discover --genre "soul" --tags "classic" --limit 20 --format json | \
  node dist/cli.js arrange --arc gentle_rise | \
  node dist/cli.js export --format tidal
```

## Current Status

### ✅ Working Features (Phase 1-3)

| Command | Description |
|---------|-------------|
| `discover --playlist <id>` | Get tracks from a Tidal playlist |
| `discover --genre <g> --tags <t>` | Search playlists by genre/tags |
| `discover --artists "A,B,C"` | Get top tracks from artists |
| `discover --label "name"` | Get tracks from label artists (via MusicBrainz) |
| `arrange --arc gentle_rise` | BPM-based energy arc arrangement |
| `arrange --max-per-artist N` | Limit artist repeats (diversity) |
| `sync --source tidal` | Sync favorites with audio features |
| `search --favorited` | Query synced favorites |
| `export --format tidal` | Output track IDs |

### 🚧 Next Task: Migrate to Official TIDAL SDK

**Current architecture:**
```
curator (TypeScript) → Python subprocess → tidalapi (community) → TIDAL
```

**Target architecture:**
```
curator (TypeScript) → @tidal-music/api (official) → TIDAL
```

See [SPEC.md](./SPEC.md) for migration details.

## Project Structure

```
curator/
├── src/
│   ├── cli.ts                 # Entry point
│   ├── commands/              # CLI commands
│   │   ├── discover.ts        # Track discovery
│   │   ├── arrange.ts         # BPM-based arrangement
│   │   ├── export.ts          # Output formatting
│   │   ├── sync.ts            # Tidal sync
│   │   └── search.ts          # Local search
│   ├── services/
│   │   └── tidalDirect.ts     # ⚠️ TO BE REPLACED with SDK
│   ├── providers/
│   │   └── musicbrainz.ts     # Label/artist lookup
│   └── db/                    # SQLite storage
├── scripts/
│   └── tidal_direct.py        # ⚠️ TO BE REMOVED (Python helper)
└── data/
    └── curator.db             # Local track cache
```

## Configuration

Default paths (can be overridden via env vars):
- **Database:** `~/clawd/projects/curator/data/curator.db`
- **Tidal Session:** `~/clawd/projects/tidal-service/tidal_session.json`
- **Python:** `~/clawd/projects/tidal-service/.venv/bin/python`

## Development

```bash
npm install
npm run build
npm test

# Run a command
node dist/cli.js discover --help
```

## License

MIT
