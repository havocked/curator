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

## Unlocked Endpoints (Feb 9, 2026 — iOS SDK Analysis)

Analyzed `tidal-music/tidal-sdk-ios` repo. Cross-referenced `required-access-tier` in OpenAPI spec.
All endpoints below are `THIRD_PARTY` (available with our credentials).

### ✅ Confirmed Working
| Endpoint | Returns | Quality |
|----------|---------|---------|
| `/tracks/{id}/relationships/similarTracks` | 20 similar track IDs | **Excellent** — "Get Lucky" → Stardust, Modjo, Eric Prydz |
| `/tracks/{id}/relationships/radio` | Playlist ID (resolve via `/playlists/{id}/relationships/items`) | **Excellent** — same quality as similarTracks |
| `/searchResults/{id}/relationships/topHits` | Mixed types: artists + tracks + albums | **Good** — smarter than tracks-only search |
| `/searchSuggestions/{id}` | Autocomplete suggestions | Useful for query refinement |
| `/albums/{id}/relationships/similarAlbums` | Album IDs | Untested quality (test ID was wrong) |
| `/artists/{id}/relationships/similarArtists` | 20 artist IDs | **Broken** — returns hip hop for Daft Punk, likely personalized/buggy |
| `/artists/{id}/relationships/radio` | Playlist ID | **Broken** — same issue, wrong genre results |

### ❌ Confirmed Blocked (INTERNAL only)
| Endpoint | Result |
|----------|--------|
| `GET /genres` | Requires `filter[id]`, returns empty for `USER_SELECTABLE` |
| `GET /genres/{id}` | Would work if we knew IDs, but can't list them |
| `/tracks/{id}/relationships/genres` | Returns empty `data: []` |
| `/albums/{id}/relationships/genres` | Returns empty `data: []` |

### ❌ Empty (Account/Subscription Issue)
| Endpoint | Result |
|----------|--------|
| `/userRecommendations/{id}` | `NOT_FOUND` |
| `/userRecommendations/{id}/relationships/discoveryMixes` | Empty |
| `/userRecommendations/{id}/relationships/myMixes` | Empty |

### Key Insight
**`similarTracks` + `trackRadio` are the game changers.** Feed a seed track → get 20 quality recommendations.
Can chain: seed → similar → pick best → similar again → deduplicate → playlist.
This is Tidal's own recommendation engine exposed via API.

**Genre endpoint is truly locked.** iOS SDK has the code because Tidal's own app uses an internal client ID. Third-party credentials get empty responses.

### Reference
- iOS SDK repo: `github.com/tidal-music/tidal-sdk-ios`
- OpenAPI spec (iOS): `Sources/TidalAPI/Config/input/tidal-api-oas.json` (155 endpoints, no access tier markings)
- OpenAPI spec (Android): `tidalapi/bin/openapi_downloads/tidal-api-oas.json` (139 endpoints, v1.0.45)
- OpenAPI spec (canonical source): `https://tidal-music.github.io/tidal-api-reference/tidal-api-oas.json`
- Our spec: `references/tidal-openapi.json` (167 endpoints, v1.1.4, 92 THIRD_PARTY / 138 INTERNAL)
- Rate limit: token bucket, ~500ms between requests is safe ([Discussion #135](https://github.com/orgs/tidal-music/discussions/135))
- Rate limit is **per-client-ID**, not per-user. `Retry-After` header on 429s.

## tidal-music GitHub Org — Full Analysis (Feb 9, 2026)

### Repos Analyzed

| Repo | What it is | Useful for curator? |
|------|-----------|-------------------|
| **tidal-sdk-web** | JS/TS SDK (our dependency) | ✅ Found missing scopes: `recommendations.read` |
| **tidal-sdk-ios** | Swift SDK | ✅ Discovered available endpoints (similarTracks, radio, topHits) |
| **tidal-sdk-android** | Kotlin SDK | Same spec as iOS but older (v1.0.45 vs v1.0.54) |
| **tidal-algorithmic-mixes** | Tidal's actual recommendation pipeline (PySpark) | ✅ Algorithm insights: diversity sort, discovery mix logic |
| **per-transformers** | Common PySpark transformers | ✅ DiversitySortTransformer algorithm (gap-based spacing) |
| **tidal-sdk** | Meta docs, architecture overview | No direct use |
| **embed-player** | Embeddable web player | No use |
| **networktime** | SNTP client (TrueTime) | Already integrated |
| **eslint-config-tidal** | Linting config | No use |
| **openapi-generator** | Fork of openapi-generator | No use |
| **discussions** | Community discussions | Rate limit info |

### Key Findings

#### 1. Missing OAuth Scope: `recommendations.read`
Web SDK example uses scopes we don't have:
```
entitlements.read, collection.read, playback, playlists.write,
collection.write, recommendations.read, user.read, playlists.read
```
Our scopes: `user.read, collection.read, playlists.read, playlists.write`
**Missing:** `recommendations.read` — might be why `userRecommendations` returns empty.

#### 2. Tidal's Diversity Sort Algorithm (from `per-transformers`)
Their approach to spacing out artists in playlists:
- Partition tracks by artist AND album
- For each partition, compute `first_rank` (first appearance position)
- Apply a `gap` multiplier (default 5) to space out same-artist tracks
- Final ordering: `min(artist_rank, album_rank) + gap * max(artist_inter_rank, album_inter_rank)`
- This is more sophisticated than our simple `enforceArtistLimit` — it preserves relevance order while ensuring spacing.

#### 3. Discovery Mix Pipeline (from `tidal-algorithmic-mixes`)
How Tidal builds personalized discovery playlists:
1. Use SASRec (Self-Attentive Sequential Recommendation) ML model
2. Feed user's last 500 listened tracks as sequence
3. Generate 6,000 candidate recommendations
4. Flag known vs unknown artists
5. Distribute known-artist tracks evenly across days of week
6. Apply diversity sort (space out same artist/album)
7. Filter out already-streamed tracks and albums

#### 4. API Spec Auto-Updates
Tidal auto-generates SDK code daily from `tidal-api-reference/tidal-api-oas.json`.
Our spec (v1.1.4) matches the latest canonical source — we're current.

## Next Steps

### High Impact
- [ ] **Integrate `similarTracks`** — `discover --similar <track-id>` or `--radio <track-id>` for recommendation-based discovery
- [ ] **Integrate `topHits` search** — smarter mixed-type search (artists + tracks + albums in one query)
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
