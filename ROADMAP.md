# Curator V2 — Roadmap

*Last updated: 2026-02-08*

## Current State

**Curator is 100% TypeScript + official @tidal-music/api SDK.** Zero Python dependencies.

### ✅ Completed
- Auth flow: `curator auth login/status/logout` — SDK-native PKCE, encrypted token storage
- Artist discovery: `discover --artists` — search + top tracks with full metadata
- Label discovery: `discover --label` — MusicBrainz + SDK artist search
- Playlist discovery: `discover --playlist <id>` — fetch tracks from specific playlist
- Genre discovery: `discover --genre` — direct track search (e.g. "french electro", "latin jazz")
- Favorites sync: `sync --source tidal` — v2 userCollections API with batch fetch
- Track metadata: artist, album, release year (from album), popularity — all resolved via batch API
- Batch track fetching: `GET /tracks?filter[id]=...&include=artists,albums,genres` (50 per request)
- Arrange: `gentle_rise` BPM arc, flat sort by tempo/key, `--max-per-artist`
- Filter: `--familiar` / `--discovery` against synced favorites
- Search: query local SQLite favorites
- Export: output track IDs for piping to tidal-service
- Code quality: zero `as any` casts, SDK component types, TrueTime warnings suppressed
- 25 tests passing

### Known Limitations
- BPM and key: in SDK type schema but many tracks return null from Tidal
- Genres/mood: API fields exist but Tidal marks them INTERNAL — always empty for external apps
- Album release year may reflect reissue date, not original release (Tidal catalog limitation)

## Next Steps

### ✅ Recently Completed
- `--popularity-min` / `--popularity-max` filter (hidden gems vs. hits)
- `--year-min` / `--year-max` filter (release year range)
- 26 tests passing

### New Features
- `discover --album <id>` (fetch all tracks from a specific album — needed for complete album discovery vs top-tracks sampling)
- `curator playlist create` (write playlists to Tidal)
- `--evolution decade` (decade walker engine)

## Architecture

```
curator CLI (TypeScript)
  ├── auth         → @tidal-music/auth (PKCE, encrypted storage)
  ├── discover
  │   ├── --artists/--label  → searchArtists + getArtistTopTracks
  │   ├── --playlist         → getPlaylistTracks
  │   └── --genre/--tags     → searchTracks (direct catalog search)
  ├── arrange      → local logic (BPM arcs)
  ├── filter       → local SQLite
  ├── search       → local SQLite
  ├── sync         → getFavoriteTracks (v2 userCollections)
  └── export       → stdout
```

## Key Files
- `src/services/tidalSdk.ts` — Official SDK client (batch fetch, search, auth)
- `src/services/tidalService.ts` — HTTP service fallback (`--via service`)
- `src/services/types.ts` — Track, Artist, Playlist types
- `src/commands/discover.ts` — Track discovery logic
- `src/commands/auth.ts` — OAuth login/status/logout
- `src/services/nodeStorage.ts` — localStorage polyfill for Node.js
- `~/.config/curator/credentials.json` — Client ID/secret
- `~/.config/curator/auth-storage.json` — Encrypted SDK tokens (auto-managed)
