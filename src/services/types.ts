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
}

export interface Artist {
  id: number;
  name: string;
  picture: string | null;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
}
