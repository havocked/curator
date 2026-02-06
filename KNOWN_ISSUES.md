# Known Issues

## Label Discovery: Artist Name Matching (Phase 3B)

### Issue
When using `curator discover --label "Ed Banger Records"`, MusicBrainz returns the correct artist roster, but **Tidal search fails to find many of them** due to:
1. Artist not in Tidal catalog (e.g., DSL - French trio signed to Ed Banger)
2. Name variations (SebastiAn vs Sebastian, etc.)
3. Silent failures (code skips unfound artists without warning)

### Example
```bash
curator discover --label "Ed Banger Records" --limit-per-artist 3 --limit 10
```

**MusicBrainz returned** (13 artists with recording contracts):
- Mr. Oizo ✅
- Busy P ✅
- DSL ❌ (not found on Tidal, confused with D4L Atlanta snap rap group)
- Mr. Flash ✅
- Justice ❌ (not found)
- SebastiAn ❌ (not found)
- Uffie ❌ (not found)
- DJ Mehdi, Krazy Baldhead, etc. ❌

**Tidal actually returned tracks from:**
- Skrillex (collaborator, not on roster)
- Mr. Oizo
- Busy P  
- D4L (WRONG - Atlanta snap rap, NOT Ed Banger)
- Mr. Flash

### Root Cause
`discoverByArtists()` in `src/commands/discover.ts`:
```typescript
const artists = await searchArtistsDirect({
  query: name,
  artistLimit: 1,
});

if (artists.length === 0) {
  continue;  // Silent skip - no logging
}
```

### Impact
- Users get incomplete/wrong results
- No visibility into which artists were found vs skipped
- Label showcases miss key artists

### Proposed Solutions

#### Short-term (Phase 3B.1)
1. **Add logging**: Warn when artists aren't found
   ```
   ⚠️ Artist not found on Tidal: "DSL" (skipped)
   ✅ Found 4 of 13 artists from label
   ```

2. **Summary output**: Show match rate
   ```
   Discovered 10 tracks from 4/13 Ed Banger Records artists
   Skipped: DSL, Justice, SebastiAn, Uffie, DJ Mehdi, ...
   ```

#### Medium-term (Phase 3B.2)
3. **Fuzzy matching**: Try name variations
   - "SebastiAn" → "Sebastian", "Sebastien"
   - "D.S.L." → "DSL"
   - Remove special chars, try with/without "The"

4. **ISRC bridge**: Use MusicBrainz ISRCs to find Tidal tracks directly
   - Get ISRCs from MusicBrainz recordings
   - Look up by ISRC on Tidal (if API supports it)
   - More reliable than name matching

#### Long-term (Phase 4)
5. **Artist mapping database**: Cache MusicBrainz MBID → Tidal ID mappings
6. **Multi-source discovery**: Fallback to Spotify/Apple Music APIs when Tidal fails
7. **User feedback loop**: "Did we get this right?" confirmation

### Workaround (Current)
Use `--artists` flag with manually verified names:
```bash
curator discover --artists "Justice,Mr. Oizo,Busy P,SebastiAn" --limit-per-artist 3
```

### Status
- **Severity**: Medium (functional but incomplete results)
- **Priority**: Phase 3B.1 logging improvements recommended
- **Tracking**: Created 2026-02-06
