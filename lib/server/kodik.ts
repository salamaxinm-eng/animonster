import type { Anime, Voiceover } from '@/lib/anime';
import { db, now, runtime } from '@/lib/server/core';

export type KodikMaterialData = {
  title?: string;
  anime_title?: string;
  title_en?: string;
  description?: string;
  anime_description?: string;
  poster_url?: string;
  anime_poster_url?: string;
  duration?: number;
  anime_kind?: string;
  anime_status?: 'anons' | 'ongoing' | 'released';
  year?: number;
  anime_genres?: string[];
  genres?: string[];
  shikimori_rating?: number;
  minimal_age?: number;
  rating_mpaa?: string;
  episodes_total?: number;
  episodes_aired?: number;
};

export type KodikResult = {
  id?: string;
  link?: string;
  title?: string;
  title_orig?: string;
  year?: number;
  shikimori_id?: string | number;
  episodes_count?: number;
  last_episode?: number;
  camrip?: boolean;
  caprip?: boolean;
  blocked_countries?: string[];
  updated_at?: string;
  type?: string;
  translation?: { id?: number; title?: string; type?: string };
  seasons?: Record<
    string,
    {
      link?: string;
      episodes?: Record<string, string | { link?: string }>;
    }
  >;
  material_data?: KodikMaterialData;
};

type KodikResponse = {
  results?: KodikResult[];
  total?: number;
  next_page?: string | null;
};

export function kodikEpisodeOrdinals(item: KodikResult) {
  return [
    ...new Set(
      Object.values(item.seasons || {}).flatMap((season) =>
        Object.keys(season.episodes || {}).map(Number),
      ),
    ),
  ]
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 100000)
    .sort((a, b) => a - b);
}
export function kodikLastEpisode(item: KodikResult) {
  return Math.max(
    1,
    Number(item.episodes_count) || 0,
    Number(item.last_episode) || 0,
    ...kodikEpisodeOrdinals(item),
  );
}

export const KODIK_PLAYER_HOSTS = [
  'kodik.info',
  'kodik.biz',
  'kodikres.com',
  'kodikplayer.com',
  'kodikonline.com',
  'kodik.cc',
  'aniqit.com',
];

export function safeKodikPlayerUrl(raw: string) {
  try {
    const url = new URL(raw.startsWith('//') ? 'https:' + raw : raw);
    if (url.protocol !== 'https:') return;
    const host = url.hostname.toLowerCase();
    if (
      !KODIK_PLAYER_HOSTS.some(
        (allowed) => host === allowed || host.endsWith('.' + allowed),
      )
    )
      return;
    url.hash = '';
    return url.href;
  } catch {
    return;
  }
}

export const comparable = (value: string) =>
  value
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();

async function providerHealth(
  status: 'ok' | 'error',
  latency: number,
  error?: string,
) {
  try {
    await db()
      .prepare(
        'INSERT INTO provider_health(provider,status,latency_ms,error,checked_at) VALUES (?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET status=excluded.status,latency_ms=excluded.latency_ms,error=excluded.error,checked_at=excluded.checked_at',
      )
      .bind('kodik', status, latency, error || null, now())
      .run();
  } catch {}
}

export async function kodikRequest(
  path: 'list' | 'search',
  params: URLSearchParams,
): Promise<KodikResponse> {
  const token = runtime().KODIK_API_TOKEN?.trim();
  if (!token) throw new Error('Kodik token is not configured');
  params.set('token', token);
  const started = performance.now();
  try {
    const response = await fetch(`https://kodik-api.com/${path}?${params}`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Kodik HTTP ${response.status}`);
    const result = (await response.json()) as KodikResponse;
    void providerHealth('ok', Math.round(performance.now() - started));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    void providerHealth(
      'error',
      Math.round(performance.now() - started),
      message,
    );
    throw new Error(message);
  }
}

export function safeKodikCursor(nextPage?: string | null) {
  if (!nextPage) return null;
  try {
    const url = new URL(nextPage);
    if (url.protocol !== 'https:' || url.hostname !== 'kodik-api.com')
      return null;
    const cursor = url.searchParams.get('next');
    return cursor && cursor.length <= 500 ? cursor : null;
  } catch {
    return null;
  }
}

export async function kodikCatalogPage(
  cursor?: string | null,
  order: 'asc' | 'desc' = 'asc',
) {
  const params = new URLSearchParams({
    types: 'anime,anime-serial',
    limit: '100',
    sort: 'updated_at',
    order,
    with_material_data: 'true',
    not_blocked_in: 'RU',
    not_blocked_for_me: 'true',
  });
  if (cursor) params.set('next', cursor);
  const response = await kodikRequest('list', params);
  return {
    results: response.results || [],
    total: Number(response.total || 0),
    cursor: safeKodikCursor(response.next_page),
  };
}

const BLOCKED_KODIK_GENRES = new Set([
  'hentai',
  'хентай',
  'erotica',
  'эротика',
  'ecchi',
  'этти',

  'yaoi',
  'яой',
  'boys love',
  'boy love',
  'shounen ai',
  'shonen ai',
  'сёнэн ай',
  'сенен ай',

  'yuri',
  'юри',
  'girls love',
  'girl love',
  'shoujo ai',
  'shojo ai',
  'сёдзё ай',
  'седзе ай',

  'lolicon',
  'shotacon',
  'лоликон',
  'шотакон',
]);

const BLOCKED_KODIK_TEXT =
  /(?<![\p{L}\p{N}])(?:hentai|yaoi|yuri|erotica|ecchi|shou?nen[\s_-]*ai|shou?jo[\s_-]*ai|boys?[\s_-]*love|girls?[\s_-]*love|lolicon|shotacon|хентай|яой|юри|эротик[а-яё]*|этти|с[её]н[её]н[\s_-]*ай|с[её]дз[её][\s_-]*ай|лоликон|шотакон)(?![\p{L}\p{N}])/iu;

export function blockedKodikContent(item: KodikResult) {
  const data = item.material_data;

  const genres = [...(data?.anime_genres || []), ...(data?.genres || [])].map(
    (genre) => comparable(String(genre)),
  );

  if (genres.some((genre) => BLOCKED_KODIK_GENRES.has(genre))) {
    return true;
  }

  const text = [
    item.title,
    item.title_orig,
    data?.title,
    data?.anime_title,
    data?.title_en,
    data?.description,
    data?.anime_description,
  ]
    .filter(Boolean)
    .join(' ');

  return BLOCKED_KODIK_TEXT.test(text);
}

export function allowedKodikResult(item: KodikResult) {
  const translationType = item.translation?.type;

  return (
    !blockedKodikContent(item) &&
    (item.type === 'anime' || item.type === 'anime-serial') &&
    (translationType === 'voice' || translationType === 'subtitles') &&
    !item.camrip &&
    !item.caprip &&
    !item.blocked_countries?.some((country) =>
      ['RU', 'RUS'].includes(country.toUpperCase()),
    ) &&
    !!item.link &&
    !!safeKodikPlayerUrl(item.link)
  );
}

export function normalizeKodikVoiceovers(
  results: KodikResult[],
  anime: Anime,
): Voiceover[] {
  const byTranslation = new Map<string, Voiceover>();
  for (const item of results) {
    const translation = item.translation;
    const title = translation?.title?.trim();
    const player = item.link ? safeKodikPlayerUrl(item.link) : undefined;
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
      !allowedKodikResult(item) ||
      !title ||
      !player ||
      (exactId && remoteId !== anime.id) ||
      (!exactId &&
        (!exactFallbackTitle ||
          (item.year != null &&
            Number(item.year) !== Number(anime.aired_on)))) ||
      /anilibr(?:ia|ity)/i.test(title)
    )
      continue;
    const type = translation?.type === 'subtitles' ? 'subtitles' : 'voice';
    const id = `${type}:${translation?.id || comparable(title)}`;
    const next: Voiceover = {
      id: 'kodik:' + id,
      title: type === 'subtitles' ? `Субтитры · ${title}` : title,
      provider: 'kodik',
      translation_type: type,
      episodes: kodikLastEpisode(item),
      episode_ordinals: kodikEpisodeOrdinals(item).length
        ? kodikEpisodeOrdinals(item)
        : undefined,
      player_url: player,
    };
    const current = byTranslation.get(id);
    if (!current || next.episodes > current.episodes)
      byTranslation.set(id, next);
  }
  return [...byTranslation.values()]
    .sort(
      (a, b) =>
        Number(a.translation_type === 'subtitles') -
          Number(b.translation_type === 'subtitles') ||
        b.episodes - a.episodes ||
        a.title.localeCompare(b.title, 'ru'),
    )
    .slice(0, 40);
}

export async function rememberKodikSources(
  animeId: number,
  results: KodikResult[],
) {
  const timestamp = now();
  const valid = results.filter(allowedKodikResult);
  if (!valid.length) return;
  await db().batch(
    valid.map((item) =>
      db()
        .prepare(
          `INSERT INTO anime_sources(provider,source_id,anime_id,shikimori_id,translation_id,translation_title,translation_type,player_url,episodes_count,payload,provider_updated_at,last_seen_at,active)
           VALUES ('kodik',?,?,?,?,?,?,?,?,?,?,?,1)
           ON CONFLICT(provider,source_id) DO UPDATE SET anime_id=excluded.anime_id,shikimori_id=excluded.shikimori_id,
           translation_id=excluded.translation_id,translation_title=excluded.translation_title,translation_type=excluded.translation_type,
           player_url=excluded.player_url,episodes_count=excluded.episodes_count,payload=excluded.payload,
           provider_updated_at=excluded.provider_updated_at,last_seen_at=excluded.last_seen_at,active=1`,
        )
        .bind(
          String(item.id || `${animeId}:${item.translation?.id || 0}`),
          animeId,
          Number(item.shikimori_id) || null,
          Number(item.translation?.id) || null,
          String(item.translation?.title || ''),
          item.translation?.type === 'subtitles' ? 'subtitles' : 'voice',
          safeKodikPlayerUrl(item.link || '') || null,
          kodikLastEpisode(item),
          JSON.stringify(item),
          Date.parse(item.updated_at || '') || timestamp,
          timestamp,
        ),
    ),
  );
  const episodeLinks = valid.flatMap((item) => {
    const translationId = Number(item.translation?.id);
    if (!Number.isInteger(translationId) || translationId < 1) return [];
    return Object.values(item.seasons || {}).flatMap((season) =>
      Object.entries(season.episodes || {}).flatMap(([key, value]) => {
        const episode = Number(key);
        const raw = typeof value === 'string' ? value : value.link || '';
        const player = safeKodikPlayerUrl(raw);
        return Number.isInteger(episode) && episode > 0 && player
          ? [{ translationId, episode, player }]
          : [];
      }),
    );
  });
  if (episodeLinks.length)
    await db().batch(
      episodeLinks.slice(0, 5000).map((episode) =>
        db()
          .prepare(
            `INSERT INTO kodik_episode_links(anime_id,translation_id,episode,player_url,updated_at)
             VALUES (?,?,?,?,?) ON CONFLICT(anime_id,translation_id,episode) DO UPDATE SET
             player_url=excluded.player_url,updated_at=excluded.updated_at`,
          )
          .bind(
            animeId,
            episode.translationId,
            episode.episode,
            episode.player,
            timestamp,
          ),
      ),
    );
}

async function storedKodikResults(animeId: number) {
  const rows = await db()
    .prepare(
      "SELECT payload FROM anime_sources WHERE provider='kodik' AND anime_id=? AND active=1 ORDER BY translation_type,episodes_count DESC,translation_title",
    )
    .bind(animeId)
    .all<{ payload: string }>();
  return rows.results.flatMap((row) => {
    try {
      return [JSON.parse(row.payload) as KodikResult];
    } catch {
      return [];
    }
  });
}

function publicKodikVoiceovers(results: KodikResult[], anime: Anime) {
  return normalizeKodikVoiceovers(results, anime);
}

export async function kodikVoiceovers(anime: Anime): Promise<{
  voiceovers: Voiceover[];
  status: 'ready' | 'disabled' | 'unavailable' | 'empty';
  message?: string;
}> {
  const token = runtime().KODIK_API_TOKEN?.trim();
  let results = await storedKodikResults(anime.id);
  if (!token) {
    const voiceovers = publicKodikVoiceovers(results, anime);
    if (voiceovers.length) return { voiceovers, status: 'ready' };
    return {
      voiceovers: [],
      status: 'disabled',
      message: 'Плеер Kodik сейчас не подключён.',
    };
  }
  try {
    const params = new URLSearchParams({
      types: 'anime,anime-serial',
      with_episodes: 'true',
      with_seasons: 'true',
      with_material_data: 'true',
      limit: '100',
      not_blocked_in: 'RU',
    });
    if (anime.shikimori_id || anime.id < 100000000)
      params.set('shikimori_id', String(anime.shikimori_id || anime.id));
    else params.set('title', anime.name || anime.russian);
    const data = await kodikRequest('search', params);
    if (data.results?.length) {
      // A response can contain only a subset of translations; retain other stored sources.
      const sources = new Map(results.map((item) => [String(item.id), item]));
      for (const item of data.results) sources.set(String(item.id), item);
      results = [...sources.values()];
      await rememberKodikSources(anime.id, results);
    }
  } catch (error) {
    if (!results.length) {
      console.error(
        'Kodik request failed',
        error instanceof Error ? error.message : 'unknown',
      );
      return {
        voiceovers: [],
        status: 'unavailable',
        message: 'Плеер Kodik временно недоступен.',
      };
    }
  }
  const voiceovers = publicKodikVoiceovers(results, anime);
  if (!voiceovers.length)
    return {
      voiceovers,
      status: 'empty',
      message: 'Kodik не вернул доступных озвучек для этого аниме.',
    };
  return { voiceovers, status: 'ready' };
}
