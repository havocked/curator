import { Command } from "commander";
import fs from "fs";

type ArrangeOptions = {
  arc?: string;
  by?: string;
};

type ArrangeArc = "flat";
type ArrangeBy = "tempo" | "key";

type TrackLike = Record<string, unknown>;

export function normalizeArc(value: string | undefined): ArrangeArc {
  if (!value) {
    return "flat";
  }
  const normalized = value.toLowerCase();
  if (normalized === "flat") {
    return "flat";
  }
  throw new Error("Only --arc flat is supported right now.");
}

export function normalizeBy(value: string | undefined): ArrangeBy | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized === "tempo" || normalized === "key") {
    return normalized;
  }
  throw new Error("Only --by tempo or --by key is supported right now.");
}

export function extractTracks(payload: unknown): TrackLike[] {
  if (Array.isArray(payload)) {
    return payload as TrackLike[];
  }

  if (typeof payload === "object" && payload !== null) {
    const tracks = (payload as { tracks?: unknown }).tracks;
    if (Array.isArray(tracks)) {
      return tracks as TrackLike[];
    }
  }

  throw new Error("Input JSON must be an array or an object with 'tracks'.");
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function getTempoValue(track: TrackLike): number | null {
  const direct = coerceNumber(track.bpm ?? track.tempo);
  if (direct !== null) {
    return direct;
  }
  if (typeof track.audio_features === "object" && track.audio_features !== null) {
    const nested = track.audio_features as { bpm?: unknown; tempo?: unknown };
    return coerceNumber(nested.bpm ?? nested.tempo);
  }
  return null;
}

function getKeyValue(track: TrackLike): string | null {
  const direct = track.key;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }
  if (typeof track.audio_features === "object" && track.audio_features !== null) {
    const nested = track.audio_features as { key?: unknown };
    if (typeof nested.key === "string" && nested.key.trim().length > 0) {
      return nested.key.trim();
    }
  }
  return null;
}

function stableSortByNumber(tracks: TrackLike[], selector: (track: TrackLike) => number | null) {
  return tracks
    .map((track, index) => ({ track, index, value: selector(track) }))
    .sort((a, b) => {
      const aValue = a.value;
      const bValue = b.value;
      if (aValue === null && bValue === null) {
        return a.index - b.index;
      }
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      if (aValue !== bValue) return aValue - bValue;
      return a.index - b.index;
    })
    .map((entry) => entry.track);
}

function stableSortByString(tracks: TrackLike[], selector: (track: TrackLike) => string | null) {
  return tracks
    .map((track, index) => ({ track, index, value: selector(track) }))
    .sort((a, b) => {
      const aValue = a.value;
      const bValue = b.value;
      if (aValue === null && bValue === null) {
        return a.index - b.index;
      }
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      if (aValue !== bValue) return aValue.localeCompare(bValue);
      return a.index - b.index;
    })
    .map((entry) => entry.track);
}

export function arrangeTracks(
  payload: unknown,
  options: ArrangeOptions
): { count: number; tracks: TrackLike[] } {
  const arc = normalizeArc(options.arc);
  const by = normalizeBy(options.by);
  const tracks = extractTracks(payload);

  let arranged = tracks.slice();
  if (arc === "flat") {
    // No-op for MVP.
  }

  if (by === "tempo") {
    arranged = stableSortByNumber(arranged, getTempoValue);
  } else if (by === "key") {
    arranged = stableSortByString(arranged, getKeyValue);
  }

  return { count: arranged.length, tracks: arranged };
}

export function formatArrangeOutput(tracks: { count: number; tracks: TrackLike[] }): string {
  return JSON.stringify(tracks, null, 2);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", (error) => reject(error));
  });
}

export async function runArrange(
  inputPath: string | undefined,
  options: ArrangeOptions
): Promise<void> {
  let raw = "";

  if (inputPath) {
    raw = fs.readFileSync(inputPath, "utf8");
  } else if (!process.stdin.isTTY) {
    raw = await readStdin();
  } else {
    throw new Error("Provide a track list file path or pipe JSON via stdin.");
  }

  const payload = JSON.parse(raw);
  const result = arrangeTracks(payload, options);
  console.log(formatArrangeOutput(result));
}

export function registerArrangeCommand(program: Command): void {
  program
    .command("arrange")
    .description("Order tracks with musical logic")
    .argument("[input]", "Track list JSON file (or stdin)")
    .option("--arc <preset>", "Energy arc preset (flat)")
    .option("--by <mode>", "Order by field (tempo|key)")
    .action(async (input: string | undefined, options: ArrangeOptions) => {
      await runArrange(input, options);
    });
}
