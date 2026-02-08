# Curator

A CLI-first music curation toolkit for building intelligent playlists from Tidal's catalog.
Uses the official `@tidal-music/api` SDK exclusively — no Python, no community libraries.

## Quick Start

```bash
cd ~/clawd/projects/curator
npm install && npm run build

# Login to Tidal (one-time)
node dist/cli.js auth login

# Discover → Arrange → Export pipeline
node dist/cli.js discover --genre "soul" --tags "classic" --limit 20 --format json | \
  node dist/cli.js arrange --arc gentle_rise | \
  node dist/cli.js export --format tidal
```

## Features

| Command | Description |
|---------|-------------|
| `discover --artists "A,B"` | Get top tracks from artists |
| `discover --playlist <id>` | Get tracks from a Tidal playlist |
| `discover --genre <g> --tags <t>` | Search playlists by genre/tags, extract tracks |
| `discover --label "name"` | Get tracks from label artists (via MusicBrainz) |
| `arrange --arc gentle_rise` | BPM-based energy arc arrangement |
| `arrange --max-per-artist N` | Limit artist repeats (diversity) |
| `sync --source tidal` | Sync favorites to local DB |
| `filter --familiar/--discovery` | Filter against synced favorites |
| `search --favorited` | Query synced favorites |
| `export --format tidal` | Output track IDs |
| `auth login/status/logout` | OAuth login + session management |

## Project Structure

```
curator/
├── src/
│   ├── cli.ts                 # Entry point
│   ├── commands/              # CLI commands
│   │   ├── discover.ts        # Track discovery
│   │   ├── auth.ts            # OAuth login/status/logout
│   │   ├── arrange.ts         # BPM-based arrangement
│   │   ├── export.ts          # Output formatting
│   │   ├── sync.ts            # Tidal favorites sync
│   │   └── search.ts          # Local search
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

# Run a command
node dist/cli.js discover --help
```

## License

MIT
