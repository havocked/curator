# Curator

A CLI-first music curation toolkit for building intelligent playlists from Tidal's catalog.
Uses the official `@tidal-music/api` SDK exclusively — no Python, no community libraries.

## Quick Start

```bash
cd ~/clawd/projects/curator
npm install && npm run build

# Login to Tidal (one-time)
node dist/cli.js auth login

# Discover tracks by genre
node dist/cli.js discover --genre "french electro" --limit 20 --format json

# Full pipeline: Discover → Arrange → Export
node dist/cli.js discover --genre "latin jazz" --limit 20 --format json | \
  node dist/cli.js arrange --arc gentle_rise | \
  node dist/cli.js export --format tidal
```

## Features

| Command | Description |
|---------|-------------|
| `discover --genre "..."` | Search tracks by genre/style (natural language) |
| `discover --artists "A,B"` | Get top tracks from artists |
| `discover --playlist <id>` | Get tracks from a Tidal playlist |
| `discover --label "name"` | Get tracks from label artists (via MusicBrainz) |
| `arrange --arc gentle_rise` | BPM-based energy arc arrangement |
| `arrange --max-per-artist N` | Limit artist repeats (diversity) |
| `sync --source tidal` | Sync favorites to local DB |
| `filter --familiar/--discovery` | Filter against synced favorites |
| `search --favorited` | Query synced favorites |
| `export --format tidal` | Output track IDs |
| `auth login/status/logout` | OAuth session management |

### Genre Discovery Examples

```bash
# Natural language genre queries
node dist/cli.js discover --genre "french electro" --limit 10
node dist/cli.js discover --genre "90s hip hop" --limit 10
node dist/cli.js discover --genre "ambient techno" --limit 10
node dist/cli.js discover --genre "latin jazz" --limit 10

# Genre + tags for refinement
node dist/cli.js discover --genre "jazz" --tags "vocal,modern" --limit 10
```

### Track Metadata

Each track includes:
- **Artist & album** — resolved from Tidal's catalog
- **Release year** — from album release date
- **Popularity** — 0.0 to 1.0 scale
- **BPM & key** — when available (sparse in Tidal's data)

## Project Structure

```
curator/
├── src/
│   ├── cli.ts                 # Entry point
│   ├── commands/              # CLI commands
│   │   ├── discover.ts        # Track discovery (search, artist, playlist, label)
│   │   ├── auth.ts            # OAuth login/status/logout
│   │   ├── arrange.ts         # BPM-based arrangement
│   │   ├── export.ts          # Output formatting
│   │   ├── sync.ts            # Tidal favorites sync
│   │   ├── filter.ts          # Familiar/discovery filtering
│   │   └── search.ts          # Local SQLite search
│   ├── services/
│   │   ├── tidalSdk.ts        # Official Tidal SDK client
│   │   ├── tidalService.ts    # HTTP service fallback (--via service)
│   │   ├── nodeStorage.ts     # localStorage polyfill for SDK
│   │   └── types.ts           # Shared types (Track, Artist, Playlist)
│   ├── providers/
│   │   └── musicbrainz.ts     # Label/artist lookup
│   └── db/                    # SQLite storage
└── data/
    └── curator.db             # Local track cache
```

## Configuration

OAuth credentials (required):
- `~/.config/curator/credentials.json` — Client ID/secret
- `~/.config/curator/auth-storage.json` — Encrypted SDK tokens (auto-managed)

## Development

```bash
npm install
npm run build
npm test

node dist/cli.js discover --help
```

## License

MIT
