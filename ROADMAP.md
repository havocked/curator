# Curator — Roadmap

*Last updated: 2026-02-10*

## Current State (v1.0.0)

Curator is a **provider-agnostic music discovery & curation** CLI. 100% TypeScript. 108+ tests passing.

### ✅ Completed

**Discovery Sources**
- `--genre` — MusicBrainz genre → artist roster → streaming service tracks
- `--artists` — artist search + top tracks
- `--playlist <id>` — fetch tracks from playlist
- `--album <id>` — all tracks from album
- `--latest-album <artist>` — latest album by release date
- `--label <name>` — MusicBrainz label → artist roster → tracks
- `--similar <track-id>` — recommendation engine (similar tracks)
- `--radio <track-id>` — radio-style playlist from seed track
- `--genre/--tags` — keyword search on catalog

**MusicBrainz Genre Enrichment** (default on)
- Artist name normalization (strips feat./ft./with, handles &, parentheticals)
- MusicBrainz artist search with quoted Lucene queries + & fallback
- Genre lookup via artist MBID (sorted by vote count)
- SQLite cache with TTL (30d found, 7d not-found)
- Artist dedup (one lookup per unique normalized name)
- Retry with exponential backoff
- `--genre-filter <genre>` — filter by real MusicBrainz genre
- `--no-enrich` — skip enrichment
- `cache stats/list/clear` — inspect enrichment cache

**Filters** (composable, applied post-fetch)
- `--popularity-min/--popularity-max` (0.0–1.0)
- `--year-min/--year-max` (release year)
- `--limit-per-artist` (default 5)
- `--limit` (overall result cap)

**Arrangement**
- `arrange --arc gentle_rise` — BPM-based energy curve
- `arrange --by tempo/key` — flat sort
- `arrange --max-per-artist N` — artist diversity

**Data Pipeline**
- `filter --familiar/--discovery` — filter against synced favorites
- `library` — query local SQLite cache
- `export --format tidal` — extract track IDs
- Unix pipe-friendly throughout

---

## Next Steps

### High Impact
- [ ] **Remaster deduplication** — title+artist fingerprint dedup (keep most popular version)
- [ ] **DiversitySortTransformer** — gap-based artist/album spacing (smarter than `--max-per-artist`)
- [ ] **`--exclude-artists`** — blocklist specific artists from results

### Medium Impact
- [ ] **Last.fm mood/tag enrichment** — mood tags per track/artist for `--mood` filter
- [ ] **BPM enrichment** — fill sparse BPM data from external sources
- [ ] **Show all credited artists** — resolve featured/credited artists, not just primary
- [ ] **Mood-aware arrangement** — `arrange --arc` using mood/energy, not just BPM

### Low Priority
- [ ] **Interactive mode** — preview/reject tracks before creating
- [ ] **Decade walker engine** — `--evolution decade`
- [ ] **Remaster dedup via MusicBrainz release-groups**
- [ ] **Genre taxonomy autocomplete** — local cache of all MusicBrainz genre names

---

## Key Technical Decisions
- **Batch fetch 50 tracks** via `GET /tracks?filter[id]=...` with `buildIncludedMap()`
- **MusicBrainz rate limit 1100ms** — cache aggressively, dedupe artists in-memory
- **Don't cache transient errors** — network failures retry next run
- **Cache "not found" with shorter TTL (7d)** — avoids hammering API, retries sooner
- **stdin for track IDs** — Unix pipe-friendly design
- **Provider-agnostic** — `MusicProvider` interface abstracts streaming service
