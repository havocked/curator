# Curator — Roadmap

*Last updated: 2026-02-10*

## Current State (v1.1.0)

**Curator is 100% TypeScript + official @tidal-music/api SDK.** Zero Python dependencies. 108+ tests passing.

### ✅ Completed

**Auth & Infrastructure**
- OAuth PKCE login via SDK (`auth login/status/logout`)
- Encrypted token storage via localStorage polyfill
- SQLite database for track cache + enrichment cache

**Discovery Sources**
- `--genre/--tags` — keyword search on Tidal catalog
- `--artists` — artist search + top tracks
- `--playlist <id>` — fetch tracks from playlist
- `--album <id>` — all tracks from album
- `--latest-album <artist>` — latest album by release date
- `--label <name>` — MusicBrainz label → artist roster → Tidal tracks
- `--similar <track-id>` — Tidal recommendation engine (20 similar tracks)
- `--radio <track-id>` — radio-style playlist from seed track

**MusicBrainz Genre Enrichment** (default on)
- Artist name normalization (strips feat./ft./with, handles &, parentheticals)
- MusicBrainz artist search with quoted Lucene queries + & fallback
- Genre lookup via artist MBID (sorted by vote count)
- SQLite cache with TTL (30d found, 7d not-found)
- Artist dedup (one lookup per unique normalized name)
- Retry with exponential backoff (2 retries, 2s/4s)
- `--genre-filter <genre>` — filter by real MusicBrainz genre
- `--no-enrich` — skip enrichment
- `cache stats` — inspect enrichment cache

**Filters** (composable, applied post-fetch)
- `--popularity-min/--popularity-max` (0.0–1.0)
- `--year-min/--year-max` (release year)
- `--limit-per-artist` (default 5)
- `--limit` (overall result cap)

**Arrangement**
- `arrange --arc gentle_rise` — BPM-based energy curve
- `arrange --by tempo/key` — flat sort
- `arrange --max-per-artist N` — artist diversity

**Playlist Management**
- `playlist create` — creates on Tidal, reads track IDs from stdin
- Batched track additions (20 per API request)

**Data Pipeline**
- `sync --source tidal` — favorites sync via v2 API
- `filter --familiar/--discovery` — filter against synced favorites
- `library --favorited` — query local SQLite cache
- `export --format tidal` — extract track IDs
- Unix pipe-friendly throughout

---

## Next Steps

### High Impact
- [ ] **Remaster deduplication** — title+artist fingerprint dedup (keep most popular version)
- [ ] **Port Tidal's DiversitySortTransformer** — gap-based artist/album spacing (smarter than `--max-per-artist`)
- [ ] **`--exclude-artists`** — blocklist specific artists from results

### Medium Impact
- [ ] **Last.fm mood/tag enrichment** — mood tags per track/artist for `--mood` filter
- [ ] **BPM enrichment** — fill Tidal's sparse BPM data from external source (MusicBrainz recordings or other)
- [ ] **Show all credited artists** — resolve featured/credited artists, not just primary
- [ ] **Mood-aware arrangement** — `arrange --arc` using mood/energy curve, not just BPM

### Low Priority
- [ ] **`playlist create --interactive`** — preview/reject tracks before creating
- [ ] **`--evolution decade`** — decade walker engine
- [ ] **Remaster dedup via MusicBrainz release-groups**
- [ ] **Genre taxonomy autocomplete** — local cache of all MusicBrainz genre names

### Won't Fix (API Limitations)
- Per-track genre/mood from Tidal (INTERNAL-only) — mitigated via MusicBrainz
- Artist top tracks > 20 (API hard limit)
- Album release year may reflect reissue date

---

## Key Technical Decisions
- **Batch fetch 50 tracks** via `GET /tracks?filter[id]=...` with `buildIncludedMap()`
- **Album batch max 20** — API enforced
- **Client-side sort for artist albums** — no API sort parameter
- **MusicBrainz rate limit 1100ms** — cache aggressively, dedupe artists in-memory
- **Don't cache transient errors** — network failures retry next run
- **Cache "not found" with shorter TTL (7d)** — avoids hammering API, retries sooner
- **stdin for playlist IDs** — Unix pipe-friendly design
