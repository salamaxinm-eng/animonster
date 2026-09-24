'use client';

import { getOfflineEpisode, putOfflineEpisode } from './db';
import {
  cachePoster,
  deleteOfflineFiles,
  offlineFileExists,
  storageEstimate,
  writeResponseFile,
} from './storage';
import { masterVariant, parseMediaPlaylist } from './hls';
import { deleteOfflineData } from './delete';
import type {
  OfflineEpisode,
  OfflineManifest,
  OfflinePrepareResponse,
} from './types';

const controllers = new Map<string, AbortController>();
const MIN_FREE_BYTES = 64 * 1024 * 1024;
export const OFFLINE_CHANGE_EVENT = 'animonster-offline-change';
export const offlineDownloadActive = (id: string) => controllers.has(id);

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

export async function offlineOptions(animeId: number, episode: number) {
  return requestJson<{
    qualities: (480 | 720 | 1080)[];
    provider: 'aniliberty';
  }>('/api/offline/options', { animeId, episode });
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
) {
  if (!current) return fresh;
  const old = new Map(current.segments.map((item) => [item.id, item]));
  for (const segment of fresh.segments) {
    const saved = old.get(segment.id);
    if (
      saved?.downloaded &&
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
  episode.status = 'downloading';
  episode.error = undefined;
  episode.offlineAccessUntil = prepared.offlineAccessUntil;
  episode.downloadId = prepared.downloadId;
  episode.manifestData = await verifiedManifest(
    episode.manifestData,
    await fetchManifest(prepared, episode.id),
    episode.id,
  );
  episode.downloadedBytes = episode.manifestData.segments.reduce(
    (sum, item) => sum + (item.downloaded ? item.size : 0),
    0,
  );
  const estimate = await storageEstimate();
  if (estimate.quota && estimate.quota - estimate.usage < MIN_FREE_BYTES)
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
    while (cursor < queue.length) {
      const item = queue[cursor++];
      const response = await fetch(item.remoteUrl, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Источник прервал загрузку сегмента.');
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
      item.downloaded = true;
      episode.size = episode.manifestData!.segments.reduce(
        (sum, value) => sum + (value.downloaded ? value.size : 0),
        0,
      );
      episode.updatedAt = Date.now();
      await putOfflineEpisode(episode);
      notify({ ...episode });
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length || 1) }, worker),
    );
    episode.status = 'completed';
    episode.completedAt = Date.now();
    episode.updatedAt = Date.now();
    episode.speedBytesPerSecond = 0;
    await putOfflineEpisode(episode);
    await cachePoster(episode.animePoster);
    notify({ ...episode });
    void requestJson('/api/offline/status', {
      downloadId: episode.downloadId,
      status: 'completed',
    }).catch(() => {});
  } catch (error) {
    episode.status = controller.signal.aborted ? 'paused' : 'failed';
    episode.error = controller.signal.aborted
      ? undefined
      : (error as Error).message || 'Не удалось продолжить загрузку';
    episode.updatedAt = Date.now();
    episode.speedBytesPerSecond = 0;
    await putOfflineEpisode(episode);
    notify({ ...episode });
    if (!controller.signal.aborted) throw error;
  } finally {
    if (controllers.get(episode.id) === controller)
      controllers.delete(episode.id);
  }
  return episode;
}

export async function startOfflineDownload(input: {
  animeId: number;
  episode: number;
  quality: 480 | 720 | 1080;
}) {
  const prepared = await requestJson<OfflinePrepareResponse>(
    '/api/offline/prepare',
    {
      ...input,
      voiceoverId: 'aniliberty',
    },
  );
  const id = `${prepared.animeId}-${prepared.episode}-${prepared.quality}`;
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
  await putOfflineEpisode(episode);
  await cachePoster(episode.animePoster).catch(() => {});
  notify(episode);
  void downloadPrepared(episode, prepared).catch(() => {});
  return episode;
}

export async function resumeOfflineDownload(id: string) {
  const episode = await getOfflineEpisode(id);
  if (!episode) throw new Error('Загрузка не найдена.');
  const prepared = await requestJson<OfflinePrepareResponse>(
    '/api/offline/prepare',
    {
      animeId: episode.animeId,
      episode: episode.episode,
      quality: episode.quality,
      voiceoverId: 'aniliberty',
    },
  );
  void downloadPrepared(episode, prepared).catch(() => {});
  return episode;
}

export async function pauseOfflineDownload(id: string) {
  controllers.get(id)?.abort();
  const episode = await getOfflineEpisode(id);
  if (episode && episode.status === 'downloading') {
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
    void requestJson('/api/offline/status', {
      downloadId: episode.downloadId,
      status: 'deleted',
    }).catch(() => {});
  }
}

export async function refreshOfflineLicense(episode: OfflineEpisode) {
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
