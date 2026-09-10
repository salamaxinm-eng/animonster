import type { Anime, Voiceover } from '@/lib/anime';
import { runtime } from '@/lib/server/core';

type KodikResult = {
  id?: string;
  link?: string;
  title?: string;
  title_orig?: string;
  year?: number;
  shikimori_id?: string | number;
  episodes_count?: number;
  camrip?: boolean;
  blocked_countries?: string[];
  translation?: { id?: number; title?: string; type?: string };
};

type KodikResponse = {
  results?: KodikResult[];
};

const PLAYER_HOSTS = [
  'kodik.info',
  'kodik.biz',
  'kodikres.com',
  'kodikplayer.com',
  'kodikonline.com',
];

function safePlayerUrl(raw: string) {
  try {
    const url = new URL(raw.startsWith('//') ? 'https:' + raw : raw);
    if (url.protocol !== 'https:') return;
    const host = url.hostname.toLowerCase();
    if (!PLAYER_HOSTS.some((x) => host === x || host.endsWith('.' + x)))
      return;
    url.hash = '';
    return url.href;
  } catch {
    return;
  }
}

const comparable = (value: string) =>
  value
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();

export function normalizeKodikVoiceovers(
  results: KodikResult[],
  anime: Anime,
): Voiceover[] {
  const byTranslation = new Map<string, Voiceover>();
  for (const item of results) {
    const translation = item.translation;
    const title = translation?.title?.trim();
    const player = item.link ? safePlayerUrl(item.link) : undefined;
    const remoteId = Number(item.shikimori_id);
    const exactId = anime.id < 100000000;
    const exactFallbackTitle = [item.title, item.title_orig]
      .filter(Boolean)
      .some(
        (value) =>
          comparable(String(value)) === comparable(anime.russian) ||
          comparable(String(value)) === comparable(anime.name),
      );
    if (
      translation?.type !== 'voice' ||
      !title ||
      !player ||
      item.camrip ||
      item.blocked_countries?.some((country) =>
        ['RU', 'RUS'].includes(country.toUpperCase()),
      ) ||
      (exactId && remoteId !== anime.id) ||
      (!exactId &&
        (!exactFallbackTitle ||
          (item.year != null && Number(item.year) !== Number(anime.aired_on)))) ||
      /anilibr(?:ia|ity)/i.test(title)
    )
      continue;
    const id = String(translation.id || comparable(title));
    const next: Voiceover = {
      id: 'kodik:' + id,
      title,
      provider: 'kodik',
      episodes: Math.max(1, Number(item.episodes_count) || anime.episodes || 1),
      player_url: player,
    };
    const current = byTranslation.get(id);
    if (!current || next.episodes > current.episodes)
      byTranslation.set(id, next);
  }
  return [...byTranslation.values()]
    .sort((a, b) => b.episodes - a.episodes || a.title.localeCompare(b.title, 'ru'))
    .slice(0, 30);
}

export async function kodikVoiceovers(anime: Anime): Promise<{
  voiceovers: Voiceover[];
  status: 'ready' | 'disabled' | 'unavailable';
}> {
  const token = runtime().KODIK_API_TOKEN?.trim();
  if (!token) return { voiceovers: [], status: 'disabled' };
  try {
    const params = new URLSearchParams({
      token,
      types: 'anime,anime-serial',
      translation_type: 'voice',
      with_episodes: 'true',
      limit: '100',
      not_blocked_for_me: 'true',
    });
    if (anime.id < 100000000) params.set('shikimori_id', String(anime.id));
    else params.set('title', anime.name || anime.russian);
    const response = await fetch('https://kodik-api.com/search?' + params, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('Kodik returned ' + response.status);
    const data = (await response.json()) as KodikResponse;
    return {
      voiceovers: normalizeKodikVoiceovers(data.results || [], anime),
      status: 'ready',
    };
  } catch (error) {
    console.error(
      'Kodik request failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return { voiceovers: [], status: 'unavailable' };
  }
}
