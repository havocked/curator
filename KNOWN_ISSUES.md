# Known Issues

## Active Issues

### 1. Popularity Bias on Artist Discovery

**Severity:** High

`discover --artists` returns top tracks sorted by popularity. Requests for "deep cuts" or "experimental" work always get the biggest hits instead. `--popularity-max` can filter post-fetch, but the source pool is still the top-20-by-popularity from the API.

**Example:** "Radiohead deep cuts" returns Creep, Karma Police, No Surprises — the opposite of deep cuts.

**Workaround:** Use `--popularity-max 0.5` to exclude obvious hits. Or use `--album` / `--latest-album` for full album tracks (not popularity-sorted).

---

### 2. Label Discovery: Artist Name Matching

**Severity:** Medium

When using `discover --label "Ed Banger Records"`, MusicBrainz returns the correct artist roster, but Tidal search may fail to find some artists due to:
- Artist not in Tidal catalog
- Name variations (SebastiAn vs Sebastian)
- Silent failures (code skips unfound artists)

**Workaround:** Use `--artists` flag with verified names:
```bash
curator discover --artists "Justice,Mr. Oizo,Busy P,SebastiAn" --limit-per-artist 3
```

---

### 3. Genre Search Is Keyword-Based, Not Genre-Aware

**Severity:** Medium (mitigated)

`--genre "classical"` searches for the word "classical" in track/album/artist metadata — it doesn't filter by actual music genre. Results can include unrelated tracks (e.g., Vampire Weekend's "Classical", Gucci Mane "Classical Intro").

**Mitigation:** Use `--genre-filter` with enrichment (default on) to filter by real MusicBrainz genres after discovery. Example: `curator discover --genre "electronic" --genre-filter "house"`.

**Root cause:** Tidal's genre taxonomy is internal-only. MusicBrainz enrichment fills the gap.

---

### 4. Artist Top Tracks Capped at 20

**Severity:** Medium

Tidal's `GET /artists/{id}/relationships/tracks` ignores `page[limit]` above 20. Setting `--limit-per-artist` above 20 has no effect.

**Impact:** When combining `--artists` with filters, results can be sparse — filtering from a pool of at most 20 tracks per artist.

**Workaround:** Use `--genre` search for broader results, or use `--album`/`--latest-album` for full album content.

---

### 5. No Remaster Deduplication

**Severity:** Medium

Multiple versions of the same song can appear in results (e.g., "Blitzkrieg Bop - 1999 Remaster" and "Blitzkrieg Bop - 2016 Remaster"). Deduplication is by track ID only, not by title+artist.

**Planned fix:** Title+artist fingerprint dedup that keeps the most popular version.

---

### 6. Single-Artist Dominance in Multi-Artist Queries

**Severity:** Medium

When fetching tracks from multiple artists, if some artists timeout or return fewer results, the playlist gets dominated by one artist (e.g., 50% Norah Jones). The `--limit-per-artist` flag helps but doesn't guarantee even distribution.

**Workaround:** Use `--limit-per-artist` with a low number, or pipe through `arrange --max-per-artist 1`.

---

### 7. BPM/Key Data Sparse

**Severity:** Low

Official API v2 has BPM and key in the type schema, but many tracks return null values from Tidal. This limits the effectiveness of `arrange --arc gentle_rise`.

**No fix available yet** — depends on Tidal populating the data. External BPM providers (GetSongBPM, etc.) are a potential future mitigation.

---

### 8. Tidal Genre/Mood Tags Empty

**Severity:** Low (mitigated)

Tidal's native genre and mood (`toneTags`) fields are always empty. Genre-related API endpoints (`GET /genres`, etc.) are `INTERNAL` access tier.

**Mitigation:** MusicBrainz enrichment (default on) provides real artist genres. Use `--genre-filter` for genre-based filtering.

---

### 9. Album Release Year May Be Inaccurate

**Severity:** Low

Release year comes from the album's `releaseDate`. For tracks on reissue/compilation albums, this reflects the reissue date, not the original release. e.g., IAM's "Je danse le Mia" (1994) shows as 2006 on a "Platinum" compilation.

**No fix available** — Tidal catalog limitation. Most tracks show correct years.

---

### 10. `search` Command Limited to Favorites

**Severity:** Low

`curator search` only supports `--favorited` flag. It queries the local SQLite database, not Tidal's catalog. For catalog search, use `discover --genre`.

---

### 11. Only Primary Artist Displayed

**Severity:** Low

Multi-artist tracks only show the primary artist. Featured/credited artists are not displayed (e.g., "London Grammar" but not "London Grammar feat. SebastiAn").

**Root cause:** Only the first artist relationship is resolved in `resolveTrackMeta()`.

---

## Resolved

### ~~Python Dependency~~ ✅ (Fixed 2026-02-08)
Removed all Python/subprocess dependencies. Pure TypeScript + official SDK.

### ~~Track Artist/Album Shows "Unknown"~~ ✅ (Fixed 2026-02-08)
Batch fetch with `include: ["artists", "albums"]` resolves all metadata in one API call.

### ~~Genre Discovery Returns Off-Topic Results~~ ✅ (Fixed 2026-02-08)
Replaced playlist-based search with direct track search via `searchResults/{id}/relationships/tracks`.

### ~~Login Process Hangs After Success~~ ✅ (Fixed 2026-02-08)
Added `timeout.unref()` so Node.js exits after successful login.

### ~~Auth Scopes Mismatch~~ ✅ (Fixed 2026-02-08)
`auth.ts` had hardcoded old scopes separate from `tidalSdk.ts`. Both now use the same scope list.
