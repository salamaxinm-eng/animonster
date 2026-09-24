'use client';

import { useEffect, useRef, useState } from 'react';
import { getOfflineEpisode, putOfflineEpisode } from '@/lib/offline/db';
import {
  createOfflineHlsLoader,
  offlinePlaybackUrl,
} from '@/lib/offline/player';
import { refreshOfflineLicense } from '@/lib/offline/downloader';
import type { OfflineEpisode } from '@/lib/offline/types';

export function OfflinePlayer({ id }: { id: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [episode, setEpisode] = useState<OfflineEpisode | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void getOfflineEpisode(id).then((value) => setEpisode(value || null));
  }, [id]);
  useEffect(() => {
    if (!episode || episode.status !== 'completed' || !video.current) return;
    if (episode.offlineAccessUntil < Date.now()) return;
    let engine: import('hls.js').default | undefined;
    let cancelled = false;
    let startupStage = 'инициализация плеера';
    let startupTimer: number | undefined;
    const element = video.current;
    setError('');
    void import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setError(
            'Офлайн-плеер недоступен в этой версии браузера. Обновите систему или откройте установленную PWA.',
          );
          return;
        }
        engine = new Hls({
          loader: createOfflineHlsLoader(episode) as any,
          enableWorker: false,
          startFragPrefetch: true,
        });
        engine.on(Hls.Events.MEDIA_ATTACHED, () => {
          startupStage = 'чтение локального плейлиста';
        });
        engine.on(Hls.Events.MANIFEST_PARSED, () => {
          startupStage = 'подготовка первого сегмента';
        });
        engine.on(Hls.Events.FRAG_BUFFERED, () => {
          if (startupTimer) window.clearTimeout(startupTimer);
          startupTimer = undefined;
          setError('');
        });
        engine.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal)
            setError(
              `Не удалось прочитать локальную копию серии (${data.details}).`,
            );
        });
        engine.loadSource(offlinePlaybackUrl(episode));
        engine.attachMedia(element);
        startupTimer = window.setTimeout(() => {
          setError(`Офлайн-плеер завис на этапе: ${startupStage}.`);
        }, 12_000);
      })
      .catch(() =>
        setError('Не удалось запустить офлайн-плеер. Обновите страницу.'),
      );
    return () => {
      cancelled = true;
      if (startupTimer) window.clearTimeout(startupTimer);
      engine?.destroy();
    };
  }, [episode?.id, episode?.status, episode?.offlineAccessUntil]);
  if (!episode) return <p>Загрузка не найдена на этом устройстве.</p>;
  if (episode.offlineAccessUntil < Date.now())
    return (
      <div className="offline-license-message">
        <p>Подключитесь к интернету, чтобы подтвердить AniMonster Plus</p>
        <button
          className="primary"
          onClick={() =>
            void refreshOfflineLicense(episode)
              .then(setEpisode)
              .catch((reason) => setError(reason.message))
          }
        >
          Подтвердить подписку
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  return (
    <div className="offline-watch">
      <h1>{episode.animeTitle}</h1>
      <p>
        Серия {episode.episode} · {episode.quality}p · доступно офлайн
      </p>
      <div className="player">
        <video
          ref={video}
          controls
          playsInline
          disableRemotePlayback
          onCanPlay={() => setError('')}
          onError={() => {
            const code = video.current?.error?.code;
            setError(
              `Safari не смог декодировать локальное видео${code ? ` (код ${code})` : ''}.`,
            );
          }}
          onEnded={() => {
            episode.watchedAt = Date.now();
            episode.updatedAt = Date.now();
            void putOfflineEpisode(episode);
          }}
        />
      </div>
      {error && (
        <p className="playback-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
