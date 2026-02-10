# Curator

A provider-agnostic music discovery and curation toolkit. Discovers tracks, enriches them with real genre data from [MusicBrainz](https://musicbrainz.org), filters, arranges by energy — then outputs track IDs ready for any music service.

Fully pipe-friendly. Designed to compose with tools like [tidal-cli](https://github.com/havocked/tidal-cli).

## Install

```bash
git clone https://github.com/havocked/curator.git
cd curator
npm install && npm run build
npm link   # makes `curator` available globally
```

## Quick start

```bash
# Discover tracks by genre (uses MusicBrainz for real genre data)
curator discover --genre "french electro" --limit 20 --preview

# Full pipeline: Discover → Arrange → Export → Create playlist
curator discover --artists "Khruangbin,Bonobo,Tycho" --format json | \
  curator arrange --arc gentle_rise --max-per-artist 2 | \
  curator export --format tidal | \
  tidal-cli playlist create --name "Chill Vibes"
```

## Architecture

Curator is **provider-agnostic** — it defines a `MusicProvider` interface that any streaming service can implement. Discovery, enrichment, filtering, and arrangement work independently of the music source.

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   discover   │ ──► │   enrich     │ ──► │   filter /  │ ──► │   export     │
│ (sources)    │     │ (MusicBrainz)│     │   arrange   │     │ (track IDs)  │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
       ▲                                                            │
       │                                                            ▼
  MusicProvider                                              tidal-cli / etc.
  (pluggable)
```

## Commands

### `discover` — Find tracks

Multiple discovery sources, composable with filters.

**By artist(s):**
```bash
curator discover --artists "Justice,Daft Punk,Moderat" --limit-per-artist 5 --preview
```

**By genre** (MusicBrainz artist lookup → streaming service tracks):
```bash
curator discover --genre "house" --limit 30 --preview
curator discover --genre "jazz" --tags "vocal,modern" --limit 15 --preview
```

**By record label** (MusicBrainz label → artist roster):
```bash
curator discover --label "Ed Banger Records" --limit-per-artist 3 --preview
```

**By similar tracks / radio:**
```bash
curator discover --similar 251380837 --preview
curator discover --radio 251380837 --limit 30 --preview
```

**By playlist, album, or latest album:**
```bash
curator discover --playlist <playlist-uuid> --preview
curator discover --album <album-id> --preview
curator discover --latest-album "Radiohead" --preview
```

**Filters** (composable, applied post-fetch):
```bash
--popularity-min 0.3        # Min popularity (0.0–1.0)
--popularity-max 0.7        # Max popularity — useful for hidden gems
--year-min 1990             # Release year range
--year-max 1999
--limit-per-artist 3        # Max tracks per artist (default: 5)
--limit 50                  # Total result cap (default: 50)
--genre-filter "techno"     # Keep only tracks by artists in this MusicBrainz genre
--no-enrich                 # Skip MusicBrainz enrichment (faster, no genre data)
```

**Output formats:**
```bash
--format json    # Full track details with enrichment (default)
--format text    # Human-readable list
--format ids     # Track IDs only (pipe-friendly)
--preview        # Alias for --format text
```

### `arrange` — Order tracks by energy

Reads JSON from stdin or file. Reorders tracks by energy arc or sort field.

```bash
curator discover --artists "Daft Punk" --format json | curator arrange --arc gentle_rise
curator arrange --by tempo
curator arrange --by key
curator arrange --max-per-artist 1
```

**Arcs:** `flat` (default), `gentle_rise` (start chill → build → peak → wind down)

### `filter` — Filter against your library

Reads JSON from stdin. Requires a synced local database.

```bash
# Only tracks you DON'T already have
curator discover --genre "jazz" --format json | curator filter --discovery

# Only tracks you DO have
curator discover --artists "Radiohead" --format json | curator filter --familiar
```

### `export` — Extract track IDs

```bash
curator discover --genre "ambient" --format json | curator export --format tidal
```

### `library` — Browse synced favorites

```bash
curator library                   # List favorited tracks
curator library --format ids      # IDs only (pipe-friendly)
curator library --limit 20
```

### `cache` — Inspect enrichment cache

MusicBrainz lookups are cached in SQLite to avoid redundant API calls.

```bash
curator cache stats                       # Hit/miss stats
curator cache list                        # Cached artists + genres
curator cache list --genre "electronic"   # Filter by genre
curator cache clear                       # Wipe cache
```

## Genre Enrichment

Most streaming APIs don't expose real genre data. Curator fills this gap with **MusicBrainz genre enrichment** (enabled by default):

1. Extract unique artist names from discovered tracks
2. Look up each artist on MusicBrainz (quoted search, fuzzy matching)
3. Fetch community-curated genre tags (sorted by vote count)
4. Cache results in SQLite (30-day TTL for found, 7-day for not-found)
5. Attach genres to tracks as `enrichment.artist_genres`

```bash
# Discover electronic tracks, then filter to only house artists
curator discover --genre "electronic" --genre-filter "house" --preview
```

## Pipeline Examples

```bash
# Hidden gems from the 90s → create playlist
curator discover --genre "trip hop" --year-min 1990 --year-max 1999 \
  --popularity-max 0.5 --format ids | \
  tidal-cli playlist create --name "90s Trip Hop Deep Cuts"

# Label showcase with diversity + energy arc
curator discover --label "Stones Throw" --limit-per-artist 2 --format json | \
  curator arrange --arc gentle_rise --max-per-artist 1 | \
  curator export --format tidal | \
  tidal-cli playlist create --name "Stones Throw Selection"

# Genre discovery → filter to subgenre → playlist
curator discover --genre "electronic" --limit 50 --genre-filter "minimal techno" \
  --format ids | \
  tidal-cli playlist create --name "Minimal Techno"
```

## Configuration

| File | Purpose |
|------|---------|
| `~/.config/curator/config.yaml` | Optional: override database path |

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `CURATOR_DB_PATH` | `~/.local/share/curator/curator.db` | SQLite database path |
| `CURATOR_CONFIG_PATH` | `~/.config/curator/config.yaml` | Config file path |

## Known Limitations

- **Artist top tracks capped at 20** — streaming API hard limit. Use `--album` for full albums.
- **BPM/key data is sparse** — limits `arrange --arc gentle_rise` effectiveness.
- **Popularity bias** — artist top tracks are pre-sorted by popularity. Use `--popularity-max` for deep cuts.
- **MusicBrainz rate limit** — 1 request/second. First enrichment run on a large batch takes time. Cached after that.

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for details.

## Development

```bash
npm install
npm run build
npm test
npm link
```

## Credits & Data Sources

- **[MusicBrainz](https://musicbrainz.org)** — Open music encyclopedia for artist genres and label data

## License

MIT
