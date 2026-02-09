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
node dist/cli.js discover --genre "french electro" --limit 20 --preview

# Full pipeline: Discover → Arrange → Create Playlist on Tidal
node dist/cli.js discover --genre "latin jazz" --limit 20 --format ids | \
  node dist/cli.js playlist create --name "Latin Jazz Mix"
```

## Commands

### `auth` — OAuth Session Management

```bash
curator auth login     # Opens browser for Tidal PKCE login
curator auth status    # Show current session info
curator auth logout    # Clear stored credentials
```

### `discover` — Find Tracks from Tidal Catalog

The primary discovery engine. Multiple source modes, all composable with filters.

```bash
# By genre/style (keyword search on Tidal catalog)
curator discover --genre "french electro" --limit 20
curator discover --genre "jazz" --tags "vocal,modern" --limit 15

# By artist(s) — fetches top tracks (max 20 per artist, API limit)
curator discover --artists "Justice,Daft Punk,Moderat" --limit-per-artist 5

# By record label (MusicBrainz lookup → Tidal artist search)
curator discover --label "Ed Banger Records" --limit-per-artist 3

# By similar tracks (Tidal recommendation engine)
curator discover --similar <track-id>

# By track radio (radio-style playlist from seed track)
curator discover --radio <track-id>

# By playlist ID
curator discover --playlist <tidal-playlist-uuid>

# By album ID
curator discover --album <tidal-album-id>

# By artist's latest album
curator discover --latest-album "Radiohead"
```

**Filters** (composable, applied post-fetch):

```bash
--popularity-min 0.3        # Min popularity (0.0–1.0)
--popularity-max 0.7        # Max popularity — useful for hidden gems
--year-min 1990             # Min release year
--year-max 1999             # Max release year
--limit-per-artist 3        # Max tracks per artist (default: 5)
--limit 50                  # Total result cap (default: 50)
```

**Output formats:**

```bash
--format json    # Full track details (default)
--format text    # Human-readable list
--format ids     # Track IDs only, one per line (pipe-friendly)
--preview        # Alias for --format text
```

### `arrange` — Order Tracks with Musical Logic

Reads JSON from stdin or file. Reorders tracks by energy arc or sort field.

```bash
# Energy arc: start chill → build → peak → wind down
curator discover ... --format json | curator arrange --arc gentle_rise

# Flat sort by tempo or key
curator arrange --by tempo
curator arrange --by key

# Diversity constraint: max N tracks per artist
curator arrange --max-per-artist 1
```

**Arcs:** `flat` (default, no reorder), `gentle_rise` (BPM-based energy curve)

### `playlist create` — Write Playlists to Tidal

Reads track IDs from stdin (newline or comma separated). Creates a new playlist on Tidal and adds tracks.

```bash
# Pipe from discover
curator discover --genre "soul" --format ids | \
  curator playlist create --name "Soul Selection" --description "Curated soul tracks"

# Public playlist
curator discover --artists "Fela Kuti" --format ids | \
  curator playlist create --name "Fela's Best" --public
```

Batches track additions in chunks of 20 (API limit per request).

### `sync` — Sync Tidal Favorites to Local DB

```bash
curator sync --source tidal              # Sync favorites via SDK (direct)
curator sync --source tidal --via service # Via tidal-service HTTP fallback
curator sync --source tidal --dry-run    # Preview without writing
```

### `filter` — Filter Tracks Against Synced Favorites

Reads JSON from stdin or file. Requires prior `sync` to populate the local DB.

```bash
# Keep only tracks NOT in favorites (discovery mode)
curator discover ... --format json | curator filter --discovery

# Keep only tracks IN favorites (familiar mode)
curator discover ... --format json | curator filter --familiar
```

### `search` — Query Local SQLite Database

Searches the local track cache (populated by `sync` and `discover`).

```bash
curator search --favorited              # List favorited tracks
curator search --favorited --format ids # IDs only
curator search --favorited --limit 20   # Limit results
```

**Note:** This searches the *local database*, not Tidal's catalog. For catalog search, use `discover --genre`.

### `export` — Extract Track IDs from JSON

Reads JSON from stdin or file. Outputs Tidal track IDs.

```bash
curator discover ... --format json | curator export --format tidal
```

## Track Metadata

Each discovered track includes:

| Field | Source | Notes |
|-------|--------|-------|
| `id` | Tidal | Numeric track ID |
| `title` | Tidal | Includes version suffix (e.g., "Remastered") |
| `artist` | Tidal (included) | Primary artist name |
| `album` | Tidal (included) | Album title |
| `duration` | Tidal | Seconds |
| `release_year` | Album `releaseDate` | May reflect reissue date for compilations |
| `popularity` | Tidal | 0.0–1.0 scale |
| `genres` | Tidal | Always empty (API is INTERNAL-only) |
| `mood` | Tidal (`toneTags`) | Always empty (API is INTERNAL-only) |
| `audio_features.bpm` | Tidal | Sparse — many tracks return null |
| `audio_features.key` | Tidal | Sparse — many tracks return null |

## Pipeline Examples

```bash
# Hidden gems from the 90s
curator discover --genre "trip hop" --year-min 1990 --year-max 1999 \
  --popularity-max 0.5 --format ids | \
  curator playlist create --name "90s Trip Hop Deep Cuts"

# Label showcase with diversity
curator discover --label "Stones Throw" --limit-per-artist 2 --format json | \
  curator arrange --arc gentle_rise --max-per-artist 1 | \
  curator export --format tidal

# Artist's latest album as playlist
curator discover --latest-album "Tyler, The Creator" --format ids | \
  curator playlist create --name "Latest Tyler"

# Multi-artist mix, one track each, arranged by energy
curator discover --artists "Khruangbin,Tame Impala,Melody's Echo Chamber" \
  --limit-per-artist 3 --format json | \
  curator arrange --arc gentle_rise --max-per-artist 1 | \
  curator export --format tidal

# Similar tracks from a seed (Tidal recommendation engine)
curator discover --similar 251380837 --format ids | \
  curator playlist create --name "Similar Vibes"

# Radio-style playlist from a track
curator discover --radio 251380837 --limit 30 --format ids | \
  curator playlist create --name "Radio Mix"
```

## Project Structure

```
curator/
├── src/
│   ├── cli.ts                    # Entry point, registers all commands
│   ├── commands/
│   │   ├── auth.ts               # OAuth login/status/logout (PKCE)
│   │   ├── discover.ts           # CLI registration + backward-compat exports
│   │   ├── arrange.ts            # BPM arrangement + artist limiting
│   │   ├── playlist.ts           # Tidal playlist creation
│   │   ├── sync.ts               # Favorites sync (SDK or service)
│   │   ├── filter.ts             # Familiar/discovery filtering
│   │   ├── search.ts             # Local DB search (favorited only)
│   │   └── export.ts             # Track ID extraction
│   ├── discovery/                # Discovery module (separated concerns)
│   │   ├── runner.ts             # Orchestrator: resolve → filter → persist → format
│   │   ├── filters.ts            # Track dedup + filtering
│   │   ├── formatting.ts         # Text/JSON/IDs output formatting
│   │   ├── types.ts              # DiscoveryContext, DiscoveryResult, TrackFilters
│   │   ├── index.ts              # Barrel export
│   │   └── sources/              # One file per discovery source
│   │       ├── playlist.ts
│   │       ├── album.ts
│   │       ├── artists.ts        # Parallel search (concurrency 3) + retry
│   │       ├── similar.ts
│   │       ├── radio.ts
│   │       ├── label.ts
│   │       └── search.ts
│   ├── services/
│   │   ├── tidal/                # Tidal SDK (separated concerns)
│   │   │   ├── client.ts         # Auth singleton, init, getClient()
│   │   │   ├── mappers.ts        # Pure transforms: API → Track type
│   │   │   ├── fetcher.ts        # Batch fetch with rate limiting
│   │   │   ├── search.ts         # Artist & track search (with empty retry)
│   │   │   ├── artists.ts        # Top tracks, discography
│   │   │   ├── albums.ts         # Album tracks
│   │   │   ├── tracks.ts         # Single track, similar, radio
│   │   │   ├── playlists.ts      # Playlist CRUD, favorites
│   │   │   ├── types.ts          # SDK types, constants
│   │   │   └── index.ts          # Barrel export
│   │   ├── tidalSdk.ts           # Re-export shim (backward compat)
│   │   ├── tidalService.ts       # HTTP service fallback (--via service)
│   │   ├── nodeStorage.ts        # localStorage polyfill for Node.js
│   │   └── types.ts              # Track, Artist, Album, Playlist types
│   ├── providers/
│   │   └── musicbrainz.ts        # Label search + artist roster lookup
│   ├── lib/
│   │   ├── config.ts             # YAML config loader
│   │   ├── paths.ts              # Path helpers
│   │   ├── retry.ts              # 429 retry + empty-result retry (exponential backoff)
│   │   ├── concurrent.ts         # Parallel task runner with concurrency limit
│   │   └── logger.ts             # stderr logger (keeps stdout clean for pipes)
│   └── db/
│       ├── index.ts              # SQLite operations
│       └── schema.ts             # Table definitions
├── tests/                        # Unit tests
├── data/
│   └── curator.db                # Local track cache (SQLite)
└── references/
    └── tidal-openapi.json        # Tidal API spec (230 endpoints)
```

## Configuration

| File | Purpose |
|------|---------|
| `~/.config/curator/credentials.json` | Tidal OAuth client ID + secret |
| `~/.config/curator/auth-storage.json` | Encrypted SDK tokens (auto-managed) |
| `~/.config/curator/config.yaml` | Optional: override DB path, service URL |

## Credits & Data Sources

- **[Tidal](https://tidal.com)** — Music catalog, streaming, and playlist management
- **[MusicBrainz](https://musicbrainz.org)** — Open music encyclopedia for artist genres and label data

## Known Limitations

- **Genre/mood data is internal-only** — Tidal's genre API endpoints require internal access tier. `--genre` does keyword search, not genre-aware filtering.
- **Artist top tracks capped at 20** — Tidal API ignores `page[limit]` above 20.
- **BPM/key data is sparse** — Many tracks return null, limiting `arrange --arc gentle_rise` effectiveness.
- **Popularity bias** — Artist top tracks are pre-sorted by popularity. Use `--popularity-max` to find deep cuts.
- **Album release year** — May reflect reissue/compilation date, not original release.

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for details.

## Development

```bash
npm install
npm run build
npm test

node dist/cli.js discover --help
node dist/cli.js arrange --help
node dist/cli.js playlist --help
```

## License

MIT
