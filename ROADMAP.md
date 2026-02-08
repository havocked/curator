# Curator V2 — Where You Are & What's Next

## Current State (What's Built & Working)

**✅ Committed (on `main`):**
- `discover` — playlist search, artist search, label search (MusicBrainz)
- `arrange` — `gentle_rise` BPM arc, flat sort by tempo/key, `--max-per-artist` diversity
- `filter` — `--familiar` / `--discovery` (against synced favorites)
- `search` — query local SQLite favorites
- `export` — output track IDs for piping to tidal-service
- `sync` — sync favorites via Python subprocess
- 25 tests, all passing
- Full pipeline works: `discover | arrange | export`

**🚧 Uncommitted (work-in-progress):**
- `auth login/status` command (PKCE + local redirect flow) — code written, not tested end-to-end
- `tidalSdk.ts` — official SDK client with search, artist tracks, playlists — code written
- `nodeStorage.ts` — localStorage polyfill for Node.js
- `types.ts` — Track/Artist/Playlist interfaces
- SDK packages installed (`@tidal-music/api`, `@tidal-music/auth`, `@tidal-music/common`)
- `credentials.json` exists (client ID registered)
- **No `user-tokens.json`** — auth flow hasn't been run yet

**⚠️ The Hybrid Problem:**
Right now `discover` uses a **mix** of both systems:
- `--artists` and `--label` → go through the **new SDK** (`tidalSdk.ts`)
- `--playlist` and `--genre/tags` → still use the **old Python** subprocess (`tidalDirect.ts`)
- `sync` → 100% old Python subprocess

---

## SSD V2 Gap Analysis

| SSD V2 Feature | Current Status | Gap |
|---|---|---|
| **Phase 1: SDK Auth** | Auth command written, SDK installed, credentials exist | Never tested. No user tokens. Need end-to-end verification |
| **Phase 2.1: Search Migration** | Artist search done via SDK. Playlist search still Python | Playlist search + playlist tracks need SDK migration |
| **Phase 2.2: Audio Features** | Track mapping exists but BPM/Key may not come from SDK | Need to verify SDK returns audio features |
| **Phase 2.3: Remove Python** | Python still used by playlist discovery + sync | Can't remove until all paths migrated |
| **Phase 3.1: Decade Walker** | Not started | New `--year-range` / `--evolution decade` logic |
| **Phase 3.2: Genre Blender** | Not started | New `blend` command with Related Artists graph |
| **Phase 3.3: Hidden Gems** | Not started | New `--popularity-max` filter |
| **Phase 4.1: Playlist Create** | Not started | New `playlist create` command (write to Tidal) |
| **Phase 4.2: History Enrichment** | `filter --discovery` exists (partial) | Need user history pull + negative seeding |

---

## Testable Steps (In Order)

### Step 1: Verify Auth Flow ⬅️ START HERE
**What:** Run `curator auth login`, complete the browser flow, get tokens saved.
**Test:**
```bash
cd ~/clawd/projects/curator
node dist/cli.js auth login
# → Browser opens, you log in, tokens save
node dist/cli.js auth status
# → ✅ Logged in
```
**Commit message:** `feat: verify OAuth auth flow works end-to-end`

**Why first:** Everything else depends on having valid user tokens. If this doesn't work, nothing else will.

---

### Step 2: Verify SDK Search Actually Works
**What:** With valid tokens, test that `discover --artists` returns real data through the SDK.
**Test:**
```bash
node dist/cli.js discover --artists "Justice" --limit-per-artist 3 --format json
# → Should return tracks with titles, artists, albums
# → Check: do tracks have audio_features.bpm and audio_features.key?
```
**If BPM/Key are null:** The V2 API might not return them directly. We'd need to check if there's a separate endpoint or if the track attributes include them. This is a critical data point for the arrange command.

**Commit message:** `test: verify SDK artist discovery returns tracks with audio features`

---

### Step 3: Migrate Playlist Search to SDK
**What:** Replace `searchPlaylistsDirect` (Python) with SDK-native `searchPlaylists` in discover.ts.
**Changes:**
- In `discover.ts`, replace the genre/tags path to use `searchPlaylists()` and `getPlaylistTracks()` from `tidalSdk.ts`
- Remove `sessionPath`/`pythonPath` from the genre/tags code path
**Test:**
```bash
node dist/cli.js discover --genre "electronic" --tags "french" --limit 10 --format json
# → Should return tracks from Tidal playlists, no Python involved
```
**Commit message:** `refactor: migrate playlist discovery from Python to SDK`

---

### Step 4: Migrate Playlist-by-ID to SDK
**What:** Replace `fetchPlaylistTracksDirect` (Python) with SDK-native `getPlaylistTracks`.
**Test:**
```bash
# Get a known playlist ID first
node dist/cli.js discover --genre "soul" --limit 5 --format json | jq '.query.playlists[0]'
# Then test direct playlist fetch
node dist/cli.js discover --playlist <that-id> --limit 10 --format json
```
**Commit message:** `refactor: migrate playlist-by-id from Python to SDK`

---

### Step 5: Migrate Sync to SDK
**What:** Replace `fetchFavoritesDirect` (Python) with SDK-native favorites fetch.
**Changes:**
- Add `getFavorites()` to `tidalSdk.ts`
- Update `sync.ts` to use it instead of `fetchFavoritesDirect`
**Test:**
```bash
node dist/cli.js sync --source tidal --dry-run
# → Should show favorites count
node dist/cli.js sync --source tidal
# → Should sync to SQLite
node dist/cli.js search --favorited --limit 5 --format json
# → Should show synced tracks
```
**Commit message:** `refactor: migrate favorites sync from Python to SDK`

---

### Step 6: Delete Python 🎉
**What:** Remove all Python dependencies.
**Delete:**
- `scripts/tidal_direct.py`
- `src/services/tidalDirect.ts`
- Remove `session_path`/`python_path` from config
- Remove `--session-path`/`--python-path` CLI options
- Clean up imports
**Test:**
```bash
npm run build  # Zero errors
npm test        # All tests pass
grep -r "python\|tidal_direct\|tidalDirect" src/  # Nothing
# Full pipeline
node dist/cli.js discover --artists "Daft Punk" --limit 5 --format json | \
  node dist/cli.js arrange --arc gentle_rise | \
  node dist/cli.js export --format tidal
```
**Commit message:** `feat!: remove Python dependency, 100% TypeScript`

---

### Step 7: Add `--year-range` Filter (Decade Walker foundation)
**What:** Add release year filtering to discover output.
**Changes:**
- Add `--year-range 1990-1999` option to discover
- Filter tracks by `release_year` after fetching
**Test:**
```bash
node dist/cli.js discover --artists "IAM,MC Solaar,NTM" --limit-per-artist 10 \
  --year-range 1990-1999 --format json | jq '[.tracks[].release_year] | unique'
# → All years should be 1990-1999
```
**Commit message:** `feat: add --year-range filter to discover`

---

### Step 8: Add `--popularity-max` Filter (Hidden Gems)
**What:** Filter by track popularity to find deep cuts.
**Changes:**
- Check if SDK returns popularity score
- Add `--popularity-max` flag to discover
**Test:**
```bash
node dist/cli.js discover --artists "Justice" --popularity-max 30 --format json
# → Only tracks with low popularity scores
```
**Commit message:** `feat: add --popularity-max filter for hidden gems`

---

### Step 9: Playlist Creation (Write to Tidal)
**What:** New `curator playlist create` command that creates a playlist on Tidal.
**Changes:**
- Add `createPlaylist()` and `addTracksToPlaylist()` to `tidalSdk.ts`
- New command: accepts track IDs from stdin
**Test:**
```bash
node dist/cli.js discover --artists "Justice,Daft Punk" --limit 10 --format json | \
  node dist/cli.js arrange --arc gentle_rise | \
  node dist/cli.js playlist create --name "French Electronic Test"
# → Playlist appears in your Tidal account
```
**Commit message:** `feat: add playlist create command (write to Tidal)`

---

### Step 10: Decade Walker Engine
**What:** `--evolution decade` flag that auto-queries across decades.
**Changes:**
- New logic in discover: split into 4 decade queries
- Unique artist constraint across all decades
**Test:**
```bash
node dist/cli.js discover --genre "French Hip Hop" --evolution decade \
  --limit 20 --format json | jq '[.tracks[].release_year]'
# → Mix of 90s, 00s, 10s, 20s tracks
```
**Commit message:** `feat: add decade evolution engine`

---

## Summary: The Critical Path

```
Step 1: Auth ──→ Step 2: Verify SDK ──→ Steps 3-5: Migrate all to SDK
                                              │
                                              ▼
                                        Step 6: Delete Python 🎉
                                              │
                                              ▼
                               Steps 7-10: New features (any order)
```

**Steps 1-2 are your immediate next action.** Everything else is blocked on confirming the auth flow actually works and the SDK returns usable data (especially BPM/Key).
