import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import { normalizeFavoritesResponse, type FavoritesResponse } from "./tidalService";

const execFileAsync = promisify(execFile);

export type DirectTidalOptions = {
  sessionPath: string;
  pythonPath: string;
  limit?: number;
};

export function resolveHelperPath(): string {
  return path.resolve(__dirname, "..", "..", "scripts", "tidal_direct.py");
}

export async function fetchFavoritesDirect(
  options: DirectTidalOptions
): Promise<FavoritesResponse> {
  const helperPath = resolveHelperPath();
  const args = [
    helperPath,
    "--session-path",
    options.sessionPath,
    "--limit",
    String(options.limit ?? 50),
  ];

  try {
    const { stdout } = await execFileAsync(options.pythonPath, args, {
      maxBuffer: 10 * 1024 * 1024,
    });
    const payload = JSON.parse(stdout);
    return normalizeFavoritesResponse(payload);
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: string }).stderr ?? error.message)
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`Direct Tidal sync failed: ${message.trim()}`);
  }
}

export async function fetchPlaylistTracksDirect(
  options: DirectTidalOptions & { playlistId: string }
): Promise<{ playlist_id: string; count: number; tracks: FavoritesResponse["favorites"]["tracks"] }> {
  const helperPath = resolveHelperPath();
  const args = [
    helperPath,
    "--session-path",
    options.sessionPath,
    "--limit",
    String(options.limit ?? 50),
    "--playlist-id",
    options.playlistId,
  ];

  try {
    const { stdout } = await execFileAsync(options.pythonPath, args, {
      maxBuffer: 10 * 1024 * 1024,
    });
    const payload = JSON.parse(stdout) as {
      playlist_id?: string;
      count?: number;
      tracks?: FavoritesResponse["favorites"]["tracks"];
    };
    return {
      playlist_id: payload.playlist_id ?? options.playlistId,
      count: Array.isArray(payload.tracks) ? payload.tracks.length : 0,
      tracks: Array.isArray(payload.tracks) ? payload.tracks : [],
    };
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: string }).stderr ?? error.message)
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`Direct playlist fetch failed: ${message.trim()}`);
  }
}

export async function searchPlaylistsDirect(
  options: DirectTidalOptions & { query: string; playlistLimit?: number }
): Promise<Array<{ id: string; title: string; description: string }>> {
  const helperPath = resolveHelperPath();
  const args = [
    helperPath,
    "--session-path",
    options.sessionPath,
    "--search-playlists",
    options.query,
    "--playlist-limit",
    String(options.playlistLimit ?? 5),
  ];

  try {
    const { stdout } = await execFileAsync(options.pythonPath, args, {
      maxBuffer: 10 * 1024 * 1024,
    });
    const payload = JSON.parse(stdout) as {
      playlists?: Array<{ id: string; title: string; description: string }>;
    };
    return Array.isArray(payload.playlists) ? payload.playlists : [];
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: string }).stderr ?? error.message)
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(`Direct playlist search failed: ${message.trim()}`);
  }
}
