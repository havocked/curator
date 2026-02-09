import { getLabelArtists, searchLabel } from "../../providers/musicbrainz";
import type { DiscoveryContext, DiscoveryResult } from "../types";
import { discoverFromArtists } from "./artists";

export async function discoverFromLabel(
  labelName: string,
  ctx: DiscoveryContext
): Promise<DiscoveryResult> {
  const trimmed = labelName.trim();
  if (!trimmed) {
    throw new Error("Provide a label name.");
  }
  const label = await searchLabel(trimmed);
  if (!label) {
    throw new Error(`Label not found: ${trimmed}`);
  }
  const names = await getLabelArtists(label.mbid);
  if (names.length === 0) {
    throw new Error(`No artists found for label: ${label.name}`);
  }

  const result = await discoverFromArtists(names, ctx);
  if (result.tracks.length === 0) {
    throw new Error("No tracks found for label artists.");
  }

  // Override source metadata to reflect label origin
  return {
    ...result,
    sourceName: "label",
    discoveredVia: `label:${trimmed.toLowerCase()}`,
    sourceLabel: `label:${trimmed}`,
  };
}
