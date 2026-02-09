// Public API for the discovery module
export { runDiscover, parseTags, parseArtists, type DiscoverOptions } from "./runner";
export { dedupeTracks, filterTracks, filterByGenre } from "./filters";
export { formatAsText, formatAsJson, formatAsIds } from "./formatting";
export { buildSearchQuery } from "./sources/search";
export type { DiscoveryResult, DiscoveryContext, TrackFilters } from "./types";
