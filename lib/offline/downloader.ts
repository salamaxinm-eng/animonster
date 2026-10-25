'use client';

import { getOfflineEpisode, putOfflineEpisode } from './db';
import {
  cachePoster,
  deleteOfflineFiles,
  ensureOfflineStorage,
  offlineFileExists,
  storageEstimate,
  writeResponseFile,
} from './storage';
import { masterVariant, parseMediaPlaylist } from './hls';
import { deleteOfflineData } from './delete';
import {
  demoDownloadManifest,
  validRangeResponse,
  savedDemoPreparation,
} from './demo';
import type {
  OfflineEpisode,
  OfflineManifest,
  OfflinePrepareResponse,
} from './types';

const controllers = new Map<string, AbortController>();
const pending: Array<{
  episode: OfflineEpisode;
  prepared: OfflinePrepareResponse;
}> = [];
let pumping = false;
const MIN_FREE_BYTES = 64 * 1024 * 1024;
export const OFFLINE_CHANGE_EVENT = 'animonster-offline-change';
export const offlineDownloadActive = (id: string) =>
  controllers.has(id) || pending.some((item) => item.episode.id === id);

const notify = (episode: OfflineEpisode) =>
  window.dispatchEvent(
    new CustomEvent(OFFLINE_CHANGE_EVENT, { detail: episode }),
  );

async function requestJson<T>(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || 'Не удалось подготовить загрузку');
  return result as T;
}

export async function offlineOptions(
  animeId: number,
  episodes: number | number[],
) {
  return requestJson<{
    qualities: (480 | 720 | 1080)[];
    provider: 'aniliberty';
    items: Array<{
      episode: number;
      qualities: (480 | 720 | 1080)[];
    }>;
    unavailableEpisodes: number[];
  }>('/api/offline/options', {
    animeId,
    ...(Array.isArray(episodes) ? { episodes } : { episode: episodes }),
  });
}

function absolute(value: string, base: string) {
  return new URL(value, new URL(base, location.origin)).href;
}

async function fetchManifest(
  prepared: OfflinePrepareResponse,
  episodeId: string,
) {
  let url = absolute(prepared.manifestUrl, location.origin);
  let response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('Не удалось получить HLS-плейлист.');
  let text = await response.text();
  const variant = masterVariant(text, url, prepared.quality);
  if (variant) {
    url = variant;
    response = await fetch(url, { credentials: 'include' });
    if (!response.ok)
      throw new Error('Не удалось получить выбранное качество.');
    text = await response.text();
  }
  return parseMediaPlaylist(text, url, episodeId);
}

async function verifiedManifest(
  current: OfflineManifest | undefined,
  fresh: OfflineManifest,
  episodeId: string,
  strict = false,
) {
  if (!current) return fresh;
  const old = new Map(current.segments.map((item) => [item.id, item]));
  for (const segment of fresh.segments) {
    const saved = old.get(segment.id);
    if (
      saved?.downloaded &&
      (!strict || saved.remoteUrl === segment.remoteUrl) &&
      (await offlineFileExists(episodeId, saved.fileName))
    ) {
      segment.downloaded = true;
      segment.size = saved.size;
      segment.mimeType = saved.mimeType;
    }
  }
  return fresh;
}

async function downloadPrepared(
  episode: OfflineEpisode,
  prepared: OfflinePrepareResponse,
) {
  const controller = new AbortController();
  controllers.get(episode.id)?.abort();
  controllers.set(episode.id, controller);
  let workerFailure: unknown;
  try {
    episode.status = 'downloading';
    episode.error = undefined;
    episode.offlineAccessUntil = prepared.offlineAccessUntil;
    episode.downloadId = prepared.downloadId;
    episode.manifestData = await verifiedManifest(
      episode.manifestData,
      prepared.provider === 'demo'
        ? demoDownloadManifest(prepared)
        : await fetchManifest(prepared, episode.id),
      episode.id,
      prepared.provider === 'demo',
    );
    if (prepared.provider === 'demo') {
      episode.mimeType = 'video/mp4';
      episode.totalBytes = prepared.mediaSize;
      episode.offlineSubtitles = (prepared.subtitles || []).map(
        (track, index) => ({
          fileName: `subtitle-${index}.vtt`,
          title: track.title,
          language: track.language,
        }),
      );
    }
    episode.downloadedBytes = episode.manifestData.segments.reduce(
      (sum, item) => sum + (item.downloaded ? item.size : 0),
      0,
    );
    const estimate = await storageEstimate();
    if (
      estimate.quota &&
      estimate.quota - estimate.usage <
        MIN_FREE_BYTES +
          (prepared.provider === 'demo'
            ? Math.max(0, (prepared.mediaSize || 0) - episode.downloadedBytes)
            : 0)
    )
      throw new Error('Недостаточно свободного места');
    if (navigator.storage?.persist && !(await navigator.storage.persisted?.()))
      await navigator.storage.persist().catch(() => false);
    await putOfflineEpisode(episode);
    notify(episode);
    const queue = episode.manifestData.segments.filter(
      (item) => !item.downloaded,
    );
    let cursor = 0;
    let bytesWindow = 0;
    let windowStarted = performance.now();
    const worker = async () => {
      try {
        while (cursor < queue.length) {
          const item = queue[cursor++];
          const response = await fetch(item.remoteUrl, {
            credentials: 'include',
            signal: controller.signal,
            ...(item.rangeStart !== undefined
              ? {
                  headers: {
                    Range: `bytes=${item.rangeStart}-${item.rangeEnd}`,
                  },
                }
              : {}),
          });
          if (!response.ok)
            throw new Error('Источник прервал загрузку сегмента.');
          if (
            item.rangeStart !== undefined &&
            (response.status !== 206 ||
              !validRangeResponse(
                response.headers.get('content-range'),
                item.rangeStart,
                item.rangeEnd!,
                prepared.mediaSize!,
              ))
          )
            throw new Error('Сервер не подтвердил диапазон загрузки.');
          item.mimeType =
            response.headers.get('content-type') || 'application/octet-stream';
          item.size = await writeResponseFile(
            episode.id,
            item.fileName,
            response,
            controller.signal,
            (bytes) => {
              episode.downloadedBytes += bytes;
              bytesWindow += bytes;
              const elapsed = performance.now() - windowStarted;
              if (elapsed >= 750) {
                episode.speedBytesPerSecond = Math.round(
                  (bytesWindow * 1000) / elapsed,
                );
                bytesWindow = 0;
                windowStarted = performance.now();
                notify({ ...episode });
              }
            },
          );
          if (
            item.rangeStart !== undefined &&
            item.size !== item.rangeEnd! - item.rangeStart + 1
          )
            throw new Error(
              'Фрагмент скачан не полностью. Повторите загрузку.',
            );
          item.downloaded = true;
          episode.size = episode.manifestData!.segments.reduce(
            (sum, value) => sum + (value.downloaded ? value.size : 0),
            0,
          );
          episode.updatedAt = Date.now();
          await putOfflineEpisode(episode);
          notify({ ...episode });
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          workerFailure = cause;
          controller.abort();
        }
        throw cause;
      }
    };
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(4, queue.length || 1) }, worker),
    );
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (rejected) throw workerFailure || rejected.reason;
    episode.status = 'completed';
    episode.completedAt = Date.now();
    episode.updatedAt = Date.now();
    episode.speedBytesPerSecond = 0;
    await putOfflineEpisode(episode);
    await cachePoster(episode.animePoster);
    notify({ ...episode });
    if (episode.provider !== 'demo')
      void requestJson('/api/offline/status', {
        downloadId: episode.downloadId,
        status: 'completed',
      }).catch(() => {});
  } catch (error) {
    episode.status =
      controller.signal.aborted && !workerFailure ? 'paused' : 'failed';
    episode.error =
      controller.signal.aborted && !workerFailure
        ? undefined
        : (error as Error).message || 'Не удалось продолжить загрузку';
    episode.updatedAt = Date.now();
    episode.speedBytesPerSecond = 0;
    await putOfflineEpisode(episode);
    notify({ ...episode });
    if (workerFailure || !controller.signal.aborted) throw error;
  } finally {
    if (controllers.get(episode.id) === controller)
      controllers.delete(episode.id);
  }
  return episode;
}

function queuePrepared(
  episode: OfflineEpisode,
  prepared: OfflinePrepareResponse,
) {
  const duplicate = pending.findIndex((item) => item.episode.id === episode.id);
  if (duplicate >= 0) pending.splice(duplicate, 1);
  pending.push({ episode, prepared });
  void pumpDownloads();
}

async function pumpDownloads() {
  if (pumping) return;
  pumping = true;
  try {
    while (pending.length) {
      const item = pending.shift();
      if (!item) continue;
      await downloadPrepared(item.episode, item.prepared).catch(() => {});
    }
  } finally {
    pumping = false;
    if (pending.length) void pumpDownloads();
  }
}

async function savePrepared(prepared: OfflinePrepareResponse) {
  const id =
    prepared.provider === 'demo'
      ? prepared.downloadId
      : `${prepared.animeId}-${prepared.episode}-${prepared.quality}`;
  const existing = await getOfflineEpisode(id);
  const timestamp = Date.now();
  const episode: OfflineEpisode = existing || {
    id,
    downloadId: prepared.downloadId,
    animeId: prepared.animeId,
    animeTitle: prepared.animeTitle,
    animePoster: prepared.animePoster,
    episode: prepared.episode,
    duration: prepared.duration,
    quality: prepared.quality,
    voiceoverId: prepared.voiceoverId,
    voiceoverName: prepared.voiceoverName,
    provider: prepared.provider,
    size: 0,
    downloadedBytes: 0,
    status: 'queued',
    createdAt: timestamp,
    updatedAt: timestamp,
    mimeType: 'application/vnd.apple.mpegurl',
    offlineAccessUntil: prepared.offlineAccessUntil,
  };
  episode.status = 'queued';
  if (prepared.provider === 'demo') {
    episode.season = prepared.season;
    episode.demoSource = {
      mediaUrl: prepared.mediaUrl!,
      mediaSize: prepared.mediaSize!,
      manifestUrl: prepared.manifestUrl,
      subtitles: prepared.subtitles || [],
    };
  }
  episode.error = undefined;
  episode.downloadId = prepared.downloadId;
  episode.offlineAccessUntil = prepared.offlineAccessUntil;
  episode.updatedAt = timestamp;
  await putOfflineEpisode(episode);
  await cachePoster(episode.animePoster).catch(() => {});
  notify(episode);
  queuePrepared(episode, prepared);
  return episode;
}

export async function startOfflineDownload(input: {
  animeId: number;
  episode: number;
  quality: 480 | 720 | 1080;
}) {
  await ensureOfflineStorage();
  const prepared = await requestJson<OfflinePrepareResponse>(
    '/api/offline/prepare',
    {
      ...input,
      voiceoverId: 'aniliberty',
    },
  );
  return savePrepared(prepared);
}

export async function startOfflineRangeDownload(input: {
  animeId: number;
  episodes: number[];
  quality: 480 | 720 | 1080;
}) {
  await ensureOfflineStorage();
  const prepared = await requestJson<{
    ok: true;
    items: OfflinePrepareResponse[];
  }>('/api/offline/prepare', {
    ...input,
    voiceoverId: 'aniliberty',
  });
  const episodes = [];
  for (const item of prepared.items) episodes.push(await savePrepared(item));
  return episodes;
}

export async function resumeOfflineDownload(id: string) {
  const episode = await getOfflineEpisode(id);
  if (!episode) throw new Error('Загрузка не найдена.');
  if (episode.provider === 'demo') {
    const saved = savedDemoPreparation(episode);
    if (saved) {
      queuePrepared(episode, saved);
      return episode;
    }
    const response = await fetch(
      `/api/player-demo/download?episode=${episode.episode}&voice=${encodeURIComponent(episode.voiceoverId)}&quality=${episode.quality}`,
      { cache: 'no-store' },
    );
    const prepared = await response.json();
    if (!response.ok)
      throw new Error(prepared.error || 'Скачивание недоступно');
    queuePrepared(episode, prepared);
    return episode;
  }
  const prepared = await requestJson<OfflinePrepareResponse>(
    '/api/offline/prepare',
    {
      animeId: episode.animeId,
      episode: episode.episode,
      quality: episode.quality,
      voiceoverId: 'aniliberty',
    },
  );
  queuePrepared(episode, prepared);
  return episode;
}

export async function pauseOfflineDownload(id: string) {
  const queued = pending.findIndex((item) => item.episode.id === id);
  if (queued >= 0) pending.splice(queued, 1);
  controllers.get(id)?.abort();
  const episode = await getOfflineEpisode(id);
  if (
    episode &&
    (episode.status === 'downloading' || episode.status === 'queued')
  ) {
    episode.status = 'paused';
    episode.updatedAt = Date.now();
    await putOfflineEpisode(episode);
    notify(episode);
  }
}

export async function deleteOfflineEpisode(id: string) {
  controllers.get(id)?.abort();
  const episode = await getOfflineEpisode(id);
  const { removeOfflineEpisodeMetadata } = await import('./db');
  await deleteOfflineData(id, deleteOfflineFiles, removeOfflineEpisodeMetadata);
  if (episode) {
    notify({ ...episode, status: 'failed', error: 'deleted' });
    if (episode.provider !== 'demo')
      void requestJson('/api/offline/status', {
        downloadId: episode.downloadId,
        status: 'deleted',
      }).catch(() => {});
  }
}

export async function refreshOfflineLicense(episode: OfflineEpisode) {
  if (episode.provider === 'demo') return episode;
  const result = await requestJson<{ offlineAccessUntil: number }>(
    '/api/offline/license',
    { animeId: episode.animeId, episode: episode.episode },
  );
  episode.offlineAccessUntil = result.offlineAccessUntil;
  episode.updatedAt = Date.now();
  await putOfflineEpisode(episode);
  notify(episode);
  return episode;
}

export async function startDemoDownload(
  episode: number,
  voice: string,
  quality: number,
  ownerId?: string,
  seasonId?: string,
) {
  await ensureOfflineStorage();
  if (!navigator.serviceWorker?.controller)
    throw new Error(
      'Офлайн-режим ещё устанавливается. Обновите страницу через несколько секунд.',
    );
  const response = await fetch(
    `/api/player-demo/download?${seasonId ? `season=${encodeURIComponent(seasonId)}` : `episode=${episode}`}&voice=${encodeURIComponent(voice)}&quality=${quality}`,
    { cache: 'no-store' },
  );
  const prepared = await response.json();
  if (!response.ok) throw new Error(prepared.error || 'Скачивание недоступно');
  // Warm the exact offline entry point and the player code before disconnecting.
  await import('@/components/offline-player');
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error('Обновите страницу, чтобы установить офлайн-режим.'));
    }, 10000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      if (event.data?.ok) resolve();
      else
        reject(
          new Error(
            'Не удалось сохранить офлайн-раздел. Проверьте соединение и повторите загрузку.',
          ),
        );
    };
    navigator.serviceWorker.controller!.postMessage(
      { type: 'AM_PREPARE_OFFLINE' },
      [channel.port2],
    );
  });
  const item = await savePrepared(prepared);
  item.ownerId = ownerId;
  await putOfflineEpisode(item);
  return item;
}

export function startDemoSeasonDownload(
  seasonId: string,
  voice: string,
  quality: number,
  ownerId?: string,
) {
  return startDemoDownload(0, voice, quality, ownerId, seasonId);
}
