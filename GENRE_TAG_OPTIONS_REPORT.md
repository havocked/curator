# Genre, Tag & Mood Classification Options for Curator

**Research Date:** 2026-02-09  
**Purpose:** Evaluate options for enriching curator with better genre/tag/mood control beyond Tidal's internal-only APIs

## Summary

Tidal's genre and mood (`toneTags`) endpoints are **INTERNAL-only** — available to Tidal's own apps but not external developers. To provide better genre filtering and mood-based playlist creation, we need external metadata sources.

**Current roadmap includes:**
- ✅ MusicBrainz (artist genres, release-group tags)
- ✅ Last.fm (mood/flavor community tags)
- ✅ GetSongBPM (BPM + key enrichment)

This report evaluates **additional or alternative options** beyond these three.

---

## Comparison Table

| Service | What It Provides | Access/Pricing | Data Quality | Integration Effort | Recommendation |
|---------|------------------|----------------|--------------|-------------------|----------------|
| **MusicBrainz** ✅ | Artist genres, release tags, canonical release grouping | **Free**, open data, 1 req/sec | ⭐⭐⭐⭐⭐ Community-curated, high quality | Low — REST API, already integrated for labels | **KEEP** — Essential for genre enrichment |
| **Last.fm** ✅ | Track/artist mood tags (chill, energetic, dark, groovy, etc.) | **Free** API key, 5 req/sec | ⭐⭐⭐⭐ Good signal-to-noise for popular tracks, sparse for obscure | Low — REST API, tag-based filtering | **KEEP** — Best free mood/vibe source |
| **GetSongBPM** ✅ | BPM + musical key per track | **Free** API key (signup required) | ⭐⭐⭐ Decent coverage, better than Tidal's sparse data | Low — REST API, lookup by artist+title | **KEEP** — Fills Tidal's BPM gaps |
| **Cyanite.ai** | 🔥 BPM, key, mood (13 tags), genre (15 tags), subgenre (50+ tags), movement, character, instruments, energy, valence/arousal | **Paid** — GraphQL API, pricing undisclosed (contact sales) | ⭐⭐⭐⭐⭐ ML-based audio analysis, very comprehensive | Medium — Requires audio files or upload workflow | **EVALUATE** — Most comprehensive metadata, but requires audio access |
| **Discogs** | Genre, style (hierarchical), release metadata, 400-style taxonomy | **Free** API key, rate limits apply | ⭐⭐⭐⭐ Excellent for electronic/niche genres, user-curated | Low — REST API, search by artist/release | **CONSIDER** — Great for electronic/indie, complements MusicBrainz |
| **Bridge.audio** | AI-powered auto-tagging: genre, mood, vocals, instrumentation | **Paid** — Webhook delivery, pricing undisclosed | ⭐⭐⭐⭐ AI-driven, real-time integration | Medium — Requires audio files, webhook setup | **SKIP** — Too complex for metadata-only tool |
| **TheAudioDB** | Music artwork, metadata, charts (free JSON API) | **Free** API key | ⭐⭐ Limited metadata depth, focused on artwork | Low — REST API | **SKIP** — Better options exist |
| **Gracenote** | Largest music/TV/sports metadata database | **Paid** — Enterprise pricing | ⭐⭐⭐⭐⭐ Industry standard, very comprehensive | High — Complex licensing, not indie-friendly | **SKIP** — Overkill and expensive |
| **Music Story** | Music metadata curation, aggregation | **Paid** — API currently under maintenance | ⭐⭐⭐ Professional-grade | Unknown — Site down during research | **SKIP** — Unavailable |
| **OneMusicAPI** | Aggregates MusicBrainz, Discogs, Wikipedia, Acoustid | **Free** tier available | ⭐⭐⭐ Convenience wrapper around free sources | Low — REST API | **SKIP** — Just use sources directly |
| **Spotify Audio Features** ❌ | Danceability, energy, valence, acousticness, etc. | **Deprecated** Nov 2024 — new apps get 403 | N/A | N/A | **DEAD** — No longer available |
| **AcousticBrainz** ❌ | 120+ musical features (Essentia-based) | **Shut down 2022** — static data dumps only | ⭐⭐⭐ Good quality but frozen | High — 29M submissions, no new data | **SKIP** — Dead project |
| **Essentia** (local) | 120+ audio features (local analysis toolkit) | **Free**, open source (C++/Python/JS) | ⭐⭐⭐⭐⭐ Research-grade, gold standard | High — Requires local audio files, processing time | **OUT OF SCOPE** — Curator is metadata-driven, not audio processor |
| **AudD** | Music recognition API (Shazam alternative) | **Paid** — $5/1K requests | ⭐⭐⭐⭐ Good recognition | Medium — Requires audio fingerprints | **OUT OF SCOPE** — Recognition, not metadata enrichment |

---

## Deep Dive: Top Candidates

### 🥇 **MusicBrainz** (Already Planned)
**Why it matters:**  
- Largest open music metadata database
- **Genre tags on artists, recordings, and releases** — exactly what Tidal locks away
- Community-curated with vote counts (confidence scoring)
- Full genre taxonomy available: https://musicbrainz.org/genres

**Use cases for curator:**
1. **Genre enrichment** — Resolve Tidal artist → MusicBrainz MBID → genre tags → enable `--genre-filter electronic`
2. **Remaster deduplication** — Group releases under canonical release-groups (same MBID = same album)
3. **Genre taxonomy** — Build local genre list for validation/autocomplete

**API Endpoints:**
- `GET /artist/<MBID>?inc=genres+tags` — Artist genre tags
- `GET /recording/<MBID>?inc=genres+tags` — Track-level genre tags (sparser)
- `GET /release-group/<MBID>?inc=genres+tags` — Album-level genre tags
- `GET /genre/all?fmt=json` — Full genre taxonomy

**Rate limit:** 1 req/sec (IP-based) — **cache aggressively**

**Status:** ✅ Already integrated for label search, expand for genre enrichment

---

### 🥈 **Last.fm** (Already Planned)
**Why it matters:**  
- Community-curated tags per track and artist
- Includes **mood/vibe descriptors** that Tidal's `toneTags` should provide but doesn't
- Free API, 5 req/sec

**Tag examples:**
`chill`, `upbeat`, `dark`, `melancholic`, `groovy`, `energetic`, `dreamy`, `aggressive`, `romantic`, `atmospheric`, `happy`, `sad`, `danceable`, `mellow`, `intense`

**Use cases for curator:**
1. **Mood filtering** — `--mood chill`, `--vibe energetic`
2. **Mood-aware arrangement** — `arrange --arc` using energy/mood curve, not just BPM
3. **Discovery by vibe** — "Give me atmospheric indie-folk"

**API Endpoints:**
- `GET /?method=track.getTopTags&artist=X&track=Y` — Tags for specific track
- `GET /?method=artist.getTopTags&artist=X` — Artist tags (fallback)
- `GET /?method=tag.getTopTracks&tag=X` — Discover tracks by tag

**Integration plan:**
- Enrich tracks post-discovery
- Filter tags to curated mood vocabulary (ignore "seen live", "favourites")
- Cache in SQLite

**Status:** ✅ Planned in roadmap (feature/audio-enrichment branch)

---

### 🥉 **GetSongBPM** (Already Planned)
**Why it matters:**  
- Fills Tidal's sparse BPM/key data
- Free API key

**Use cases for curator:**
- Fix `arrange --arc gentle_rise` — currently breaks when tracks lack BPM
- Enable `--by key` sorting

**API Endpoints:**
- `GET /search/?api_key=KEY&type=song&lookup=song+title+artist` — Search for track
- `GET /song/?api_key=KEY&id=SONG_ID` — Get BPM + key

**Integration plan:**
- Fuzzy match Tidal track → GetSongBPM via `artist + title`
- Cache results in SQLite

**Status:** ✅ Planned in roadmap (feature/audio-enrichment branch)

---

### 🔥 **Cyanite.ai** (New Option)
**What makes it special:**  
Most comprehensive **ML-based audio analysis** via GraphQL API. Extracts 120+ features without local audio processing.

**Features:**
- **BPM** (adjusted + raw)
- **Key** (musical key enum)
- **Mood** (13 labels): aggressive, calm, chilled, dark, energetic, epic, happy, romantic, sad, scary, sexy, ethereal, uplifting
- **Genre** (15 labels): ambient, blues, classical, electronicDance, folkCountry, funkSoul, jazz, latin, metal, pop, rapHipHop, reggae, rnb, rock, singerSongwriter
- **Subgenre** (50+ labels): bluesRock, folkRock, hardRock, indieAlternative, psychedelicProgressiveRock, punk, techno, house, trap, etc.
- **Movement** (10 labels): bouncy, driving, flowing, groovy, nonrhythmic, pulsing, robotic, running, steady, stomping
- **Character** (16 labels): bold, cool, epic, ethereal, heroic, luxurious, magical, mysterious, playful, powerful, retro, sophisticated, sparkling, sparse, unpolished, warm
- **Instruments** (9 types): percussion, synth, piano, acousticGuitar, electricGuitar, strings, bass, bassGuitar, brassWoodwinds
- **Energy Level** (variable/low/medium/high)
- **Valence/Arousal** (-1 to 1)
- **Voice** (female/male/instrumental)
- **Classical Epoch** (middleAge, renaissance, baroque, classical, romantic, contemporary)
- **Musical Era** (production era tag)
- **Transformer Caption** (30-word AI-generated description)

**Pros:**
- ⭐⭐⭐⭐⭐ Most comprehensive metadata in one API
- Multi-label classification (track can be `dark` + `aggressive` simultaneously)
- Segment-wise analysis (15s temporal resolution)
- Advanced mood taxonomy beyond basic tags

**Cons:**
- 💰 **Paid** — pricing not public, contact sales
- 🎵 **Requires audio files** — upload or stream URLs (not just metadata lookup)
- 🔧 Medium integration effort — GraphQL, audio upload workflow

**Verdict:**  
🤔 **EVALUATE in Phase 2** — Incredibly powerful, but:
1. Curator is currently metadata-only (no audio handling)
2. Paid API adds cost/complexity
3. Would require architecture change (upload audio or provide URLs)

**When to reconsider:**
- If curator expands to handle audio files (e.g., local library scanning)
- If budget allows ($X/month for enrichment)
- If GetSongBPM + Last.fm prove insufficient

---

### 🎵 **Discogs** (New Option)
**Why it matters:**  
- **400-style taxonomy** from Discogs community
- Hierarchical genre/style system (Genre → Style → Substyle)
- Strong coverage for electronic, indie, experimental music
- Free API

**Use cases for curator:**
1. **Genre enrichment** (alternative to MusicBrainz) — especially strong for electronic music
2. **Style-based discovery** — "Give me 90s breakbeat" (more specific than MusicBrainz genres)
3. **Release metadata** — Label info, catalog numbers, matrix codes

**API Endpoints:**
- `GET /database/search?release_title=X&artist=Y` — Search releases
- `GET /releases/{id}` — Release details (genres, styles, tracklist)
- `GET /artists/{id}` — Artist info
- Search by genre, style, year, format, catalog number, barcode

**Discogs Genre Hierarchy Example:**
```
Electronic
  ├─ House
  │   ├─ Deep House
  │   ├─ Tech House
  │   ├─ Progressive House
  ├─ Techno
  │   ├─ Minimal Techno
  │   ├─ Detroit Techno
  ├─ Drum n Bass
      ├─ Liquid Funk
      ├─ Neurofunk
```

**Pros:**
- Free API
- Excellent for electronic/indie/experimental genres
- User-curated (like MusicBrainz)
- **400-style taxonomy** — more granular than MusicBrainz

**Cons:**
- Requires cross-referencing (Tidal artist → Discogs artist)
- Coverage weaker for mainstream pop/rock
- No mood/vibe tags (just genre/style)

**Verdict:**  
✅ **CONSIDER as MusicBrainz complement** — Use Discogs for electronic/indie, MusicBrainz for everything else

**Integration plan:**
- Match Tidal artist → Discogs artist
- Fetch top releases → extract genres/styles
- Cache in SQLite (`discogs_artist_styles` table)
- Combine with MusicBrainz genres for comprehensive coverage

---

## Taxonomy Comparison

| Source | Genre Count | Mood/Vibe Tags | Granularity | Strengths |
|--------|-------------|----------------|-------------|-----------|
| **Tidal** | ❌ Internal-only | ❌ `toneTags` broken | N/A | N/A |
| **MusicBrainz** | ~1,500 genres | ✅ Community tags (broad) | Medium | Open, comprehensive, all genres |
| **Last.fm** | ❌ (uses tags) | ✅ Best free mood tags | High (per track) | Crowd-sourced, mood-focused |
| **Cyanite.ai** | 15 + 50 subgenres | ✅ 13 moods + movement + character | Very High (ML) | ML accuracy, segment-wise |
| **Discogs** | 400 styles | ❌ No mood tags | Very High (hierarchical) | Electronic/indie/experimental |
| **GetSongBPM** | ❌ | ❌ | N/A | BPM + key only |

---

## Recommended Strategy

### Phase 1: Free Metadata Stack (Current Roadmap)
**Goal:** Solve 80% of use cases with free APIs

```
MusicBrainz → Artist genres (rock, electronic, jazz)
     ↓
Last.fm → Mood/vibe tags (chill, energetic, dark)
     ↓
GetSongBPM → BPM + key (fill Tidal gaps)
     ↓
Curator SQLite → Cache all enriched metadata
```

**Use cases enabled:**
- `--genre-filter electronic` (real genre, not keyword)
- `--mood chill` (Last.fm tags)
- `--vibe energetic` (Last.fm tags)
- `arrange --arc gentle_rise` (BPM-complete)
- Remaster deduplication (MusicBrainz release-groups)

**Cost:** $0  
**Integration effort:** Low (REST APIs, no audio files)

---

### Phase 2: Evaluate Discogs (Optional)
**Goal:** Improve electronic/indie genre granularity

**When:**
- Phase 1 deployed and tested
- Users request better electronic subgenre filtering
- Budget allows additional API integration time

**Integration:**
- Add Discogs artist search → style enrichment
- Combine MusicBrainz + Discogs genres (OR logic: match either)
- New filter: `--style "deep house"` (Discogs-specific)

**Cost:** $0 (free API)  
**Effort:** Medium (new provider module, cache schema)

---

### Phase 3: Evaluate Cyanite.ai (If Budget Allows)
**Goal:** Maximum metadata quality for premium use cases

**When:**
- Curator expands to handle audio files (local library scanning)
- Budget available for paid API ($X/month)
- Phase 1+2 prove insufficient for advanced mood-based curation

**Integration:**
- Add audio upload/URL workflow
- Store Cyanite features in SQLite
- Enable advanced filters: `--movement groovy`, `--character ethereal`, `--energy-level high`
- Mood-aware arrangement using valence/arousal scores

**Cost:** 💰 Contact Cyanite for pricing  
**Effort:** High (audio handling, GraphQL client, new schema)

---

## What NOT to Use

| Service | Reason to Skip |
|---------|---------------|
| **Spotify Audio Features** | Deprecated Nov 2024 — new apps blocked |
| **AcousticBrainz** | Shut down 2022 — no new data |
| **Essentia** (local) | Out of scope — curator is metadata-driven, not audio processor |
| **Bridge.audio** | Requires audio files + webhook setup — too complex |
| **Gracenote** | Enterprise-only, expensive, overkill |
| **Music Story** | API down/under maintenance |
| **OneMusicAPI** | Just a wrapper — use MusicBrainz/Discogs directly |
| **AudD** | Music recognition, not metadata enrichment |

---

## Action Items

### Immediate (Roadmap Phase 1)
1. ✅ Continue MusicBrainz integration (genre enrichment)
2. ✅ Implement Last.fm provider (mood/vibe tags)
3. ✅ Implement GetSongBPM provider (BPM/key enrichment)
4. ✅ Create `enrich` command (or `--enrich` flag on discover)
5. ✅ Test with ~20 tracks across genres
6. ✅ Document success criteria in ROADMAP.md

### Future (Phase 2+)
1. ⏸️ Evaluate Discogs for electronic/indie granularity
2. ⏸️ Prototype Cyanite.ai integration if curator adds audio handling
3. ⏸️ User feedback: which genres/moods need better coverage?

---

## References

- **Cyanite.ai API Docs:** https://api-docs.cyanite.ai/docs/audio-analysis-v6-classifier/
- **MusicBrainz API:** https://musicbrainz.org/doc/MusicBrainz_API
- **Last.fm API:** https://www.last.fm/api
- **GetSongBPM API:** https://getsongbpm.com/api
- **Discogs API:** https://www.discogs.com/developers
- **GitHub Music APIs List:** https://gist.github.com/0xdevalias/eba698730024674ecae7f43f4c650096
- **Soundcharts Music API Guide:** https://soundcharts.com/en/blog/music-data-api

---

**Summary:**  
Stick with **MusicBrainz + Last.fm + GetSongBPM** (free stack) for Phase 1. Consider **Discogs** for electronic subgenres in Phase 2. Evaluate **Cyanite.ai** only if curator expands to handle audio files and budget allows.
