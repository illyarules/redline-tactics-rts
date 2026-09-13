/** Selects a random track while excluding the previous one when alternatives exist. */
export function selectRandomTrack(
  tracks: readonly string[],
  previousTrack: string | null,
  random: () => number = Math.random,
): string | null {
  if (tracks.length === 0) return null;
  const alternatives = tracks.length > 1
    ? tracks.filter((track) => track !== previousTrack)
    : tracks;
  const candidates = alternatives.length > 0 ? alternatives : tracks;
  const index = Math.min(Math.floor(random() * candidates.length), candidates.length - 1);
  return candidates[index] ?? null;
}
