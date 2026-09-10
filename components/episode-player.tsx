'use client';
import { useEffect, useRef, useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { Episode } from '@/lib/anime';
import { useCommunity } from '@/components/community/context';
export function EpisodePlayer({
  episodes,
  initialEpisode = 1,
  animeId,
  initialPosition = 0,
  onEpisodeChange,
  onRetry,
}: {
  episodes: Episode[];
  initialEpisode?: number;
  animeId?: number;
  initialPosition?: number;
  onEpisodeChange: (n: number) => void;
  onRetry: () => void;
}) {
  const [index, setIndex] = useState(() =>
      Math.max(
        0,
        episodes.findIndex((e) => e.ordinal === initialEpisode),
      ),
    ),
    [quality, setQuality] = useState('720'),
    [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const resumed = useRef('');
  const { user } = useCommunity();
  const episode = episodes[Math.min(index, episodes.length - 1)];
  useEffect(() => {
    if (!animeId || !episode) return;
    let token = '',
      seconds = 0,
      cancelled = false,
      sending = false;
    const el = video.current;
    void fetch('/api/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        anime_id: animeId,
        episode: episode.ordinal,
      }),
    })
      .then((r) => r.json())
      .then((x: any) => {
        if (!cancelled) token = x.token || '';
      })
      .catch(() => {});
    const flush = () => {
      if (!token || !el || sending) return;
      const amount = seconds;
      seconds = 0;
      sending = true;
      void fetch('/api/watch', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          seconds: amount,
          position: el.currentTime,
        }),
      })
        .catch(() => {})
        .finally(() => {
          sending = false;
        });
    };
    let ticks = 0;
    const timer = setInterval(() => {
      if (el && !el.paused && !el.seeking && el.readyState >= 3) seconds++;
      if (++ticks % 15 === 0) flush();
    }, 1000);
    el?.addEventListener('pause', flush);
    el?.addEventListener('ended', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      cancelled = true;
      clearInterval(timer);
      el?.removeEventListener('pause', flush);
      el?.removeEventListener('ended', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [animeId, episode?.id, user?.id]);
  const stream = episode
    ? (quality === '1080'
        ? episode.hls_1080
        : quality === '480'
          ? episode.hls_480
          : episode.hls_720) ||
      episode.hls_720 ||
      episode.hls_480 ||
      episode.hls_1080
    : null;
  useEffect(() => {
    if (episode) onEpisodeChange(episode.ordinal);
  }, [episode?.id]);
  useEffect(() => {
    setError('');
    if (!stream || !video.current) return;
    let engine: import('hls.js').default | undefined,
      cancelled = false;
    const el = video.current;
    void import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          if (el.canPlayType('application/vnd.apple.mpegurl')) {
            el.src = stream;
            return;
          }
          setError(
            'Этот браузер не поддерживает HLS-видео. Попробуйте Chrome, Edge или Safari.',
          );
          return;
        }
        engine = new Hls();
        let recovered = false;
        engine.loadSource(stream);
        engine.attachMedia(el);
        engine.on(Hls.Events.ERROR, (_, d) => {
          if (d.fatal && d.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
            recovered = true;
            engine?.recoverMediaError();
            return;
          }
          if (d.fatal)
            setError(
              'Источник не загрузил видео. Повторите попытку или выберите другую серию.',
            );
        });
        engine.on(Hls.Events.FRAG_BUFFERED, () => setError(''));
      })
      .catch(() => {
        if (!cancelled)
          setError('Не удалось загрузить плеер. Обновите страницу.');
      });
    return () => {
      cancelled = true;
      engine?.destroy();
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }, [stream]);
  return (
    <div className="episode-view">
      <div className="player">
        <video
          ref={video}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={() => {
            if (
              video.current &&
              resumed.current !== episode.id &&
              episode.ordinal === initialEpisode &&
              initialPosition > 0
            ) {
              resumed.current = episode.id;
              video.current.currentTime = Math.min(
                initialPosition,
                Math.max(0, video.current.duration - 1),
              );
            }
          }}
          onEnded={() => {
            if (index < episodes.length - 1) setIndex(index + 1);
          }}
          onError={() =>
            setError('Не удалось воспроизвести видео. Обновите источник.')
          }
          aria-label={'Серия ' + episode?.ordinal}
        />
      </div>
      {error && (
        <div className="playback-error" role="alert">
          {error}
          <button onClick={onRetry}>
            <RefreshCw size={15} /> Обновить источник
          </button>
        </div>
      )}
      <div className="episode-toolbar">
        <NativeSelect
          aria-label="Выбор серии"
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
        >
          {episodes.map((e, i) => (
            <option value={i} key={e.id}>
              Серия {e.ordinal} · {e.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Качество видео"
          value={
            episode?.[('hls_' + quality) as keyof Episode]
              ? quality
              : episode?.hls_720
                ? '720'
                : episode?.hls_480
                  ? '480'
                  : '1080'
          }
          onChange={(e) => setQuality(e.target.value)}
        >
          {['480', '720', '1080']
            .filter((q) => episode?.[('hls_' + q) as keyof Episode])
            .map((q) => (
              <option key={q} value={q}>
                {q}p
              </option>
            ))}
        </NativeSelect>
        <button
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
          aria-label="Предыдущая серия"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          disabled={index >= episodes.length - 1}
          onClick={() => setIndex(index + 1)}
          aria-label="Следующая серия"
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <p className="source-note">
        Озвучка и видео: AniLiberty · {episodes.length} серий доступно
      </p>
    </div>
  );
}
