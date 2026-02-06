import { Command } from "commander";
import fs from "fs";

type ArrangeOptions = {
  arc?: string;
  by?: string;
  maxPerArtist?: string;
};

type ArrangeArc = "flat" | "gentle_rise";
type ArrangeBy = "tempo" | "key";

type TrackLike = Record<string, unknown>;

type TrackWithBpm = {
  track: TrackLike;
  bpm: number;
  index: number;
};

const TEMPO_LOW_MAX = 90;
const TEMPO_MID_MAX = 120;
const TEMPO_MAX_DELTA = 15;

export function normalizeArc(value: string | undefined): ArrangeArc {
  if (!value) {
    return "flat";
  }
  const normalized = value.toLowerCase();
  if (normalized === "flat") {
    return "flat";
  }
  if (normalized === "gentle_rise") {
    return "gentle_rise";
  }
  throw new Error("Only --arc flat or --arc gentle_rise is supported right now.");
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

function getArtistName(track: TrackLike): string | null {
  // Try common artist field names
  const candidates = [
    track.artist_name,
    track.artistName,
    track.artist,
  ];
  
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim().toLowerCase(); // Normalize for comparison
    }
    // Handle artist as object with name property
    if (typeof candidate === "object" && candidate !== null) {
      const artistObj = candidate as { name?: unknown };
      if (typeof artistObj.name === "string" && artistObj.name.trim().length > 0) {
        return artistObj.name.trim().toLowerCase();
      }
    }
  }
  return null;
}

function enforceArtistLimit(tracks: TrackLike[], maxPerArtist: number): TrackLike[] {
  const artistCounts = new Map<string, number>();
  const result: TrackLike[] = [];
  
  for (const track of tracks) {
    const artistName = getArtistName(track);
    
    // If we can't determine artist, include the track (don't filter unknowns)
    if (artistName === null) {
      result.push(track);
      continue;
    }
    
    const count = artistCounts.get(artistName) || 0;
    
    if (count < maxPerArtist) {
      result.push(track);
      artistCounts.set(artistName, count + 1);
    }
  }
  
  return result;
}

function splitTracksByBpm(tracks: TrackLike[]): {
  withBpm: TrackWithBpm[];
  withoutBpm: TrackLike[];
} {
  const withBpm: TrackWithBpm[] = [];
  const withoutBpm: TrackLike[] = [];

  tracks.forEach((track, index) => {
    const bpm = getTempoValue(track);
    if (bpm === null) {
      withoutBpm.push(track);
    } else {
      withBpm.push({ track, bpm, index });
    }
  });

  return { withBpm, withoutBpm };
}

function sortByBpmAscending(tracks: TrackWithBpm[]): TrackWithBpm[] {
  return tracks
    .slice()
    .sort((a, b) => (a.bpm !== b.bpm ? a.bpm - b.bpm : a.index - b.index));
}

function bucketByBpm(tracks: TrackWithBpm[]): {
  low: TrackWithBpm[];
  mid: TrackWithBpm[];
  high: TrackWithBpm[];
} {
  const low: TrackWithBpm[] = [];
  const mid: TrackWithBpm[] = [];
  const high: TrackWithBpm[] = [];

  tracks.forEach((item) => {
    if (item.bpm <= TEMPO_LOW_MAX) {
      low.push(item);
    } else if (item.bpm <= TEMPO_MID_MAX) {
      mid.push(item);
    } else {
      high.push(item);
    }
  });

  return {
    low: sortByBpmAscending(low),
    mid: sortByBpmAscending(mid),
    high: sortByBpmAscending(high),
  };
}

function computeSegmentCounts(total: number): {
  startLow: number;
  buildMid: number;
  peakHigh: number;
  descendMid: number;
  endLow: number;
} {
  if (total <= 0) {
    return { startLow: 0, buildMid: 0, peakHigh: 0, descendMid: 0, endLow: 0 };
  }

  const weights = {
    startLow: 0.1,
    buildMid: 0.2,
    peakHigh: 0.3,
    descendMid: 0.2,
    endLow: 0.2,
  };

  const counts = {
    startLow: Math.floor(total * weights.startLow),
    buildMid: Math.floor(total * weights.buildMid),
    peakHigh: Math.floor(total * weights.peakHigh),
    descendMid: Math.floor(total * weights.descendMid),
    endLow: Math.floor(total * weights.endLow),
  };

  let remainder =
    total -
    (counts.startLow +
      counts.buildMid +
      counts.peakHigh +
      counts.descendMid +
      counts.endLow);

  const distributeOrder: Array<keyof typeof counts> = [
    "peakHigh",
    "buildMid",
    "descendMid",
    "endLow",
    "startLow",
  ];

  let orderIndex = 0;
  while (remainder > 0) {
    const key = distributeOrder[orderIndex % distributeOrder.length] as keyof typeof counts;
    counts[key] += 1;
    remainder -= 1;
    orderIndex += 1;
  }

  const minEdge = total >= 10 ? 2 : total >= 5 ? 1 : 0;

  const adjustSegment = (segment: "startLow" | "endLow") => {
    while (counts[segment] < minEdge) {
      const donor: Array<keyof typeof counts> = [
        "peakHigh",
        "buildMid",
        "descendMid",
      ];
      let moved = false;
      for (const key of donor) {
        if (counts[key] > 1) {
          counts[key] -= 1;
          counts[segment] += 1;
          moved = true;
          break;
        }
      }
      if (!moved) {
        break;
      }
    }
  };

  adjustSegment("startLow");
  adjustSegment("endLow");

  return counts;
}

function takeFromBucket(
  bucket: TrackWithBpm[],
  count: number,
  direction: "asc" | "desc"
): TrackWithBpm[] {
  const selected: TrackWithBpm[] = [];
  while (selected.length < count && bucket.length > 0) {
    const item = direction === "asc" ? bucket.shift() : bucket.pop();
    if (item) {
      selected.push(item);
    }
  }
  return selected;
}

function takeWithFallback(
  count: number,
  preferred: Array<{ bucket: TrackWithBpm[]; direction: "asc" | "desc" }>,
  fallback: Array<{ bucket: TrackWithBpm[]; direction: "asc" | "desc" }>
): TrackWithBpm[] {
  const selected: TrackWithBpm[] = [];
  let remaining = count;

  for (const option of preferred) {
    if (remaining <= 0) break;
    selected.push(...takeFromBucket(option.bucket, remaining, option.direction));
    remaining = count - selected.length;
  }

  for (const option of fallback) {
    if (remaining <= 0) break;
    selected.push(...takeFromBucket(option.bucket, remaining, option.direction));
    remaining = count - selected.length;
  }

  return selected;
}

export function smoothTempoTransitions(
  tracks: TrackWithBpm[],
  maxDelta: number
): TrackWithBpm[] {
  const arranged = tracks.slice();

  for (let i = 1; i < arranged.length; i += 1) {
    const prevTrack = arranged[i - 1];
    const currentTrack = arranged[i];
    if (!prevTrack || !currentTrack) {
      continue;
    }
    const prev = prevTrack.bpm;
    const current = currentTrack.bpm;
    const delta = Math.abs(current - prev);
    if (delta <= maxDelta) {
      continue;
    }

    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    let bestWithin = false;

    for (let j = i + 1; j < arranged.length; j += 1) {
      const candidateTrack = arranged[j];
      if (!candidateTrack) {
        continue;
      }
      const candidateDelta = Math.abs(candidateTrack.bpm - prev);
      const within = candidateDelta <= maxDelta;
      if (within && !bestWithin) {
        bestWithin = true;
        bestDelta = candidateDelta;
        bestIndex = j;
        continue;
      }
      if (within === bestWithin && candidateDelta < bestDelta) {
        bestDelta = candidateDelta;
        bestIndex = j;
      }
    }

    if (bestIndex > -1) {
      const [candidate] = arranged.splice(bestIndex, 1);
      if (candidate) {
        arranged.splice(i, 0, candidate);
      }
    }
  }

  return arranged;
}

export function arrangeGentleRise(tracks: TrackLike[]): TrackLike[] {
  const { withBpm, withoutBpm } = splitTracksByBpm(tracks);
  if (withBpm.length === 0) {
    return tracks.slice();
  }

  const buckets = bucketByBpm(withBpm);
  const counts = computeSegmentCounts(withBpm.length);

  const startLow = takeWithFallback(
    counts.startLow,
    [
      { bucket: buckets.low, direction: "asc" },
      { bucket: buckets.mid, direction: "asc" },
    ],
    [
      { bucket: buckets.high, direction: "asc" },
      { bucket: buckets.mid, direction: "asc" },
      { bucket: buckets.low, direction: "asc" },
    ]
  );

  const buildMid = takeWithFallback(
    counts.buildMid,
    [
      { bucket: buckets.mid, direction: "asc" },
      { bucket: buckets.low, direction: "asc" },
    ],
    [
      { bucket: buckets.high, direction: "asc" },
      { bucket: buckets.mid, direction: "asc" },
      { bucket: buckets.low, direction: "asc" },
    ]
  );

  const peakHigh = takeWithFallback(
    counts.peakHigh,
    [
      { bucket: buckets.high, direction: "desc" },
      { bucket: buckets.mid, direction: "desc" },
    ],
    [
      { bucket: buckets.low, direction: "desc" },
      { bucket: buckets.mid, direction: "desc" },
      { bucket: buckets.high, direction: "desc" },
    ]
  );

  const descendMid = takeWithFallback(
    counts.descendMid,
    [
      { bucket: buckets.mid, direction: "desc" },
      { bucket: buckets.high, direction: "desc" },
    ],
    [
      { bucket: buckets.low, direction: "desc" },
      { bucket: buckets.mid, direction: "desc" },
      { bucket: buckets.high, direction: "desc" },
    ]
  );

  const endLow = takeWithFallback(
    counts.endLow,
    [
      { bucket: buckets.low, direction: "desc" },
      { bucket: buckets.mid, direction: "desc" },
    ],
    [
      { bucket: buckets.high, direction: "desc" },
      { bucket: buckets.mid, direction: "desc" },
      { bucket: buckets.low, direction: "desc" },
    ]
  );

  const combined = [...startLow, ...buildMid, ...peakHigh, ...descendMid, ...endLow];
  const smoothed = smoothTempoTransitions(combined, TEMPO_MAX_DELTA);

  return [...smoothed.map((item) => item.track), ...withoutBpm];
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
  let tracks = extractTracks(payload);

  // Apply diversity constraints BEFORE arc arrangement
  if (options.maxPerArtist) {
    const limit = parseInt(options.maxPerArtist, 10);
    if (Number.isFinite(limit) && limit > 0) {
      tracks = enforceArtistLimit(tracks, limit);
    }
  }

  let arranged = tracks.slice();
  if (arc === "gentle_rise") {
    arranged = arrangeGentleRise(tracks);
  }

  if (arc === "flat" && by === "tempo") {
    arranged = stableSortByNumber(arranged, getTempoValue);
  } else if (arc === "flat" && by === "key") {
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
    .option("--arc <preset>", "Energy arc preset (flat|gentle_rise)")
    .option("--by <mode>", "Order by field (tempo|key)")
    .option("--max-per-artist <n>", "Maximum tracks per artist (diversity constraint)")
    .action(async (input: string | undefined, options: ArrangeOptions) => {
      await runArrange(input, options);
    });
}
