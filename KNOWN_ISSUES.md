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

### 2. Track Artist/Album Shows "Unknown"

**Severity:** Medium

Tracks from playlist/genre/favorites discovery show "Unknown" for artist and album.
Artist discovery (`--artists`) has the artist name as fallback but album is still "Unknown".

**Root cause:** Tidal v2 API uses JSON:API format — track resources only contain IDs for artist/album relationships. Need to `include` those relationships or fetch them separately.

**Planned fix:** Step 7 — add `include: ["artists", "albums"]` to track fetches.

---

### 3. Inaccurate Release Year

**Severity:** Low

`release_year` uses `createdAt` from track attributes, which is when the track was added to Tidal's catalog, not the actual release date. e.g. IAM's "Je danse le Mia" (1994) shows as 2008.

**Planned fix:** Resolve album relationship and use album release date instead.

---

### 4. BPM/Key Data Sparse

**Severity:** Low

Official API v2 has BPM and key in the type schema, but many tracks return null values from Tidal. This limits the effectiveness of `arrange --arc gentle_rise`.

**No fix available** — depends on Tidal populating the data.

---

## Resolved

### ~~Python Dependency~~ ✅ (Fixed 2026-02-08)
Removed all Python/subprocess dependencies. Curator is now 100% TypeScript + official SDK.
