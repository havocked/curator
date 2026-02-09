import type { createAPIClient, components } from "@tidal-music/api";

export type ApiClient = ReturnType<typeof createAPIClient>;
export type ResourceId = components["schemas"]["Resource_Identifier"];
export type TrackResource = components["schemas"]["Tracks_Resource_Object"];
export type ArtistResource = components["schemas"]["Artists_Resource_Object"];
export type AlbumResource = components["schemas"]["Albums_Resource_Object"];
export type GenreResource = components["schemas"]["Genres_Resource_Object"];
export type IncludedResource = components["schemas"]["Included"][number];

export type TrackAttrs = NonNullable<TrackResource["attributes"]>;
export type AlbumAttrs = NonNullable<AlbumResource["attributes"]>;

export interface Credentials {
  clientId: string;
  clientSecret: string;
}

export interface ResolvedMeta {
  artistName?: string | undefined;
  albumTitle?: string | undefined;
  releaseDate?: string | undefined;
  genres?: string[] | undefined;
}

export const COUNTRY_CODE = "DE";
export const RATE_LIMIT_MS = 200;
export const BATCH_SIZE = 50;
