import type { Track } from "../types";
import type {
  AlbumAttrs,
  ArtistResource,
  GenreResource,
  IncludedResource,
  ResolvedMeta,
  TrackAttrs,
  TrackResource,
} from "./types";

/**
 * Parse ISO 8601 duration (PT1H2M3S) to seconds.
 */
export function parseDuration(iso: string | undefined | null): number {
  if (!iso) return 0;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (
    parseInt(match[1] ?? "0", 10) * 3600 +
    parseInt(match[2] ?? "0", 10) * 60 +
    parseInt(match[3] ?? "0", 10)
  );
}

/**
 * Format musical key from API format to human-readable.
 * e.g. "CSharp" + "MINOR" → "C# minor"
 */
export function formatKey(
  key: string | undefined | null,
  scale: string | undefined | null
): string | null {
  if (!key || key === "UNKNOWN") return null;
  const readable = key.replace("Sharp", "#");
  if (!scale || scale === "UNKNOWN") return readable;
  return `${readable} ${scale.toLowerCase()}`;
}

/**
 * Map a Tidal API track resource to our Track interface.
 */
export function mapTrackResource(
  track: TrackResource,
  meta?: ResolvedMeta
): Track {
  const attrs = track.attributes as TrackAttrs | undefined;
  const title = attrs?.version
    ? `${attrs.title} (${attrs.version})`
    : (attrs?.title ?? "Unknown");

  const releaseYear = meta?.releaseDate
    ? new Date(meta.releaseDate).getFullYear()
    : attrs?.createdAt
      ? new Date(attrs.createdAt).getFullYear()
      : null;

  const toneTags = (attrs?.toneTags as string[] | undefined) ?? [];

  return {
    id: parseInt(track.id, 10),
    title,
    artist: meta?.artistName ?? "Unknown",
    album: meta?.albumTitle ?? "Unknown",
    duration: parseDuration(attrs?.duration),
    release_year: releaseYear,
    popularity: attrs?.popularity ?? null,
    genres: meta?.genres ?? [],
    mood: toneTags,
    audio_features: {
      bpm: attrs?.bpm ?? null,
      key: formatKey(attrs?.key, attrs?.keyScale),
    },
  };
}

/**
 * Resolve artist name, album title, release date, and genres
 * from the included resources in a JSON:API response.
 */
export function resolveTrackMeta(
  track: TrackResource,
  includedMap: Map<string, IncludedResource>
): ResolvedMeta {
  const rels = track.relationships as
    | Record<string, { data?: Array<{ id: string; type: string }> }>
    | undefined;

  let artistName: string | undefined;
  let albumTitle: string | undefined;
  let releaseDate: string | undefined;

  const artistId = rels?.artists?.data?.[0]?.id;
  if (artistId) {
    const artist = includedMap.get(`artists:${artistId}`);
    if (artist?.attributes) {
      artistName = (
        artist.attributes as NonNullable<ArtistResource["attributes"]>
      ).name;
    }
  }

  const albumId = rels?.albums?.data?.[0]?.id;
  if (albumId) {
    const album = includedMap.get(`albums:${albumId}`);
    if (album?.attributes) {
      const albumAttrs = album.attributes as AlbumAttrs;
      albumTitle = albumAttrs.title;
      releaseDate = albumAttrs.releaseDate ?? undefined;
    }
  }

  const genreIds =
    rels?.genres?.data?.map((g: { id: string }) => g.id) ?? [];
  const genres: string[] = [];
  for (const gid of genreIds) {
    const genre = includedMap.get(`genres:${gid}`);
    if (genre?.attributes) {
      const genreName = (
        genre.attributes as NonNullable<GenreResource["attributes"]>
      ).genreName;
      if (genreName) genres.push(genreName);
    }
  }

  return { artistName, albumTitle, releaseDate, genres };
}

/**
 * Build a lookup map from included resources: "type:id" → resource.
 */
export function buildIncludedMap(
  included: IncludedResource[]
): Map<string, IncludedResource> {
  const map = new Map<string, IncludedResource>();
  for (const item of included) {
    map.set(`${item.type}:${item.id}`, item);
  }
  return map;
}
