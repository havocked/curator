# Known Issues

## Active Issues

### 1. Label Discovery: Artist Name Matching

**Severity:** Medium

When using `curator discover --label "Ed Banger Records"`, MusicBrainz returns the correct artist roster, but Tidal search may fail to find some artists due to:
- Artist not in Tidal catalog
- Name variations (SebastiAn vs Sebastian)
- Silent failures (code skips unfound artists)

**Workaround:** Use `--artists` flag with verified names:
```bash
curator discover --artists "Justice,Mr. Oizo,Busy P,SebastiAn" --limit-per-artist 3
```

**Planned fix:** Add logging for skipped artists and fuzzy name matching.

---

### 2. BPM/Key Data Sparse

**Severity:** Low

Official API v2 has BPM and key in the type schema, but many tracks return null values from Tidal. This limits the effectiveness of `arrange --arc gentle_rise`.

**No fix available** — depends on Tidal populating the data.

---

### 3. Genres/Mood Tags Empty

**Severity:** Low

Track genres and mood (toneTags) fields are always empty. The genre-related API endpoints (`GET /genres`, `GET /tracks/{id}/relationships/genres`) are marked `INTERNAL` access tier — available to Tidal's own apps but not to external developers.

**Impact:** None for discovery — `--genre` uses direct track search which works great. The empty fields don't affect functionality.

---

### 4. Artist Top Tracks Capped at 20

**Severity:** Medium

Tidal's `GET /artists/{id}/relationships/tracks` ignores the `page[limit]` parameter and always returns a maximum of 20 tracks. Setting `--limit-per-artist` above 20 has no effect.

**Impact:** When combining `--artists` with filters (`--popularity-min/max`, `--year-min/max`), results can be sparse — you're filtering from a pool of at most 20 tracks per artist.

**Workaround:** Use `--genre` search for broader results, or combine multiple artists to increase the pool.

**No fix available** — Tidal API hard limit.

---

### 5. Genre Search Is Keyword-Based, Not Genre-Aware

**Severity:** Medium

`--genre "classical"` searches for the word "classical" in track/album/artist metadata — it doesn't filter by actual music genre. This means results often include unrelated tracks (e.g. Vampire Weekend's "Classical", Gucci Mane "Classical Intro").

**Workaround:** Use more specific terms (`"beethoven sonata"` instead of `"classical"`) or use `--artists` for precise results.

**Root cause:** Tidal's genre taxonomy is internal-only (see issue #3). The search endpoint is all we have.

---

### 6. Album Release Year May Be Inaccurate

**Severity:** Low

Release year comes from the album's `releaseDate` field. For tracks on reissue/compilation albums, this reflects the reissue date, not the original release. e.g. IAM's "Je danse le Mia" (originally 1994) shows as 2006 because the track is on a "Platinum" compilation.

**No fix available** — Tidal catalog limitation. Most tracks show correct years.

---

## Resolved

### ~~Python Dependency~~ ✅ (Fixed 2026-02-08)
Removed all Python/subprocess dependencies. Pure TypeScript + official SDK.

### ~~Track Artist/Album Shows "Unknown"~~ ✅ (Fixed 2026-02-08)
Batch fetch with `include: ["artists", "albums"]` resolves all metadata in one API call.

### ~~Genre Discovery Returns Off-Topic Results~~ ✅ (Fixed 2026-02-08)
Replaced playlist-based search with direct track search via `searchResults/{id}/relationships/tracks`.
