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
    const element = video.current;
    void import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setError(
            'Офлайн-плеер недоступен в этой версии браузера. Обновите систему или откройте установленную PWA.',
          );
          return;
        }
        engine = new Hls({ loader: createOfflineHlsLoader(episode) as any });
        engine.attachMedia(element);
        engine.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (!cancelled) engine?.loadSource(offlinePlaybackUrl(episode));
        });
        engine.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal)
            setError(
              `Не удалось прочитать локальную копию серии (${data.details}).`,
            );
        });
      })
      .catch(() =>
        setError('Не удалось запустить офлайн-плеер. Обновите страницу.'),
      );
    return () => {
      cancelled = true;
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
