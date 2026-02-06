#!/usr/bin/env python3

import argparse
import json
import os
import sys
from typing import Any, Dict, Optional


def format_key(key: Optional[str], scale: Optional[str]) -> Optional[str]:
    if not key:
        return None
    if not scale:
        return key
    scale_label = str(scale).strip().lower()
    if scale_label in {"major", "minor"}:
        return f"{key} {scale_label}"
    return f"{key} {scale_label}"


def safe_image(obj: Any, size: int = 1280) -> Optional[str]:
    if obj is None:
        return None
    if not hasattr(obj, "image"):
        return None
    try:
        return obj.image(size)
    except Exception:
        return None


def track_to_dict(track: Any) -> Dict[str, Any]:
    key = getattr(track, "key", None)
    key_scale = getattr(track, "key_scale", None)
    peak = getattr(track, "peak", None)
    bpm = getattr(track, "bpm", None)

    audio_features: Dict[str, Any] = {}
    if bpm is not None:
        audio_features["bpm"] = bpm
    formatted_key = format_key(key, key_scale)
    if formatted_key is not None:
        audio_features["key"] = formatted_key
    if key_scale is not None:
        audio_features["key_scale"] = key_scale
    if peak is not None:
        audio_features["peak"] = peak

    payload: Dict[str, Any] = {
        "id": track.id,
        "title": track.name,
        "artist": track.artist.name if track.artist else "Unknown",
        "album": track.album.name if track.album else "Unknown",
        "duration": track.duration,
        "album_art": safe_image(track.album),
    }

    if audio_features:
        payload["audio_features"] = audio_features

    return payload


def load_session(session_path: str):
    if not os.path.exists(session_path):
        raise FileNotFoundError(f"Session file not found: {session_path}")

    with open(session_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)

    try:
        import tidalapi
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "tidalapi is not installed. Use the tidal-service venv or install tidalapi."
        ) from exc

    session = tidalapi.Session()
    session.load_oauth_session(
        data["token_type"],
        data["access_token"],
        data["refresh_token"],
        data.get("expiry_time"),
    )

    if not session.check_login():
        raise RuntimeError("Tidal session is not logged in or has expired.")

    return session


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch Tidal favorites directly.")
    parser.add_argument("--session-path", required=True, help="Path to tidal_session.json")
    parser.add_argument("--limit", type=int, default=50, help="Max favorite tracks")
    args = parser.parse_args()

    try:
        session = load_session(args.session_path)
        favorites = session.user.favorites
        tracks = favorites.tracks()

        if args.limit and args.limit > 0:
            tracks = tracks[: args.limit]

        payload = {
            "tracks_count": len(tracks),
            "albums_count": 0,
            "artists_count": 0,
            "favorites": {
                "tracks": [track_to_dict(track) for track in tracks],
                "albums": [],
                "artists": [],
            },
        }

        sys.stdout.write(json.dumps(payload))
        return 0
    except Exception as exc:
        error_payload = {"error": str(exc)}
        sys.stderr.write(json.dumps(error_payload))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
