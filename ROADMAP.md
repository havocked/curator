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

### High Impact — Tidal Endpoints (confirmed working, needs integration)
- [ ] **`discover --similar <track-id>`** — `GET /tracks/{id}/relationships/similarTracks` → 20 similar tracks. Chainable: seed → similar → similar → deduplicate.
- [ ] **`discover --radio <track-id>`** — `GET /tracks/{id}/relationships/radio` → playlist of radio-style tracks. Returns a playlist ID, resolve via `/playlists/{id}/relationships/items`.
- [ ] **`discover --my-mixes`** — `GET /userRecommendations/{userId}/relationships/myMixes` → 8 personalized playlists. Requires `recommendations.read` scope.
- [ ] **`discover --discovery-mix`** — `GET /userRecommendations/{userId}/relationships/discoveryMixes` → daily discovery playlist.
- [ ] **`discover --new-arrivals`** — `GET /userRecommendations/{userId}/relationships/newArrivalMixes` → new releases matching taste.
- [ ] **Integrate `topHits` search** — `GET /searchResults/{id}/relationships/topHits` → mixed artists + tracks + albums ranked by relevance. Smarter than tracks-only search.

### High Impact — Other
- [ ] **Remaster deduplication** — fingerprint-based dedup (same title + same artist → keep one)
- [ ] **`playlist create --interactive`** — preview/reject tracks before creating
- [ ] **`--exclude-artists`** — blocklist specific artists from results
- [ ] **Port Tidal's DiversitySortTransformer** — gap-based artist/album spacing (from `per-transformers` repo). Smarter than current `enforceArtistLimit`.

### Medium Impact
- [ ] **Show all credited artists** — fix primary-artist-only display (e.g., London Grammar feat. SebastiAn)
- [ ] **Smarter skill orchestration** — SKILL.md should teach the AI agent multi-step playlist strategies
- [ ] **Tidal playlist mining** — search Tidal editorial playlists by concept, merge tracks for genre intelligence

### High Impact — Audio Feature Enrichment (exploration phase)
- [ ] **GetSongBPM + Last.fm enrichment pipeline** — Fill BPM/key gaps via GetSongBPM, add mood/flavor tags via Last.fm. Dev branch `feature/audio-enrichment`. See [Audio Feature & Mood Enrichment section](#audio-feature--mood-enrichment--external-sources) for full plan.
- [ ] **`enrich` command** — Takes track list, enriches with external metadata, outputs augmented JSON
- [ ] **`--mood` / `--vibe` filter** — Filter by Last.fm mood tags (requires enrichment above)
- [ ] **Mood-aware arrangement** — `arrange --arc` using energy/mood curve, not just BPM

### Medium-Large Features
- [ ] **`--evolution decade`** — decade walker engine
- [ ] **MusicBrainz genre enrichment** — resolve artist → MBID → genres. Enables real genre filtering. Cache in SQLite. See [MusicBrainz section](#musicbrainz--external-metadata-source) for full API reference.
- [ ] **`--genre-filter`** — filter tracks by actual genre (requires MusicBrainz enrichment above)
- [ ] **Remaster dedup via MusicBrainz release-groups** — same release-group MBID = same album → keep best version

### Won't Fix (API Limitations)
- Per-track genre/mood from Tidal (INTERNAL-only) — **mitigated** via Last.fm tags + MusicBrainz genres
- BPM/key gaps from Tidal — **mitigated** via GetSongBPM lookup
- Artist top tracks > 20 (API hard limit)
- Local audio analysis (out of scope — curator is metadata-driven)

## Audio Feature & Mood Enrichment — External Sources

Tidal's BPM/key data is sparse (many nulls) and mood data (`toneTags`) is completely broken. We solve this with a **layered lookup strategy** using external APIs — no audio analysis.

### The Problem
| Feature | Tidal Status | Impact |
|---------|-------------|--------|
| **BPM** | Sparse — many tracks return null | `arrange --arc gentle_rise` can't sort tracks without BPM; they get dumped at the end |
| **Key** | Sparse — same as BPM | `--by key` barely functional |
| **Mood/energy** | `toneTags` returns undefined on ALL tracks | No "flavor" data — can't filter or arrange by vibe |

### Enrichment Strategy (layered, no audio analysis)

```
1. Tidal native        → use when available (free, already fetched)
      ↓ miss
2. GetSongBPM API      → BPM + key lookup by artist + title
      ↓ miss
3. Last.fm tags        → mood/flavor/energy tags per track and artist
      ↓ miss
4. Graceful fallback   → track gets no features, arrange skips it
```

### Source 1: GetSongBPM (getsongbpm.com)

**What it gives:** BPM and musical key per track
**Auth:** Free API key (request at getsongbpm.com/api)
**Rate Limit:** TBD (document during exploration)
**Lookup:** By song title + artist name

**Key endpoints:**
| Endpoint | Purpose |
|----------|---------|
| `GET /search/?api_key=KEY&type=song&lookup=song+title+artist` | Search for track → get ID |
| `GET /song/?api_key=KEY&id=SONG_ID` | Get BPM + key for track |
| `GET /search/?api_key=KEY&type=artist&lookup=artist+name` | Search artist → get all songs with BPM |

**Integration plan:**
- Match Tidal track → GetSongBPM via `artist + title` fuzzy match
- Fill `audio_features.bpm` and `audio_features.key` when Tidal returns null
- Cache results in SQLite to avoid repeat lookups

**Reference:**
- API docs: https://getsongbpm.com/api
- Sister site for key: https://getsongkey.com/api

### Source 2: Last.fm (last.fm/api)

**What it gives:** Community-curated tags per track and artist — includes mood, energy, genre, and vibe descriptors
**Auth:** Free API key (register at last.fm/api/account/create)
**Rate Limit:** 5 requests/second
**Lookup:** By artist + track name (no ID cross-reference needed)

**Key endpoints:**
| Endpoint | Purpose |
|----------|---------|
| `GET /?method=track.getTopTags&artist=X&track=Y&api_key=KEY&format=json` | Tags for a specific track (e.g., `chill`, `energetic`, `melancholic`, `groovy`) |
| `GET /?method=artist.getTopTags&artist=X&api_key=KEY&format=json` | Tags for an artist (genre + mood, used as fallback) |
| `GET /?method=track.getInfo&artist=X&track=Y&api_key=KEY&format=json` | Track metadata + listener count |
| `GET /?method=tag.getTopTracks&tag=X&api_key=KEY&format=json` | Discover tracks by tag (e.g., all "chill" tracks) |

**Tag examples (mood/flavor):**
`chill`, `upbeat`, `dark`, `melancholic`, `groovy`, `energetic`, `dreamy`, `aggressive`, `romantic`, `atmospheric`, `happy`, `sad`, `danceable`, `mellow`, `intense`

**Integration plan:**
- After discovery, enrich tracks with `track.getTopTags`
- Filter tags to a curated mood vocabulary (ignore noise like "seen live", "favourites")
- Attach to track as `mood[]` / `flavor[]` field
- Enables future: `--mood chill`, `--vibe energetic`, mood-based arc arrangement
- Artist-level tags as fallback when track-level tags are sparse
- Cache in SQLite

**Reference:**
- API docs: https://www.last.fm/api
- Tag method docs: https://www.last.fm/api/show/track.getTopTags

### ❌ Ruled Out
| Source | Reason |
|--------|--------|
| **Spotify audio features** | Deprecated Nov 2024. New apps get 403. |
| **Essentia.js / local audio analysis** | Out of scope — curator is a metadata tool, not an audio processor |
| **AcousticBrainz** | Shut down 2022. Static dump data only, no new tracks. |
| **ReccoBeats** | Uses Spotify track IDs — cross-reference adds too much complexity |

### Exploration Phase (dev branch)

**Goal:** Prove the enrichment pipeline works end-to-end before integrating into main.

**Branch:** `feature/audio-enrichment`

**Steps:**
1. Get API keys (GetSongBPM + Last.fm)
2. Build `src/providers/getsongbpm.ts` — search + lookup, rate-limited client
3. Build `src/providers/lastfm.ts` — track tags + artist tags, rate-limited client
4. Create `enrich` command (or `--enrich` flag on discover):
   - Take track list (from discover output)
   - For each track missing BPM/key → try GetSongBPM
   - For each track → get Last.fm tags → extract mood vocabulary
   - Output enriched JSON
5. Test with ~20 tracks across genres:
   - How many BPM gaps does GetSongBPM fill?
   - How useful are Last.fm mood tags? (signal vs noise ratio)
   - How does `arrange --arc gentle_rise` improve with enriched BPM?
6. Document results, decide if worth merging to main

**Success criteria:**
- GetSongBPM fills >50% of Tidal's BPM gaps
- Last.fm tags provide meaningful mood signal for >60% of tracks
- Enriched arrange output is noticeably better than current sparse-BPM output

---

## MusicBrainz — External Metadata Source

**API Root:** `https://musicbrainz.org/ws/2/`
**Auth:** None required (User-Agent identification only)
**Rate Limit:** 1 request per second (our client uses 1100ms)
**Format:** JSON via `?fmt=json`
**Existing integration:** `src/providers/musicbrainz.ts` (label search + artist roster)

### Why MusicBrainz Matters for Curator
Tidal's genre/mood endpoints are INTERNAL-only. MusicBrainz is the largest open music metadata database and provides exactly what Tidal locks away: **genre tags on artists, recordings, and releases** — community-curated, free, and well-structured.

### Available Resources (13 core entities)
`area`, `artist`, `event`, `genre`, `instrument`, `label`, `place`, `recording`, `release`, `release-group`, `series`, `work`, `url`

### Key Endpoints for Curator

| Endpoint | Use Case | Example |
|----------|----------|---------|
| `GET /artist/<MBID>?inc=genres+tags` | **Genre enrichment** — get genre tags for any artist | Daft Punk → `electronic`, `french house`, `disco` |
| `GET /recording/<MBID>?inc=genres+tags` | Track-level genre tags (sparser than artist) | Per-track genre when available |
| `GET /release-group/<MBID>?inc=genres+tags` | Album-level genre tags | Year Zero → `industrial rock`, `concept album` |
| `GET /genre/all?fmt=json` | Full genre taxonomy (paginated) | Build local genre list for validation/autocomplete |
| `GET /genre/all?fmt=txt` | All genre names as newline-separated text | Quick genre list dump |
| `GET /isrc/<ISRC>` | Cross-reference Tidal tracks → MusicBrainz recordings | Bridge between catalogs if Tidal provides ISRCs |
| `GET /artist?query=<name>&fmt=json` | Search artist by name → get MBID | Needed to go from Tidal artist name → MB lookup |
| `GET /recording?query=<title> AND arid:<MBID>` | Find recording by title + artist | Match Tidal track → MB recording for genre lookup |
| `GET /release-group?artist=<MBID>` | Browse all release groups by artist | **Remaster dedup** — group releases under canonical release-group |

### Genre System
- Genres are a curated subset of user-submitted tags
- `inc=genres` returns only official genre tags; `inc=tags` returns all tags (genres + freeform)
- Both are community-curated with vote counts
- Full genre list: https://musicbrainz.org/genres
- Tags have `count` field (vote weight) — useful for confidence thresholding

### Practical Integration Points

**1. Genre Enrichment (High Value)**
Artist discovery → resolve name to MBID → `GET /artist/<MBID>?inc=genres` → attach genre tags to tracks.
Enables `--genre-filter electronic` that actually works (vs. Tidal's broken keyword search).

**2. Remaster Deduplication (High Value)**
Multiple Tidal releases of same album → lookup via MusicBrainz release-groups → same `release-group` MBID = same album → keep highest-quality/most-popular version.

**3. Genre Taxonomy for Validation**
`GET /genre/all?fmt=txt` → local cache of all valid genre names → autocomplete/validation for `--genre-filter`.

**4. Recording-Level Cross-Reference**
If Tidal exposes ISRCs: `GET /isrc/<ISRC>` → MusicBrainz recording → get tags, relationships, and canonical metadata.

### Rate Limit Strategy
- 1 req/sec hard limit (IP-based)
- Our client already enforces 1100ms between requests
- For batch operations (e.g., enriching 50 tracks): ~55 seconds per batch
- **Cache aggressively** — artist genres rarely change, cache for days/weeks
- Consider SQLite cache table: `mb_artist_genres(mbid, genres_json, fetched_at)`

### Current State in Curator
- `searchLabel(name)` — find label by name → returns MBID
- `getLabelArtists(mbid)` — get artists on a label via `recording contract` relationships
- Both already respect rate limiting

### Expansion Plan
1. `searchArtist(name)` → resolve Tidal artist name to MBID
2. `getArtistGenres(mbid)` → `GET /artist/<MBID>?inc=genres&fmt=json` → genre list
3. `getRecordingGenres(mbid)` → track-level genre tags (optional, sparser)
4. `getAllGenres()` → full genre taxonomy for local cache
5. `getReleaseGroup(mbid)` → canonical album grouping for remaster dedup
6. Local SQLite cache layer to avoid redundant API calls

### Reference
- API docs: https://musicbrainz.org/doc/MusicBrainz_API
- Search docs: https://musicbrainz.org/doc/MusicBrainz_API/Search
- Examples: https://musicbrainz.org/doc/MusicBrainz_API/Examples
- Genre list: https://musicbrainz.org/genres
- Rate limiting: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting

---

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
  ├── enrich (planned)
  │   ├── BPM + key           → Tidal native → GetSongBPM fallback
  │   ├── mood/flavor         → Last.fm track.getTopTags
  │   └── genre               → MusicBrainz artist genres
  ├── arrange       → local BPM logic (gentle_rise, flat sort)
  ├── playlist      → createPlaylist + addTracksToPlaylist
  ├── filter        → local SQLite (familiar/discovery)
  ├── search        → local SQLite (favorited tracks)
  ├── sync          → getFavoriteTracks (v2 userCollections)
  └── export        → stdout (track IDs)

External providers:
  ├── providers/musicbrainz.ts  → label search, artist roster (existing)
  ├── providers/getsongbpm.ts   → BPM + key lookup (planned)
  └── providers/lastfm.ts       → mood/flavor tags (planned)
```

## Key Technical Decisions
- **Batch fetch 50 tracks** via `GET /tracks?filter[id]=...` — URL length safe, O(1) lookup via `buildIncludedMap()`
- **Album batch max 20** via `GET /albums?filter[id]=...` — API enforced
- **Client-side sort for artist albums** — no API sort parameter available
- **Album `releaseDate` over track `createdAt`** — more accurate release year
- **stdin for playlist IDs** — Unix pipe-friendly design
- **Both auth.ts and tidalSdk.ts must share scope list** — auth login uses separate `initAuth()`
