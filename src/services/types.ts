export interface EnrichmentMetadata {
  artist_mbid?: string;
  artist_genres?: string[];
  artist_genre_votes?: number[];
  enriched_at?: string;
  enrichment_sources?: string[];
}

export interface Track {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  release_year: number | null;
  popularity: number | null;
  genres: string[];
  mood: string[];
  audio_features: {
    bpm: number | null;
    key: string | null;
  };
  enrichment?: EnrichmentMetadata;
}

export interface Artist {
  id: number;
  name: string;
  picture: string | null;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  releaseDate: string | null;
  releaseYear: number | null;
  trackCount: number | null;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
}
