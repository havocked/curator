# Curator V2 — Where You Are & What's Next

*Last updated: 2026-02-08*

## Current State

**✅ Completed & Pushed:**
- Auth flow: `curator auth login/status/logout` — SDK-native PKCE, encrypted token storage
- Artist discovery: `discover --artists` uses official Tidal SDK (no Python)
- Label discovery: `discover --label` uses MusicBrainz + SDK artist search
- Arrange: `gentle_rise` BPM arc, flat sort by tempo/key, `--max-per-artist`
- Filter: `--familiar` / `--discovery` against synced favorites
- Search: query local SQLite favorites
- Export: output track IDs for piping to tidal-service
- Code quality: zero `as any` casts, uses SDK component types properly
- 25 tests passing, full pipeline works

**⚠️ Still Uses Python (tidalDirect.ts):**
- `discover --playlist <id>` — fetches playlist tracks via Python subprocess
- `discover --genre/--tags` — searches playlists via Python subprocess
- `sync --source tidal` — syncs favorites via Python subprocess

**Known Limitations:**
- Official API v2 has BPM and key in the type schema, but some tracks return null
- `release_year` uses `createdAt` (when track was added to Tidal) not actual release date
- Album name shows "Unknown" (requires extra API call to resolve album relationship)

## Git Log
```
2125f4b refactor: remove all `as any` casts, use SDK types properly
8b259f2 feat: SDK-native auth + artist discovery via official Tidal API
e012e07 Clean up documentation, prepare for SDK migration
```

## Next Steps (In Order)

### Step 3: Migrate Playlist Search to SDK
**What:** Replace `searchPlaylistsDirect` (Python) with `searchPlaylists` from `tidalSdk.ts` in the genre/tags discovery path.
**File:** `src/commands/discover.ts` — the `else` branch (genre/tags path) still imports and calls `searchPlaylistsDirect` and `fetchPlaylistTracksDirect`.
**Test:**
```bash
node dist/cli.js discover --genre "electronic" --tags "french" --limit 10 --format json
```

### Step 4: Migrate Playlist-by-ID to SDK
**What:** Replace `fetchPlaylistTracksDirect` with `getPlaylistTracks` from `tidalSdk.ts`.
**Test:**
```bash
node dist/cli.js discover --playlist <playlist-id> --limit 10 --format json
```

### Step 5: Migrate Sync to SDK
**What:** Add `getFavorites()` to `tidalSdk.ts`, update `sync.ts` to use it.
**Test:**
```bash
node dist/cli.js sync --source tidal --dry-run
```

### Step 6: Delete Python 🎉
**What:** Remove `scripts/tidal_direct.py`, `src/services/tidalDirect.ts`, remove Python config from `src/lib/config.ts`.
**Test:**
```bash
npm run build   # Zero errors
npm test         # All pass
grep -r "python\|tidal_direct\|tidalDirect" src/  # Nothing
```

### Step 7+: New Features
- `--year-range` filter
- `--popularity-max` filter (hidden gems)
- `curator playlist create` (write to Tidal)
- `--evolution decade` (decade walker engine)

## Architecture

```
curator CLI (TypeScript)
  ├── auth         → @tidal-music/auth (PKCE, encrypted storage)
  ├── discover
  │   ├── --artists/--label  → tidalSdk.ts (official SDK) ✅
  │   ├── --playlist         → tidalDirect.ts (Python) ⚠️ NEXT
  │   └── --genre/--tags     → tidalDirect.ts (Python) ⚠️ NEXT
  ├── arrange      → local logic (BPM arcs)
  ├── filter       → local SQLite
  ├── search       → local SQLite
  ├── sync         → tidalDirect.ts (Python) ⚠️ NEXT
  └── export       → stdout
```

## Key Files
- `src/services/tidalSdk.ts` — Official SDK client (typed, no `as any`)
- `src/services/tidalDirect.ts` — Legacy Python subprocess (TO BE REMOVED)
- `src/commands/discover.ts` — Main discovery logic (hybrid state)
- `src/commands/auth.ts` — OAuth login/status/logout
- `src/services/nodeStorage.ts` — localStorage polyfill for Node.js
- `~/.config/curator/credentials.json` — Client ID/secret
- `~/.config/curator/auth-storage.json` — Encrypted SDK tokens
