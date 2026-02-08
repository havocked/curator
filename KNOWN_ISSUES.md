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

### 4. Album Release Year May Be Inaccurate

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
