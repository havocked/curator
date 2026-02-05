import { Command } from "commander";
import fs from "fs";

type ExportOptions = {
  format?: string;
};

type ExportFormat = "tidal";

export function normalizeFormat(value: string | undefined): ExportFormat {
  const normalized = (value ?? "tidal").toLowerCase();
  if (normalized === "tidal") {
    return "tidal";
  }
  throw new Error("Only --format tidal is supported right now.");
}

function coerceId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export function extractTrackIds(payload: unknown): number[] {
  const collection = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null
      ? (payload as { tracks?: unknown[] }).tracks
      : undefined;

  if (!Array.isArray(collection)) {
    return [];
  }

  const ids: number[] = [];
  for (const item of collection) {
    if (typeof item === "number" || typeof item === "string") {
      const id = coerceId(item);
      if (id) ids.push(id);
      continue;
    }

    if (typeof item === "object" && item !== null) {
      const record = item as { id?: unknown; tidal_id?: unknown; track_id?: unknown };
      const id =
        coerceId(record.tidal_id) ?? coerceId(record.id) ?? coerceId(record.track_id);
      if (id) ids.push(id);
    }
  }

  return ids;
}

export function formatTidalIds(ids: number[]): string {
  return ids.map((id) => String(id)).join("\n");
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

export async function runExport(inputPath: string | undefined, options: ExportOptions): Promise<void> {
  const format = normalizeFormat(options.format);
  let raw = "";

  if (inputPath) {
    raw = fs.readFileSync(inputPath, "utf8");
  } else if (!process.stdin.isTTY) {
    raw = await readStdin();
  } else {
    throw new Error("Provide a playlist file path or pipe JSON via stdin.");
  }

  const payload = JSON.parse(raw);
  const ids = extractTrackIds(payload);
  if (ids.length === 0) {
    throw new Error("No track IDs found in input.");
  }

  if (format === "tidal") {
    console.log(formatTidalIds(ids));
  }
}

export function registerExportCommand(program: Command): void {
  program
    .command("export")
    .description("Export playlist in various formats")
    .argument("[input]", "Playlist JSON file (or stdin)")
    .option("--format <format>", "Output format (tidal)", "tidal")
    .action(async (input: string | undefined, options: ExportOptions) => {
      await runExport(input, options);
    });
}
