'use client';

import { useEffect, useRef, useState } from 'react';
import { getOfflineEpisode, putOfflineEpisode } from '@/lib/offline/db';
import {
  createOfflineHlsLoader,
  offlinePlaybackUrl,
} from '@/lib/offline/player';
import { refreshOfflineLicense } from '@/lib/offline/downloader';
import type { OfflineEpisode } from '@/lib/offline/types';
import { readOfflineFile } from '@/lib/offline/storage';
import { demoProgressKey, type DemoProgress } from '@/lib/demo-session';
import { seasonPoint } from '@/lib/demo-season';
import { offlineEpisodeLabel } from '@/lib/offline/demo';

export function OfflinePlayer({ id }: { id: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [episode, setEpisode] = useState<OfflineEpisode | null>(null);
  const [error, setError] = useState('');
  const [playbackTime, setPlaybackTime] = useState(0);
  const [subtitles, setSubtitles] = useState<
    { url: string; title: string; language: string }[]
  >([]);
  const savedAt = useRef(0);
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
    if (episode.provider === 'demo') {
      const urls: string[] = [];
      void (async () => {
        const parts = [];
        for (const item of episode.manifestData?.segments.filter(
          (part) => part.kind === 'segment',
        ) || []) {
          if (!item.downloaded) throw new Error('Серия скачана не полностью');
          parts.push(await readOfflineFile(episode.id, item.fileName));
        }
        if (!parts.length) throw new Error('Локальное видео отсутствует');
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob(parts, { type: 'video/mp4' }));
        urls.push(url);
        element.src = url;
        const tracks = [];
        for (const track of episode.offlineSubtitles || []) {
          const blob = await readOfflineFile(episode.id, track.fileName);
          if (cancelled) return;
          const url = URL.createObjectURL(
            new Blob([blob], { type: 'text/vtt' }),
          );
          urls.push(url);
          tracks.push({ ...track, url });
        }
        if (!cancelled) setSubtitles(tracks);
      })().catch((cause) => {
        if (!cancelled) setError((cause as Error).message);
      });
      return () => {
        cancelled = true;
        element.removeAttribute('src');
        element.load();
        urls.forEach((url) => URL.revokeObjectURL(url));
      };
    }
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
  function rememberPosition(force = false) {
    if (!video.current || !episode || video.current.readyState === 0) return;
    setPlaybackTime(video.current.currentTime);
    if (!force && Date.now() - savedAt.current < 5000) return;
    savedAt.current = Date.now();
    episode.position = video.current.currentTime;
    episode.updatedAt = Date.now();
    void putOfflineEpisode(episode);
    if (episode.provider === 'demo') {
      const point = episode.season
        ? seasonPoint(
            {
              duration: episode.duration || video.current.duration,
              chapters: episode.season.chapters,
            },
            episode.position,
          )
        : { episode: episode.episode, position: episode.position };
      const item: DemoProgress = {
        ...point,
        voice: episode.voiceoverId,
        updatedAt: Date.now(),
      };
      try {
        const key = demoProgressKey(episode.ownerId),
          data = JSON.parse(localStorage.getItem(key) || '{}');
        data[item.episode] = item;
        localStorage.setItem(key, JSON.stringify(data));
      } catch {}
    }
  }
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
        {offlineEpisodeLabel(episode)} · {episode.quality}p · доступно офлайн
      </p>
      <div className="player">
        <video
          ref={video}
          controls
          playsInline
          disableRemotePlayback
          onLoadedMetadata={() => {
            if (video.current)
              video.current.currentTime = Math.min(
                episode.position || 0,
                Math.max(0, video.current.duration - 1),
              );
            setPlaybackTime(video.current?.currentTime || 0);
          }}
          onTimeUpdate={() => rememberPosition()}
          onPause={() => rememberPosition(true)}
          onSeeked={() => rememberPosition(true)}
          onCanPlay={() => setError('')}
          onError={() => {
            const code = video.current?.error?.code;
            setError(
              `Браузер не смог декодировать локальное видео${code ? ` (код ${code})` : ''}.`,
            );
          }}
          onEnded={() => {
            rememberPosition(true);
            episode.watchedAt = Date.now();
            episode.updatedAt = Date.now();
            void putOfflineEpisode(episode);
          }}
        >
          {subtitles.map((track) => (
            <track
              key={track.url}
              kind="subtitles"
              src={track.url}
              srcLang={track.language}
              label={track.title}
            />
          ))}
        </video>
      </div>
      {episode.season && (
        <nav
          className="demo-offline-chapters"
          aria-label="Серии в скачанном видео"
        >
          {episode.season.chapters.map((chapter) => (
            <button
              key={chapter.episode}
              aria-current={
                playbackTime >= chapter.start && playbackTime < chapter.stop
                  ? 'true'
                  : undefined
              }
              onClick={() => {
                if (video.current) {
                  video.current.currentTime = chapter.start;
                  void video.current.play().catch(() => {});
                }
              }}
            >
              Серия {chapter.episode}
            </button>
          ))}
        </nav>
      )}
      {error && (
        <p className="playback-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
