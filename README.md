# Curator

A CLI-first music curation toolkit for building intelligent playlists from Tidal's catalog.

Discovers tracks, enriches them with real genre data from MusicBrainz, filters and arranges by energy — then pushes playlists straight to Tidal. Fully pipe-friendly.

## Quick Start

```bash
git clone https://github.com/havocked/curator.git
cd curator
npm install && npm run build
npm link  # makes `curator` available globally

# Set up Tidal credentials (one-time)
# You need a Tidal client ID + secret from https://developer.tidal.com
mkdir -p ~/.config/curator
cat > ~/.config/curator/credentials.json << 'EOF'
{ "clientId": "YOUR_CLIENT_ID", "clientSecret": "YOUR_CLIENT_SECRET" }
EOF

# Login to Tidal (opens browser)
curator auth login

# Discover tracks by genre
curator discover --genre "french electro" --limit 20 --preview

# Full pipeline: Discover → Arrange → Create Playlist
curator discover --artists "Khruangbin,Bonobo,Tycho" --format json | \
  curator arrange --arc gentle_rise --max-per-artist 2 | \
  curator export --format tidal | \
  curator playlist create --name "Chill Vibes"
```

## Commands

### `discover` — Find Tracks

The primary discovery engine. Multiple source modes, composable with filters.

**By artist(s)** — top tracks per artist (max 20 per artist, API limit):
```bash
curator discover --artists "Justice,Daft Punk,Moderat" --limit-per-artist 5 --preview
```

**By genre** — finds artists tagged with that genre on MusicBrainz, then fetches their tracks from Tidal:
```bash
curator discover --genre "house" --limit 30 --preview
curator discover --genre "jazz" --tags "vocal,modern" --limit 15 --preview
```

**By record label** — MusicBrainz label lookup → artist roster → Tidal tracks:
```bash
curator discover --label "Ed Banger Records" --limit-per-artist 3 --preview
```

**By similar tracks / radio** — Tidal's recommendation engine:
```bash
curator discover --similar 251380837 --preview
curator discover --radio 251380837 --limit 30 --preview
```

**By playlist, album, or latest album:**
```bash
curator discover --playlist <tidal-playlist-uuid> --preview
curator discover --album <tidal-album-id> --preview
curator discover --latest-album "Radiohead" --preview
```

**Filters** (composable, applied post-fetch):
```bash
--popularity-min 0.3        # Min popularity (0.0–1.0)
--popularity-max 0.7        # Max popularity — useful for hidden gems
--year-min 1990             # Min release year
--year-max 1999             # Max release year
--limit-per-artist 3        # Max tracks per artist (default: 5)
--limit 50                  # Total result cap (default: 50)
--genre-filter "techno"     # Keep only tracks by artists in this MusicBrainz genre
--no-enrich                 # Skip MusicBrainz enrichment (faster, no genre data)
```

**Output formats:**
```bash
--format json    # Full track details with enrichment (default)
--format text    # Human-readable list
--format ids     # Track IDs only, one per line (pipe-friendly)
--preview        # Alias for --format text
```

### `arrange` — Order Tracks by Energy

Reads JSON from stdin or file. Reorders tracks by energy arc or sort field.

```bash
curator discover --artists "Daft Punk" --format json | curator arrange --arc gentle_rise
curator arrange --by tempo
curator arrange --by key
curator arrange --max-per-artist 1  # Diversity constraint
```

**Arcs:** `flat` (default, no reorder), `gentle_rise` (BPM-based: start chill → build → peak → wind down)

### `playlist create` — Push to Tidal

Reads track IDs from stdin. Creates a new playlist on Tidal.

```bash
curator discover --genre "soul" --format ids | \
  curator playlist create --name "Soul Selection" --description "Curated soul tracks"

curator discover --artists "Fela Kuti" --format ids | \
  curator playlist create --name "Fela's Best" --public
```

### `filter` — Filter Against Your Favorites

Reads JSON from stdin or file. Requires prior `sync` to populate local DB.

```bash
# Only tracks you DON'T already have (discovery mode)
curator discover --genre "jazz" --format json | curator filter --discovery

# Only tracks you DO have (familiar mode)
curator discover --artists "Radiohead" --format json | curator filter --familiar
```

### `sync` — Sync Tidal Favorites to Local DB

```bash
curator sync --source tidal           # Sync favorites
curator sync --source tidal --dry-run # Preview without writing
```

### `library` — Browse Synced Favorites

Searches the local track cache (populated by `sync` and `discover`).

```bash
curator library                   # List favorited tracks
curator library --format ids      # IDs only (pipe-friendly)
curator library --limit 20        # Limit results
```

### `cache` — Inspect Enrichment Cache

MusicBrainz lookups are cached in SQLite to avoid redundant API calls.

```bash
curator cache stats                       # Cache hit/miss stats
curator cache list                        # List cached artists + genres
curator cache list --genre "electronic"   # Filter cached artists by genre
curator cache list --format json          # JSON output
curator cache clear                       # Wipe cache (forces re-fetch)
```

### `export` — Extract Track IDs

Reads JSON from stdin or file. Outputs Tidal track IDs.

```bash
curator discover --genre "ambient" --format json | curator export --format tidal
```

### `auth` — Tidal Authentication

```bash
curator auth login     # Opens browser for Tidal PKCE login
curator auth status    # Show current session info
curator auth logout    # Clear stored credentials
```

## Genre Enrichment

Tidal's genre/mood API endpoints are internal-only — external apps get empty data. Curator solves this with **MusicBrainz genre enrichment**, enabled by default.

**How it works:**
1. After discovering tracks, curator extracts unique artist names
2. Each artist is looked up on MusicBrainz (quoted search, fuzzy matching)
3. Genre tags are fetched (community-curated, sorted by vote count)
4. Results are cached in SQLite (30-day TTL for found, 7-day for not-found)
5. Genres are attached to tracks as `enrichment.artist_genres`

**What you get:**
```bash
# Discover electronic tracks, then filter to only house artists
curator discover --genre "electronic" --genre-filter "house" --preview

# JSON output includes enrichment data
curator discover --artists "Daft Punk" --limit 5 --format json
# → enrichment.artist_genres: ["electronic", "house", "french house", "disco"]
```

**Performance:** First run hits MusicBrainz API (rate-limited to 1 req/sec). Subsequent runs use cache — near-instant.

## Pipeline Examples

```bash
# Hidden gems from the 90s
curator discover --genre "trip hop" --year-min 1990 --year-max 1999 \
  --popularity-max 0.5 --format ids | \
  curator playlist create --name "90s Trip Hop Deep Cuts"

# Label showcase with diversity + energy arc
curator discover --label "Stones Throw" --limit-per-artist 2 --format json | \
  curator arrange --arc gentle_rise --max-per-artist 1 | \
  curator export --format tidal | \
  curator playlist create --name "Stones Throw Selection"

# Multi-artist mix, arranged by energy
curator discover --artists "Khruangbin,Tame Impala,Melody's Echo Chamber" \
  --limit-per-artist 3 --format json | \
  curator arrange --arc gentle_rise --max-per-artist 1 | \
  curator export --format tidal

# Genre discovery → filter to subgenre → playlist
curator discover --genre "electronic" --limit 50 --genre-filter "minimal techno" \
  --format ids | \
  curator playlist create --name "Minimal Techno"

# Similar tracks from a seed, chained
curator discover --similar 251380837 --format ids | \
  curator playlist create --name "Similar Vibes"
```

## Configuration

| File | Purpose |
|------|---------|
| `~/.config/curator/credentials.json` | Tidal OAuth client ID + secret (you create this) |
| `~/.config/curator/auth-storage.json` | SDK tokens (auto-managed after login) |
| `~/.config/curator/config.yaml` | Optional: override DB path |

**Getting Tidal credentials:** Register at [developer.tidal.com](https://developer.tidal.com) to get a client ID and secret.

## Known Limitations

- **Artist top tracks capped at 20** — Tidal API hard limit. Use `--album` or `--latest-album` for full albums.
- **BPM/key data is sparse** — Many tracks return null from Tidal, limiting `arrange --arc gentle_rise` effectiveness.
- **Popularity bias** — Artist top tracks are pre-sorted by popularity. Use `--popularity-max` to find deep cuts.
- **Album release year** — May reflect reissue/compilation date, not original release.
- **MusicBrainz rate limit** — 1 request/second. First enrichment run on a large batch can take time. Cached after that.

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for details.

## Credits & Data Sources

- **[Tidal](https://tidal.com)** — Music catalog, streaming, and playlist management
- **[MusicBrainz](https://musicbrainz.org)** — Open music encyclopedia for artist genres and label data

## Development

```bash
npm install
npm run build
npm test         # 108 tests
npm link         # Global install
```

## License

MIT
