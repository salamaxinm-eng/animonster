export const OFFLINE_QUALITIES = [480, 720, 1080] as const;
export type OfflineQuality = (typeof OFFLINE_QUALITIES)[number];

export type OfflineSelection = {
  animeId: number;
  episode: number;
  quality: OfflineQuality;
  voiceoverId: 'aniliberty';
};

export type OfflineSelectionIssue = {
  message: string;
  code: string;
  status: number;
};

export type OfflineRangeSelection = Omit<OfflineSelection, 'episode'> & {
  episodes: number[];
};

export function offlineRangeSelection(
  value: unknown,
): OfflineRangeSelection | OfflineSelectionIssue {
  const input = (value || {}) as Record<string, unknown>;
  const episodes = Array.isArray(input.episodes)
    ? [...new Set(input.episodes.map(Number))]
    : [];
  if (!episodes.length || episodes.length > 50)
    return {
      message: 'Выберите от 1 до 50 серий.',
      code: 'INVALID_EPISODE_RANGE',
      status: 400,
    };
  if (
    episodes.some(
      (episode) =>
        !Number.isInteger(episode) || episode < 1 || episode > 100000,
    )
  )
    return {
      message: 'Некорректный диапазон серий.',
      code: 'INVALID_EPISODE_RANGE',
      status: 400,
    };
  const single = offlineSelection({ ...input, episode: episodes[0] });
  if ('code' in single) return single;
  return {
    animeId: single.animeId,
    episodes: episodes.sort((a, b) => a - b),
    quality: single.quality,
    voiceoverId: 'aniliberty',
  };
}

export function offlineSelection(
  value: unknown,
): OfflineSelection | OfflineSelectionIssue {
  const input = (value || {}) as Record<string, unknown>;
  const animeId = Number(input.animeId);
  const episode = Number(input.episode);
  const quality = Number(input.quality) as OfflineQuality;
  const voiceoverId = String(input.voiceoverId || '');
  if (!Number.isInteger(animeId) || animeId < 1 || animeId > 999999999)
    return {
      message: 'Некорректный тайтл.',
      code: 'INVALID_ANIME',
      status: 400,
    };
  if (!Number.isInteger(episode) || episode < 1 || episode > 100000)
    return {
      message: 'Некорректная серия.',
      code: 'INVALID_EPISODE',
      status: 400,
    };
  if (!OFFLINE_QUALITIES.includes(quality))
    return {
      message: 'Это качество недоступно.',
      code: 'INVALID_QUALITY',
      status: 400,
    };
  if (voiceoverId !== 'aniliberty')
    return {
      message: 'Для этой озвучки офлайн-загрузка пока недоступна',
      code: 'DOWNLOAD_PROVIDER_UNSUPPORTED',
      status: 400,
    };
  return { animeId, episode, quality, voiceoverId: 'aniliberty' };
}

export function offlineEntitlementIssue(
  active: boolean,
): OfflineSelectionIssue | null {
  return active
    ? null
    : {
        message: 'Доступно с AniMonster Plus',
        code: 'PLUS_REQUIRED',
        status: 403,
      };
}
