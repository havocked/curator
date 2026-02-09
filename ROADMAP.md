# Curator — Roadmap

*Last updated: 2026-02-09*

## Current State

**Curator is 100% TypeScript + official @tidal-music/api SDK.** Zero Python dependencies. 30 tests passing.

### ✅ Completed

**Auth & Infrastructure**
- OAuth PKCE login via SDK (`auth login/status/logout`)
- Encrypted token storage via localStorage polyfill (`nodeStorage.ts`)
- Auth scopes: `user.read`, `collection.read`, `playlists.read`, `playlists.write`

**Discovery Sources**
- `discover --genre/--tags` — direct track search via `searchResults/{id}/relationships/tracks`
- `discover --artists` — artist search + top tracks (max 20 per artist, API limit)
- `discover --playlist <id>` — fetch tracks from Tidal playlist
- `discover --album <id>` — fetch all tracks from album (cursor paginated)
- `discover --latest-album <artist>` — full discography fetch, client-side sort by release date
- `discover --label <name>` — MusicBrainz label → artist roster → Tidal tracks

**Filters (composable, applied post-fetch)**
- `--popularity-min/--popularity-max` (0.0–1.0)
- `--year-min/--year-max` (release year)
- `--limit-per-artist` (default 5, caps per-artist in multi-artist discovery)
- `--limit` (overall result cap)

**Arrangement**
- `arrange --arc gentle_rise` — BPM-based 5-segment energy curve with transition smoothing
- `arrange --by tempo/key` — flat sort by field
- `arrange --max-per-artist N` — artist diversity constraint

**Playlist Management**
- `playlist create --name "..." --description "..." --public` — creates on Tidal, reads track IDs from stdin
- Batched track additions (20 per API request)

**Data Pipeline**
- `sync --source tidal` — favorites sync via v2 userCollections API
- `filter --familiar/--discovery` — filter against synced favorites
- `search --favorited` — query local SQLite cache
- `export --format tidal` — extract track IDs from JSON
- Unix pipe-friendly: `discover --format ids | playlist create --name "..."`

**Track Metadata**
- Batch fetch via `GET /tracks?filter[id]=...&include=artists,albums,genres` (50 per request)
- Artist name, album title, release year (from album `releaseDate`)
- Popularity (0.0–1.0)
- BPM and key (sparse in Tidal's data)
- Genres/mood fields wired but empty (Tidal INTERNAL-only)

### Known Limitations (API)
- Artist top tracks capped at 20 (`page[limit]` ignored)
- `GET /albums` batch max 20 IDs (returns `VALUE_TOO_HIGH` for more)
- Genre endpoints (`GET /genres`) all INTERNAL access tier
- `toneTags` (mood) returns undefined on all tracks
- BPM/key data sparse — many tracks return null
- Album `releaseDate` may reflect reissue, not original release
- No API-side sort on artist albums

## Stress Test Results (Feb 9, 2026)

100 playlist scenarios tested. 58 returned results, 42 timed out (30s script limit).

**Of the 58 that returned results:**
- 🟢 A-tier (85-100%): 15 scenarios (26%)
- 🟡 B-tier (70-84%): 17 scenarios (29%)
- 🟠 C-tier (50-69%): 18 scenarios (31%)
- 🔴 D-tier (0-49%): 8 scenarios (14%)

**Structural issues identified:**
1. **Popularity bias** — artist top tracks always sorted by popularity, can't get true deep cuts
2. **Single-artist dominance** — when some artists timeout, one artist floods the playlist
3. **Keyword search pollution** — genre search matches track titles, not actual genre metadata
4. **No remaster deduplication** — same song appears from different reissues
5. **Conceptual queries untranslatable** — "best album openers", "songs that sample X" need external knowledge

## Next Steps

### High Impact
- [ ] **Remaster deduplication** — fingerprint-based dedup (same title + same artist → keep one)
- [ ] **`playlist create --interactive`** — preview/reject tracks before creating
- [ ] **`--exclude-artists`** — blocklist specific artists from results

### Medium Impact
- [ ] **Show all credited artists** — fix primary-artist-only display (e.g., London Grammar feat. SebastiAn)
- [ ] **Smarter skill orchestration** — SKILL.md should teach the AI agent multi-step playlist strategies
- [ ] **Tidal playlist mining** — search Tidal editorial playlists by concept, merge tracks for genre intelligence

### Larger Features
- [ ] **`--evolution decade`** — decade walker engine
- [ ] **Genre enrichment via MusicBrainz** — artist-level tags (1 req/sec rate limit)
- [ ] **`--genre-filter`** — filter by actual genre (needs MusicBrainz enrichment)

### Won't Fix (API Limitations)
- Per-track genre/mood data (Tidal INTERNAL-only)
- Artist top tracks > 20 (API hard limit)
- Structured genre taxonomy (no external endpoint)

## Architecture

```
curator CLI (TypeScript)
  ├── auth          → @tidal-music/auth (PKCE, encrypted storage)
  ├── discover
  │   ├── --artists/--label   → searchArtists + getArtistTopTracks
  │   ├── --playlist          → getPlaylistTracks
  │   ├── --album             → getAlbumTracks (cursor paginated)
  │   ├── --latest-album      → getArtistAlbums + getAlbumTracks
  │   └── --genre/--tags      → searchTracks (catalog keyword search)
  ├── arrange       → local BPM logic (gentle_rise, flat sort)
  ├── playlist      → createPlaylist + addTracksToPlaylist
  ├── filter        → local SQLite (familiar/discovery)
  ├── search        → local SQLite (favorited tracks)
  ├── sync          → getFavoriteTracks (v2 userCollections)
  └── export        → stdout (track IDs)
```

## Key Technical Decisions
- **Batch fetch 50 tracks** via `GET /tracks?filter[id]=...` — URL length safe, O(1) lookup via `buildIncludedMap()`
- **Album batch max 20** via `GET /albums?filter[id]=...` — API enforced
- **Client-side sort for artist albums** — no API sort parameter available
- **Album `releaseDate` over track `createdAt`** — more accurate release year
- **stdin for playlist IDs** — Unix pipe-friendly design
- **Both auth.ts and tidalSdk.ts must share scope list** — auth login uses separate `initAuth()`
