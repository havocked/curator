import { Command } from "commander";
import {
  addTracksToPlaylist,
  createPlaylist,
  initTidalClient,
} from "../services/tidalSdk";

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);

    // If stdin is a TTY (no pipe), don't hang
    if (process.stdin.isTTY) {
      resolve("");
    }
  });
}

function parseTrackIds(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line));
}

type PlaylistCreateOptions = {
  name: string;
  description?: string;
  public?: boolean;
};

async function runPlaylistCreate(options: PlaylistCreateOptions): Promise<void> {
  const raw = await readStdin();
  const trackIds = parseTrackIds(raw);

  if (trackIds.length === 0) {
    throw new Error(
      "No track IDs provided. Pipe IDs via stdin:\n  curator discover --genre \"jazz\" --format ids | curator playlist create --name \"Jazz Mix\""
    );
  }

  console.error(`[playlist] Creating playlist: ${options.name}`);
  console.error(`[playlist] ${trackIds.length} tracks to add`);

  await initTidalClient();

  const playlist = await createPlaylist({
    name: options.name,
    description: options.description,
    isPublic: options.public ?? false,
  });

  console.error(`[playlist] Created: ${playlist.name} (${playlist.id})`);

  const added = await addTracksToPlaylist(playlist.id, trackIds);
  console.error(`[playlist] Added ${added} tracks`);

  // Output result as JSON
  const output = {
    id: playlist.id,
    name: playlist.name,
    trackCount: added,
    url: `https://listen.tidal.com/playlist/${playlist.id}`,
  };
  console.log(JSON.stringify(output, null, 2));
}

export function registerPlaylistCommand(program: Command): void {
  const playlist = program
    .command("playlist")
    .description("Manage Tidal playlists");

  playlist
    .command("create")
    .description("Create a Tidal playlist from track IDs (reads from stdin)")
    .requiredOption("--name <name>", "Playlist name")
    .option("--description <text>", "Playlist description")
    .option("--public", "Make playlist public (default: unlisted)")
    .action(async (options: PlaylistCreateOptions) => {
      await runPlaylistCreate(options);
    });
}
