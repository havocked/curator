# Curator Specification

## Overview

Curator is a CLI toolkit for music curation. It discovers tracks from Tidal, arranges them using audio features (BPM, key), and outputs playlist-ready track IDs.

**Key principle:** Curator outputs playlists, doesn't play them. Playback is handled by tidal-service.

---

## 🚧 NEXT TASK: Migrate to Official TIDAL SDK

### Why Migrate?

| Aspect | Current (tidalapi) | Official SDK (@tidal-music/api) |
|--------|-------------------|----------------------------------|
| Maintenance | Community-maintained | TIDAL-maintained |
| Stability | May break on API changes | Official support |
| Types | None (Python) | Full TypeScript types |
| Auth | Session file hack | Proper OAuth client credentials |
| Dependencies | Python subprocess | Pure Node.js |

### Prerequisites

1. **Register app at developer.tidal.com**
   - Get Client ID and Client Secret
   - Store in `~/.config/curator/credentials.json`

2. **Install SDK packages:**
   ```bash
   npm install @tidal-music/api @tidal-music/auth @tidal-music/common
   ```

### Migration Plan

#### Step 1: Create SDK Client Module (2 hours)

Create `src/services/tidalSdk.ts`:

```typescript
import { createAPIClient } from '@tidal-music/api';
import * as auth from '@tidal-music/auth';
import fs from 'fs';
import path from 'path';

let apiClient: ReturnType<typeof createAPIClient> | null = null;

interface Credentials {
  clientId: string;
  clientSecret: string;
}

function loadCredentials(): Credentials {
  const configPath = path.join(
    process.env.HOME || '',
    '.config/curator/credentials.json'
  );
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing credentials file: ${configPath}`);
  }
  
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

export async function initTidalClient(): Promise<void> {
  const { clientId, clientSecret } = loadCredentials();
  
  await auth.init({
    clientId,
    clientSecret,
    credentialsStorageKey: 'curator-tidal-auth',
    scopes: [],
  });
  
  apiClient = createAPIClient(auth.credentialsProvider);
}

export function getClient() {
  if (!apiClient) {
    throw new Error('Tidal client not initialized. Call initTidalClient() first.');
  }
  return apiClient;
}
```

#### Step 2: Implement API Functions (3-4 hours)

Add to `src/services/tidalSdk.ts`:

```typescript
import type { Track, Artist, Playlist } from './types';

// Country code for API requests
const COUNTRY_CODE = 'DE'; // or read from config

/**
 * Search for artists by name
 */
export async function searchArtists(
  query: string,
  limit: number = 10
): Promise<Artist[]> {
  const client = getClient();
  
  const response = await client.GET('/v2/searchresults/{query}/artists', {
    params: {
      path: { query },
      query: { countryCode: COUNTRY_CODE, limit }
    }
  });
  
  if (!response.data?.data) return [];
  
  return response.data.data.map(artist => ({
    id: parseInt(artist.id, 10),
    name: artist.attributes?.name || 'Unknown',
    picture: artist.attributes?.imageLinks?.[0]?.href || null
  }));
}

/**
 * Get artist's top tracks
 */
export async function getArtistTopTracks(
  artistId: number,
  limit: number = 10
): Promise<Track[]> {
  const client = getClient();
  
  const response = await client.GET('/v2/artists/{id}/tracks', {
    params: {
      path: { id: String(artistId) },
      query: { countryCode: COUNTRY_CODE, limit }
    }
  });
  
  if (!response.data?.data) return [];
  
  return response.data.data.map(mapTrackFromApi);
}

/**
 * Search for playlists
 */
export async function searchPlaylists(
  query: string,
  limit: number = 10
): Promise<Playlist[]> {
  const client = getClient();
  
  const response = await client.GET('/v2/searchresults/{query}/playlists', {
    params: {
      path: { query },
      query: { countryCode: COUNTRY_CODE, limit }
    }
  });
  
  if (!response.data?.data) return [];
  
  return response.data.data.map(playlist => ({
    id: playlist.id,
    title: playlist.attributes?.name || 'Unknown',
    description: playlist.attributes?.description || ''
  }));
}

/**
 * Get tracks from a playlist
 */
export async function getPlaylistTracks(
  playlistId: string,
  limit: number = 100
): Promise<Track[]> {
  const client = getClient();
  
  const response = await client.GET('/v2/playlists/{id}/items', {
    params: {
      path: { id: playlistId },
      query: { countryCode: COUNTRY_CODE, limit }
    }
  });
  
  if (!response.data?.data) return [];
  
  return response.data.data
    .filter(item => item.type === 'tracks')
    .map(item => mapTrackFromApi(item));
}

/**
 * Get track by ID (with audio features)
 */
export async function getTrack(trackId: number): Promise<Track | null> {
  const client = getClient();
  
  const response = await client.GET('/v2/tracks/{id}', {
    params: {
      path: { id: String(trackId) },
      query: { countryCode: COUNTRY_CODE }
    }
  });
  
  if (!response.data?.data) return null;
  
  return mapTrackFromApi(response.data.data);
}

/**
 * Map API response to our Track type
 */
function mapTrackFromApi(apiTrack: any): Track {
  const attrs = apiTrack.attributes || apiTrack;
  
  return {
    id: parseInt(apiTrack.id || attrs.id, 10),
    title: attrs.title || attrs.name || 'Unknown',
    artist: attrs.artists?.[0]?.name || attrs.artistName || 'Unknown',
    album: attrs.album?.title || attrs.albumName || 'Unknown',
    duration: attrs.duration || 0,
    release_year: attrs.releaseDate ? 
      new Date(attrs.releaseDate).getFullYear() : null,
    audio_features: {
      bpm: attrs.bpm || null,
      key: formatKey(attrs.key, attrs.keyScale),
    }
  };
}

function formatKey(key: string | null, scale: string | null): string | null {
  if (!key) return null;
  if (!scale) return key;
  const scaleLower = scale.toLowerCase();
  if (scaleLower === 'major' || scaleLower === 'minor') {
    return `${key} ${scaleLower}`;
  }
  return key;
}
```

#### Step 3: Create Types File (30 min)

Create `src/services/types.ts`:

```typescript
export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  release_year: number | null;
  audio_features: {
    bpm: number | null;
    key: string | null;
  };
}

export interface Artist {
  id: number;
  name: string;
  picture: string | null;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
}
```

#### Step 4: Update discover.ts (2 hours)

Replace imports and function calls in `src/commands/discover.ts`:

```typescript
// BEFORE
import { 
  searchArtistsDirect, 
  fetchArtistTopTracksDirect,
  searchPlaylistsDirect,
  fetchPlaylistTracksDirect 
} from '../services/tidalDirect';

// AFTER
import { 
  initTidalClient,
  searchArtists, 
  getArtistTopTracks,
  searchPlaylists,
  getPlaylistTracks 
} from '../services/tidalSdk';

// At command start, initialize client
await initTidalClient();
```

Update function calls:
- `searchArtistsDirect(...)` → `searchArtists(...)`
- `fetchArtistTopTracksDirect(...)` → `getArtistTopTracks(...)`
- `searchPlaylistsDirect(...)` → `searchPlaylists(...)`
- `fetchPlaylistTracksDirect(...)` → `getPlaylistTracks(...)`

#### Step 5: Update sync.ts (1 hour)

Similar pattern for favorites sync:

```typescript
// Add to tidalSdk.ts
export async function getFavorites(limit: number = 100): Promise<Track[]> {
  const client = getClient();
  
  const response = await client.GET('/v2/me/favorites/tracks', {
    params: {
      query: { countryCode: COUNTRY_CODE, limit }
    }
  });
  
  if (!response.data?.data) return [];
  
  return response.data.data.map(mapTrackFromApi);
}
```

#### Step 6: Remove Python Dependencies (30 min)

1. Delete `scripts/tidal_direct.py`
2. Delete `src/services/tidalDirect.ts`
3. Remove Python path config from `src/lib/config.ts`
4. Update `package.json` - remove any Python-related scripts

#### Step 7: Update Configuration (30 min)

Update `src/lib/config.ts`:

```typescript
interface TidalConfig {
  countryCode: string;       // NEW: e.g., "DE", "US"
  // Remove: session_path, python_path
}
```

Create credentials file template:
```bash
mkdir -p ~/.config/curator
cat > ~/.config/curator/credentials.json << 'EOF'
{
  "clientId": "YOUR_CLIENT_ID",
  "clientSecret": "YOUR_CLIENT_SECRET"
}
EOF
```

### Testing the Migration

```bash
# Build
npm run build

# Test artist search
node dist/cli.js discover --artists "Justice" --limit 5 --format json

# Test playlist discovery
node dist/cli.js discover --genre "electronic" --tags "french" --limit 10 --format json

# Test full pipeline
node dist/cli.js discover --artists "Daft Punk" --limit 10 --format json | \
  node dist/cli.js arrange --arc gentle_rise | \
  node dist/cli.js export --format tidal
```

### API Reference (Official)

**Base URL:** `https://openapi.tidal.com`

**Key Endpoints:**
- `GET /v2/artists/{id}` - Artist details
- `GET /v2/artists/{id}/tracks` - Artist top tracks
- `GET /v2/albums/{id}` - Album details
- `GET /v2/tracks/{id}` - Track details (includes BPM, key)
- `GET /v2/playlists/{id}/items` - Playlist tracks
- `GET /v2/searchresults/{query}/artists` - Search artists
- `GET /v2/searchresults/{query}/tracks` - Search tracks
- `GET /v2/searchresults/{query}/playlists` - Search playlists
- `GET /v2/me/favorites/tracks` - User favorites (requires user auth)

**Headers:**
- `Authorization: Bearer <access_token>`
- `Content-Type: application/vnd.tidal.v1+json`

**Docs:**
- SDK: https://tidal-music.github.io/tidal-sdk-web
- API: https://developer.tidal.com/documentation

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      CURATOR CLI                         │
├─────────────────────────────────────────────────────────┤
│  sync → discover → filter → arrange → validate → export │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│      MUSICBRAINZ         │    │    TIDAL OFFICIAL SDK    │
│  (labels, artists, ISRC) │    │   (@tidal-music/api)     │
└──────────────────────────┘    └──────────────────────────┘
```

---

## Data Model

### SQLite Schema

```sql
-- Core tracks table
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY,
    tidal_id INTEGER UNIQUE NOT NULL,
    title TEXT NOT NULL,
    artist_name TEXT,
    album_name TEXT,
    duration_seconds INTEGER,
    isrc TEXT,
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audio features (from Tidal API)
CREATE TABLE audio_features (
    track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
    bpm REAL,
    key TEXT,
    analyzed_at DATETIME
);

-- Extended metadata for discovered tracks
CREATE TABLE track_metadata_extended (
    track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
    release_year INTEGER,
    discovered_via TEXT,
    discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User signals (favorites, plays)
CREATE TABLE taste_signals (
    id INTEGER PRIMARY KEY,
    track_id INTEGER REFERENCES tracks(id),
    signal_type TEXT NOT NULL,
    signal_source TEXT,
    timestamp DATETIME
);
```

---

## Commands Reference

### discover

```bash
# From artists
curator discover --artists "Justice,Daft Punk" --limit-per-artist 5

# From label (via MusicBrainz)
curator discover --label "ed banger" --limit 30

# From playlist
curator discover --playlist <playlist-id> --limit 50

# From genre/tags
curator discover --genre "electronic" --tags "french,house" --limit 30

# Output formats
--format json   # Full metadata (default)
--format text   # Human-readable
--format ids    # Just track IDs
```

### arrange

```bash
# Energy arcs
curator arrange --arc gentle_rise   # Low → Peak → Low
curator arrange --arc flat          # No ordering

# Diversity constraints
curator arrange --max-per-artist 1  # One track per artist
curator arrange --max-per-artist 3  # Max 3 per artist

# Sorting
curator arrange --by tempo          # Sort by BPM
curator arrange --by key            # Sort by musical key
```

### export

```bash
# Output track IDs (space-separated)
curator export --format tidal

# Pipe to tidal-service
curator export --format tidal | xargs tidal play-fresh
```

### sync

```bash
# Sync favorites from Tidal
curator sync --source tidal --only favorites

# Dry run (no database writes)
curator sync --source tidal --dry-run
```

### search

```bash
# Search local database
curator search --favorited --limit 20 --format json
```

---

## Configuration

```yaml
# ~/.config/curator/config.yaml

tidal:
  country_code: DE  # Your Tidal country

database:
  path: ~/clawd/projects/curator/data/curator.db

musicbrainz:
  user_agent: "Curator/1.0 (your@email.com)"
  rate_limit_ms: 1000

defaults:
  limit: 50
  energy_arc: gentle_rise
  tempo_max_delta: 15
```

Credentials file (separate for security):
```json
// ~/.config/curator/credentials.json
{
  "clientId": "YOUR_TIDAL_CLIENT_ID",
  "clientSecret": "YOUR_TIDAL_CLIENT_SECRET"
}
```

---

## Success Criteria for Migration

- [ ] `npm run build` passes without Python dependencies
- [ ] `curator discover --artists "Justice"` returns tracks with BPM/Key
- [ ] `curator discover --genre "electronic"` finds playlists and tracks
- [ ] `curator sync --source tidal` syncs favorites
- [ ] Full pipeline works: discover → arrange → export
- [ ] All existing tests pass
- [ ] Python files removed: `scripts/tidal_direct.py`, `src/services/tidalDirect.ts`
