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

### 2. Python Dependency (BLOCKING)

**Severity:** High

Current implementation uses Python subprocess to call `tidalapi`. This creates:
- Extra runtime dependency (Python + venv)
- Subprocess overhead
- Session file management complexity

**Status:** Active migration to official `@tidal-music/api` SDK. See [SPEC.md](./SPEC.md).

---

### 3. No Year Range Filtering

**Severity:** Medium

Cannot filter discovery by release year. Requests like "80s classics" or "2024 releases" require manual filtering.

**Workaround:** Discover more tracks, then filter JSON output by `release_year` field.

**Planned fix:** Add `--year-range 1980-1990` flag to discover command.

---

## Resolved Issues

### ✅ Artist Discovery
Fixed in Phase 3A. Can now discover via `--artists "Name1,Name2"`.

### ✅ Diversity Constraints  
Fixed in Phase 3C. Use `--max-per-artist N` in arrange command.

### ✅ Label Discovery
Fixed in Phase 3B. Uses MusicBrainz for label → artist lookup.
