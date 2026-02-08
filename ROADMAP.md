# Curator V2 — Roadmap

*Last updated: 2026-02-08*

## Current State

**Curator is 100% TypeScript + official @tidal-music/api SDK.** Zero Python dependencies.

### ✅ Completed
- Auth flow: `curator auth login/status/logout` — SDK-native PKCE, encrypted token storage
- Artist discovery: `discover --artists` — SDK search + top tracks
- Label discovery: `discover --label` — MusicBrainz + SDK artist search
- Playlist discovery: `discover --playlist <id>` — SDK `getPlaylistTracks`
- Genre/tags discovery: `discover --genre/--tags` — SDK `searchPlaylists` + `getPlaylistTracks`
- Favorites sync: `sync --source tidal` — SDK `getFavoriteTracks` (v2 userCollections API)
- Arrange: `gentle_rise` BPM arc, flat sort by tempo/key, `--max-per-artist`
- Filter: `--familiar` / `--discovery` against synced favorites
- Search: query local SQLite favorites
- Export: output track IDs for piping to tidal-service
- Code quality: zero `as any` casts, uses SDK component types, TrueTime warnings suppressed
- Python removal: deleted `tidal_direct.py`, `tidalDirect.ts`, cleaned all references
- 25 tests passing

### Known Limitations
- Artist/album show "Unknown" on playlist/genre/favorites discovery (relationship not resolved)
- BPM and key: in SDK type schema but many tracks return null from Tidal
- `release_year` uses `createdAt` (catalog addition date), not actual album release date

## Git Log (Recent)
```
ece0748 feat: remove Python dependency, pure SDK for all Tidal access (Steps 5+6)
cc3a55b refactor: migrate playlist discovery from Python to SDK (Steps 3+4)
2125f4b refactor: remove all `as any` casts, use SDK types properly
8b259f2 feat: SDK-native auth + artist discovery via official Tidal API
e012e07 Clean up documentation, prepare for SDK migration
```

## Next Steps

### Step 7: Resolve Artist & Album on Tracks
**What:** When fetching tracks, use `include: ["artists", "albums"]` to get real names + release dates.
**Impact:** Fixes "Unknown" everywhere, gives accurate release_year from album metadata.
**Test:**
```bash
node dist/cli.js discover --genre "electronic" --tags "french" --limit 5 --format json
# Should show real artist & album names
```

### Step 8+: New Features
- `--year-range` filter (e.g. `--year-range 1990-2000`)
- `--popularity-max` filter (hidden gems)
- `curator playlist create` (write playlists to Tidal)
- `--evolution decade` (decade walker engine)

## Architecture

```
curator CLI (TypeScript)
  ├── auth         → @tidal-music/auth (PKCE, encrypted storage)
  ├── discover
  │   ├── --artists/--label  → tidalSdk.ts (official SDK) ✅
  │   ├── --playlist         → tidalSdk.ts (official SDK) ✅
  │   └── --genre/--tags     → tidalSdk.ts (official SDK) ✅
  ├── arrange      → local logic (BPM arcs)
  ├── filter       → local SQLite
  ├── search       → local SQLite
  ├── sync         → tidalSdk.ts (official SDK) ✅
  └── export       → stdout
```

## Key Files
- `src/services/tidalSdk.ts` — Official SDK client (typed, no `as any`)
- `src/services/tidalService.ts` — HTTP service client (for `--via service` fallback)
- `src/commands/discover.ts` — Track discovery logic
- `src/commands/auth.ts` — OAuth login/status/logout
- `src/services/nodeStorage.ts` — localStorage polyfill for Node.js
- `~/.config/curator/credentials.json` — Client ID/secret
- `~/.config/curator/auth-storage.json` — Encrypted SDK tokens
