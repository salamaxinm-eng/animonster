import { proxyImageUrl, type Episode } from '@/lib/anime';
import { ApiError, db, now, uid, type User } from './core';
import { canWatchEpisode, syncEpisodeAccess } from './episode-access';
import {
  liberty,
  available,
  findRelease,
  normalize,
  type Release,
} from './anime';
import { getAnime } from './library';
import { mediaProxyUrl } from './media';
import { plusEntitlements } from './plus';
import {
  OFFLINE_QUALITIES,
  offlineEntitlementIssue,
  offlineRangeSelection,
  offlineSelection,
} from '@/lib/offline/rules';

const PREPARE_WINDOW_MS = 10 * 60 * 1000;
const PREPARE_LIMIT = 20;
const DOWNLOAD_URL_LIFETIME_MS = 30 * 60 * 1000;
export const OFFLINE_LICENSE_MS = 7 * 24 * 60 * 60 * 1000;

export function parseOfflineRequest(value: unknown) {
  const result = offlineSelection(value);
  if ('code' in result)
    throw new ApiError(result.message, result.status, result.code);
  return result;
}

async function rateLimit(userId: string) {
  const timestamp = now();
  const row = await db()
    .prepare(`INSERT INTO offline_prepare_limits(user_id,attempts,window_started)
      VALUES (?,1,?) ON CONFLICT(user_id) DO UPDATE SET
      attempts=CASE WHEN offline_prepare_limits.window_started<=? THEN 1 ELSE offline_prepare_limits.attempts+1 END,
      window_started=CASE WHEN offline_prepare_limits.window_started<=? THEN excluded.window_started ELSE offline_prepare_limits.window_started END
      RETURNING attempts,window_started`)
    .bind(
      userId,
      timestamp,
      timestamp - PREPARE_WINDOW_MS,
      timestamp - PREPARE_WINDOW_MS,
    )
    .first<{ attempts: number; window_started: number }>();
  if (Number(row?.attempts) > PREPARE_LIMIT)
    throw new ApiError(
      'Слишком много запросов. Попробуйте немного позже.',
      429,
      'RATE_LIMITED',
    );
}

async function nativeRelease(animeId: number) {
  const cached = await getAnime(animeId);
  const releaseId = cached?.anime.release_id;
  const found = releaseId ? null : await findRelease(animeId);
  const resolvedReleaseId = releaseId || found?.id;
  if (!resolvedReleaseId)
    throw new ApiError(
      'Нативный источник не найден.',
      404,
      'DOWNLOAD_SOURCE_MISSING',
    );
  const release: Release = await liberty(
    '/anime/releases/' + resolvedReleaseId,
  );
  if (!available(release) || normalize(release).id !== animeId)
    throw new ApiError(
      'Загрузка этого тайтла недоступна.',
      403,
      'DOWNLOAD_SOURCE_UNAVAILABLE',
    );
  return { release, anime: normalize(release) };
}

export async function offlineDownloadOptions(user: User, raw: unknown) {
  const input = (raw || {}) as Record<string, unknown>;
  const animeId = Number(input.animeId);
  const requested = Array.isArray(input.episodes)
    ? [...new Set(input.episodes.map(Number))]
    : [Number(input.episode)];
  if (!Number.isInteger(animeId) || animeId < 1 || animeId > 999999999)
    throw new ApiError('Некорректный тайтл.', 400, 'INVALID_ANIME');
  if (
    !requested.length ||
    requested.length > 50 ||
    requested.some(
      (episode) =>
        !Number.isInteger(episode) || episode < 1 || episode > 100000,
    )
  )
    throw new ApiError(
      'Выберите от 1 до 50 серий.',
      400,
      'INVALID_EPISODE_RANGE',
    );
  const access = await plusEntitlements(user.id);
  if (!access.canDownload)
    throw new ApiError('Доступно с AniMonster Plus', 403, 'PLUS_REQUIRED');
  const { release } = await nativeRelease(animeId);
  if (normalize(release).is_adult && !user.adult_confirmed_at)
    throw new ApiError(
      'Подтвердите совершеннолетие в аккаунте.',
      403,
      'adult_confirmation_required',
    );
  const byOrdinal = new Map(
    (release.episodes || []).map((item) => [item.ordinal, item]),
  );
  const items = requested.flatMap((episode) => {
    const target = byOrdinal.get(episode);
    if (!target) return [];
    const qualities = OFFLINE_QUALITIES.filter(
      (quality) => !!target[`hls_${quality}` as keyof Episode],
    );
    return qualities.length ? [{ episode, qualities }] : [];
  });
  const qualities = OFFLINE_QUALITIES.filter(
    (quality) =>
      items.length > 0 &&
      items.every((item) => item.qualities.includes(quality)),
  );
  if (!qualities.length)
    throw new ApiError(
      'Для этой серии офлайн-загрузка пока недоступна',
      404,
      'DOWNLOAD_SOURCE_MISSING',
    );
  return {
    ok: true,
    provider: 'aniliberty' as const,
    qualities,
    items,
    unavailableEpisodes: requested.filter(
      (episode) => !items.some((item) => item.episode === episode),
    ),
  };
}

export async function prepareOfflineDownloads(user: User, raw: unknown) {
  const input = offlineRangeSelection(raw);
  if ('code' in input)
    throw new ApiError(input.message, input.status, input.code);
  const access = await plusEntitlements(user.id);
  const entitlement = offlineEntitlementIssue(access.canDownload);
  if (entitlement)
    throw new ApiError(
      entitlement.message,
      entitlement.status,
      entitlement.code,
    );
  await rateLimit(user.id);
  const { release, anime } = await nativeRelease(input.animeId);
  if (anime.is_adult && !user.adult_confirmed_at)
    throw new ApiError(
      'Подтвердите совершеннолетие в аккаунте.',
      403,
      'adult_confirmation_required',
    );
  const byOrdinal = new Map(
    (release.episodes || []).map((item) => [item.ordinal, item]),
  );
  const targets = input.episodes.map((episode) => byOrdinal.get(episode));
  if (targets.some((target) => !target))
    throw new ApiError(
      'Часть серий не найдена у нативного источника.',
      404,
      'DOWNLOAD_EPISODE_MISSING',
    );
  const typedTargets = targets as Episode[];
  const batchUrlLifetime = Math.min(
    6 * 60 * 60 * 1000,
    Math.max(DOWNLOAD_URL_LIFETIME_MS, typedTargets.length * 10 * 60 * 1000),
  );
  const availability = await syncEpisodeAccess(
    anime.id,
    'aniliberty',
    typedTargets.map((target) => target.ordinal),
  );
  const items = [];
  for (const target of typedTargets) {
    const freeAt = availability.get(target.ordinal)?.freeAt || 0;
    if (!(await canWatchEpisode(user.id, freeAt)))
      throw new ApiError('Серия пока недоступна.', 403, 'PLUS_EARLY_ACCESS');
    const source = target[`hls_${input.quality}` as keyof Episode];
    if (typeof source !== 'string' || !source)
      throw new ApiError('Это качество недоступно.', 400, 'INVALID_QUALITY');
    const expiresAt = now() + batchUrlLifetime;
    const downloadId = uid();
    await db()
      .prepare(
        "INSERT INTO offline_downloads(id,user_id,anime_id,episode,quality,provider,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'prepared',?,?)",
      )
      .bind(
        downloadId,
        user.id,
        anime.id,
        target.ordinal,
        input.quality,
        'aniliberty',
        now(),
        now(),
      )
      .run();
    items.push({
      ok: true as const,
      downloadId,
      animeId: anime.id,
      animeTitle: anime.russian || anime.name,
      animePoster: proxyImageUrl(anime.image.original),
      episode: target.ordinal,
      duration: target.duration,
      quality: input.quality,
      voiceoverId: 'aniliberty' as const,
      voiceoverName: 'AniLiberty',
      provider: 'aniliberty' as const,
      manifestUrl: await mediaProxyUrl(source, expiresAt, {
        userId: user.id,
        freeAt,
      }),
      expiresAt,
      offlineAccessUntil: Math.min(
        access.premiumUntil,
        now() + OFFLINE_LICENSE_MS,
      ),
    });
  }
  return { ok: true as const, items };
}

export async function prepareOfflineDownload(user: User, raw: unknown) {
  const input = parseOfflineRequest(raw);
  const access = await plusEntitlements(user.id);
  const entitlement = offlineEntitlementIssue(access.canDownload);
  if (entitlement)
    throw new ApiError(
      entitlement.message,
      entitlement.status,
      entitlement.code,
    );
  await rateLimit(user.id);
  const { release, anime } = await nativeRelease(input.animeId);
  if (anime.is_adult && !user.adult_confirmed_at)
    throw new ApiError(
      'Подтвердите совершеннолетие в аккаунте.',
      403,
      'adult_confirmation_required',
    );
  const target = (release.episodes || []).find(
    (item) => item.ordinal === input.episode,
  );
  if (!target)
    throw new ApiError(
      'Серия не найдена у нативного источника.',
      404,
      'DOWNLOAD_EPISODE_MISSING',
    );
  const availability = await syncEpisodeAccess(anime.id, 'aniliberty', [
    target.ordinal,
  ]);
  const freeAt = availability.get(target.ordinal)?.freeAt || 0;
  if (!(await canWatchEpisode(user.id, freeAt)))
    throw new ApiError('Серия пока недоступна.', 403, 'PLUS_EARLY_ACCESS');
  const source = target[`hls_${input.quality}` as keyof Episode];
  if (typeof source !== 'string' || !source)
    throw new ApiError('Это качество недоступно.', 400, 'INVALID_QUALITY');
  const expiresAt = now() + DOWNLOAD_URL_LIFETIME_MS;
  const downloadId = uid();
  await db()
    .prepare(
      "INSERT INTO offline_downloads(id,user_id,anime_id,episode,quality,provider,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'prepared',?,?)",
    )
    .bind(
      downloadId,
      user.id,
      anime.id,
      target.ordinal,
      input.quality,
      'aniliberty',
      now(),
      now(),
    )
    .run();
  return {
    ok: true,
    downloadId,
    animeId: anime.id,
    animeTitle: anime.russian || anime.name,
    animePoster: proxyImageUrl(anime.image.original),
    episode: target.ordinal,
    duration: target.duration,
    quality: input.quality,
    voiceoverId: 'aniliberty',
    voiceoverName: 'AniLiberty',
    provider: 'aniliberty' as const,
    manifestUrl: await mediaProxyUrl(source, expiresAt, {
      userId: user.id,
      freeAt,
    }),
    expiresAt,
    offlineAccessUntil: Math.min(
      access.premiumUntil,
      now() + OFFLINE_LICENSE_MS,
    ),
  };
}
