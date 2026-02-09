/**
 * Normalize artist names for API lookups.
 * Strips featured/collaborative artist suffixes so we match the primary artist.
 *
 * "Daft Punk feat. Pharrell Williams"           → "Daft Punk"
 * "KAYTRANADA, H.E.R."                          → "KAYTRANADA"
 * "Tyler, The Creator"                           → "Tyler, The Creator"
 * "Silk Sonic (Bruno Mars & Anderson .Paak)"     → "Silk Sonic"
 * "Iron & Wine"                                  → "Iron & Wine" (kept — & is ambiguous)
 */
export function normalizeArtistName(raw: string): string {
  let name = raw;

  // 1. Strip parenthetical suffixes: "Silk Sonic (Bruno Mars & Anderson .Paak)" → "Silk Sonic"
  name = name.replace(/\s*\(.*\)\s*$/, "");

  // 2. Strip feat./ft./featuring/with — unambiguous collab markers
  name = name.replace(/\s+(?:feat\.?|ft\.?|featuring|with)\s+.*/i, "");

  // 3. Split on comma, but preserve band name continuations like "Tyler, The Creator"
  const commaIdx = name.indexOf(",");
  if (commaIdx > 0) {
    const after = name.slice(commaIdx + 1).trim();
    const bandContinuations =
      /^(?:the|a|an|los|la|le|les|das|die|der|his|her|jr|sr)\b/i;
    if (!bandContinuations.test(after)) {
      name = name.slice(0, commaIdx);
    }
  }

  // NOTE: We intentionally do NOT split on "&" or "x".
  // "&" is too ambiguous — "Iron & Wine", "Simon & Garfunkel", "Above & Beyond"
  // are all single acts, not collabs. The feat./ft. pattern catches real collabs.

  return name.trim();
}
