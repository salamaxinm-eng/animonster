'use client';
import { useEffect, useRef, useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { Episode, Voiceover } from '@/lib/anime';
import { useCommunity } from '@/components/community/context';
export function EpisodePlayer({
  episodes,
  voiceovers,
  animeTitle,
  initialEpisode = 1,
  animeId,
  initialPosition = 0,
  onEpisodeChange,
  onRetry,
}: {
  episodes: Episode[];
  voiceovers: Voiceover[];
  animeTitle: string;
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
    [voiceoverId, setVoiceoverId] = useState('aniliberty'),
    [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const resumed = useRef('');
  const { user } = useCommunity();
  const episode = episodes[Math.min(index, episodes.length - 1)];
  const voiceover =
    voiceovers.find((item) => item.id === voiceoverId) || voiceovers[0];
  const isKodik = voiceover?.provider === 'kodik';
  const lastVoiceoverIndex = Math.max(
    0,
    episodes.findLastIndex((item) => item.ordinal <= (voiceover?.episodes || 1)),
  );
  useEffect(() => {
    if (index > lastVoiceoverIndex) setIndex(lastVoiceoverIndex);
  }, [voiceoverId, lastVoiceoverIndex]);
  useEffect(() => {
    if (!animeId || !episode) return;
    let token = '',
      seconds = 0,
      cancelled = false,
      sending = false;
    const el = video.current;
    if (isKodik) return;
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
  }, [animeId, episode?.id, user?.id, isKodik]);

  useEffect(() => {
    if (!animeId || !episode || !isKodik) return;
    let token = '',
      seconds = 0,
      position = episode.ordinal === initialEpisode ? initialPosition : 0,
      lastPosition = position,
      cancelled = false,
      sending = false;
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
      if (!token || sending || seconds < 1) return;
      const amount = Math.floor(seconds);
      seconds = 0;
      sending = true;
      void fetch('/api/watch', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, seconds: amount, position }),
      })
        .catch(() => {})
        .finally(() => {
          sending = false;
        });
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      let payload = event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      const next = Number(payload?.kodik_player_time_update);
      if (!Number.isFinite(next) || next < 0 || next > 24 * 60 * 60) return;
      const delta = next - lastPosition;
      if (delta > 0 && delta < 10) seconds += delta;
      position = next;
      lastPosition = next;
    };
    const timer = setInterval(flush, 15000);
    window.addEventListener('message', receive);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('message', receive);
      window.removeEventListener('pagehide', flush);
    };
  }, [animeId, episode?.id, user?.id, isKodik, voiceoverId]);
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
    if (isKodik || !stream || !video.current) return;
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
  }, [stream, isKodik]);

  const iframeUrl = (() => {
    if (!isKodik || !voiceover.player_url || !episode) return '';
    try {
      const url = new URL(voiceover.player_url);
      url.searchParams.set('episode', String(episode.ordinal));
      if (episode.ordinal === initialEpisode && initialPosition > 0)
        url.searchParams.set('start_from', String(Math.floor(initialPosition)));
      return url.href;
    } catch {
      return '';
    }
  })();
  return (
    <div className="episode-view">
      <div className="player">
        {isKodik ? (
          iframeUrl ? (
            <iframe
              ref={frame}
              key={voiceover.id + ':' + episode.ordinal}
              src={iframeUrl}
              title={`${animeTitle} — ${voiceover.title}, серия ${episode.ordinal}`}
              referrerPolicy="origin"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
            />
          ) : (
            <p>Эта озвучка временно недоступна.</p>
          )
        ) : (
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
        )}
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
        {voiceovers.length > 1 && <NativeSelect
          className="voiceover-select"
          aria-label="Выбор озвучки"
          value={voiceover?.id || 'aniliberty'}
          onChange={(e) => setVoiceoverId(e.target.value)}
        >
          {voiceovers.map((item) => (
            <option value={item.id} key={item.id}>
              {item.title} · {item.episodes} серий
            </option>
          ))}
        </NativeSelect>}
        <NativeSelect
          className="episode-select"
          aria-label="Выбор серии"
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
        >
          {episodes.slice(0, lastVoiceoverIndex + 1).map((e, i) => (
            <option value={i} key={e.id}>
              Серия {e.ordinal} · {e.name}
            </option>
          ))}
        </NativeSelect>
        {!isKodik && <NativeSelect
          className="quality-select"
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
        </NativeSelect>}
        <button
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
          aria-label="Предыдущая серия"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          disabled={index >= lastVoiceoverIndex}
          onClick={() => setIndex(index + 1)}
          aria-label="Следующая серия"
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <p className="source-note">
        Озвучка: {voiceover?.title || 'AniLiberty'} ·{' '}
        {voiceover?.episodes || episodes.length} серий доступно
      </p>
    </div>
  );
}
