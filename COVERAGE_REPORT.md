# Audio Features Coverage Report

**Date:** February 6, 2026  
**Source:** Tidal API  
**Sample:** First 50 favorite tracks  

---

## Summary

| Metric | Count | Percentage |
|--------|-------|------------|
| **Total tracks checked** | 50 | 100% |
| **Has BPM** | 47 | 94.0% |
| **Has Key** | 44 | 88.0% |
| **Has BOTH (BPM + Key)** | 44 | 88.0% |
| **Has NEITHER** | 3 | 6.0% |
| **Usable** (at least one feature) | 47 | 94.0% |

---

## Conclusion

✅ **EXCELLENT COVERAGE** - Tidal provides audio features for 94% of tracks!

Much better than expected. We can build smart playlists with Tidal data alone.

---

## Tracks Without Data

Only 3 tracks (6%) have no audio features:

1. **Orelsan** - Encore une fois (ISRC: FR9W12551649)
2. **Bree Tranter** - Tuesday Fresh Cuts (ISRC: AUOAF1500007)
3. **Billie Eilish** - when the party's over (ISRC: USUM71917724)

---

## Recommendation

### Primary Strategy: **Tidal-First**

Use Tidal audio features (BPM, Key) as primary data source:
- 88% of tracks have complete data
- 94% have at least BPM (sufficient for tempo-based arrangement)
- No external API dependencies needed

### Fallback Strategy: **Spotify for Gaps**

For the 6% without data:
- Match via ISRC to Spotify
- Fetch audio features from Spotify API
- Cache in database for future use

### Not Needed Initially:
- Local audio analysis (Essentia)
- Always-on Spotify integration

---

## Implementation Plan

### Phase 1: Use What We Have (2-3 hours)
1. Add BPM/Key extraction from Tidal to sync command
2. Store in database during sync
3. Implement `arrange --arc gentle_rise` using Tidal BPM data
4. Ship working smart playlists

### Phase 2: Fill Gaps (Optional, 2-3 hours)
1. Add Spotify integration for tracks without Tidal features
2. Match via ISRC
3. Supplement database with Spotify audio features

### Phase 3: Advanced Features (Future)
1. Add energy, danceability, valence from Spotify
2. Implement more sophisticated arrangement algorithms
3. Add mood/genre-based filtering

---

## Sample Data

Example tracks with full data:

| Artist | Track | BPM | Key |
|--------|-------|-----|-----|
| Pouya | 1000 Rounds | 150 | F |
| Kokoroko | Abusey Junction | 83 | B |
| John Moreland | A Thought is Just a Passing Train | 89 | A |
| George Ezra | Barcelona | 94 | Bb |
| Soundgarden | Black Hole Sun | 106 | G |
| RÜFÜS DU SOL | Innerbloom | 122 | Eb |
| Billie Eilish | Lost Cause | 75 | Bb |
| Boards of Canada | Roygbiv | 84 | D |

Wide range of BPMs (56-172), diverse keys - good material for intelligent arrangement!
