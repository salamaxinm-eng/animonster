type CachedEpisode = {
  ordinal?: unknown;
  duration?: unknown;
};

type KodikPayload = {
  seasons?: Record<string, { episodes?: Record<string, unknown> }>;
};

export function cachedEpisodeDuration(episodesJson: string, episode: number) {
  try {
    const episodes = JSON.parse(episodesJson) as CachedEpisode[];
    const match = episodes.find((item) => Number(item.ordinal) === episode);
    const duration = Number(match?.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

export function kodikTranslationId(voiceover: string) {
  const match = /^kodik:(?:voice|subtitles):(\d+)$/.exec(voiceover);
  const id = Number(match?.[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function kodikSourceHasEpisode(
  payloadJson: string,
  episodesCount: number,
  episode: number,
) {
  if (!Number.isInteger(episode) || episode < 1) return false;
  try {
    const payload = JSON.parse(payloadJson) as KodikPayload;
    const ordinals = Object.values(payload.seasons || {}).flatMap((season) =>
      Object.keys(season.episodes || {}).map(Number),
    );
    if (ordinals.length) return ordinals.some((ordinal) => ordinal === episode);
  } catch {}
  return episode <= Math.max(0, Number(episodesCount) || 0);
}
