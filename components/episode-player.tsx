'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import {
  initialVoiceover,
  voiceoverEpisodeIndices,
  type Episode,
  type SkipSegment,
  type Voiceover,
} from '@/lib/anime';
import { api, useCommunity } from '@/components/community/context';
import { kodikEpisodeFromMessage } from '@/lib/kodik-events';

type SkipTimes = {
  opening?: SkipSegment;
  ending?: SkipSegment;
  source: 'override' | 'aniliberty' | 'aniskip' | 'mixed' | 'none';
  confidence: 'exact' | 'matched' | 'unverified';
  opening_confidence?: 'exact' | 'matched' | 'unverified';
  ending_confidence?: 'exact' | 'matched' | 'unverified';
  reference_duration?: number;
};

const AUTO_SKIP_KEY = 'animonster-auto-skip-segments-v1';
export function EpisodePlayer({
  episodes,
  voiceovers,
  voiceoversMessage,
  animeTitle,
  initialEpisode = 1,
  animeId,
  releaseId,
  initialPosition = 0,
  initialVoiceoverId = '',
  onEpisodeChange,
  onPlaybackSelectionChange,
  onRetry,
}: {
  episodes: Episode[];
  voiceovers: Voiceover[];
  voiceoversMessage?: string;
  animeTitle: string;
  initialEpisode?: number;
  animeId?: number;
  releaseId?: number;
  initialPosition?: number;
  initialVoiceoverId?: string;
  onEpisodeChange: (n: number) => void;
  onPlaybackSelectionChange?: (selection: {
    episode: number;
    provider: 'aniliberty' | 'kodik';
    voiceover: string;
  }) => void;
  onRetry: () => void;
}) {
  const [index, setIndex] = useState(() =>
      Math.max(
        0,
        episodes.findIndex((e) => e.ordinal === initialEpisode),
      ),
    ),
    [quality, setQuality] = useState('720'),
    [voiceoverId, setVoiceoverId] = useState(
      () =>
        (voiceovers.some((item) => item.id === initialVoiceoverId)
          ? initialVoiceoverId
          : '') ||
        initialVoiceover(voiceovers, initialEpisode)?.id ||
        'kodik',
    ),
    [error, setError] = useState(''),
    [playbackActive, setPlaybackActive] = useState(false),
    [currentTime, setCurrentTime] = useState(0),
    [kodikDuration, setKodikDuration] = useState<number | null>(null),
    [iframeSeek, setIframeSeek] = useState<number | null>(null),
    [iframeRevision, setIframeRevision] = useState(0),
    [iframeSourceEpisode, setIframeSourceEpisode] = useState(initialEpisode),
    [skipTimes, setSkipTimes] = useState<SkipTimes>({
      source: 'none',
      confidence: 'unverified',
    }),
    [autoSkip, setAutoSkip] = useState<boolean | null>(null),
    [preferenceReady, setPreferenceReady] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const resumed = useRef('');
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const wakeLockRequesting = useRef(false);
  const wakeLockRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackActiveRef = useRef(false);
  const autoplayNext = useRef(false);
  const advancedEpisode = useRef('');
  const community = useCommunity(),
    { user } = community;
  const skippedSegment = useRef('');
  const voiceoverUserSelected = useRef(
    voiceovers.some((item) => item.id === initialVoiceoverId),
  );
  const episode = episodes[Math.min(index, episodes.length - 1)];
  const voiceover =
    voiceovers.find((item) => item.id === voiceoverId) || voiceovers[0];
  const isKodik = voiceover?.provider === 'kodik';
  const availableIndices = useMemo(
    () => voiceoverEpisodeIndices(episodes, voiceover),
    [episodes, voiceover],
  );
  const firstVoiceoverIndex = availableIndices[0] ?? 0;
  const nextIndex = availableIndices.find((value) => value > index);
  const previousIndex = availableIndices.findLast((value) => value < index);
  useEffect(() => {
    if (voiceoverUserSelected.current || !voiceovers.length) return;
    const preferred = initialVoiceover(voiceovers, initialEpisode);
    if (preferred && preferred.id !== voiceoverId) {
      setIframeSourceEpisode(episode?.ordinal || initialEpisode);
      setVoiceoverId(preferred.id);
    }
  }, [voiceovers, initialEpisode, voiceoverId]);
  const selectEpisode = useCallback(
    (ordinal: number, preserveKodikFrame = false) => {
      const next = episodes.findIndex((item) => item.ordinal === ordinal);
      if (next < 0 || !availableIndices.includes(next)) return;
      if (!preserveKodikFrame) setIframeSourceEpisode(ordinal);
      setIndex(next);
      onEpisodeChange(ordinal);
    },
    [episodes, availableIndices, onEpisodeChange],
  );
  useEffect(() => {
    if (!episode || !voiceover || !animeId) return;
    try {
      localStorage.setItem(
        'animonster-playback-' + animeId,
        JSON.stringify({
          episode: episode.ordinal,
          voiceover: voiceover.id,
          position: currentTime,
          updatedAt: Date.now(),
        }),
      );
    } catch {}
  }, [animeId, episode?.ordinal, voiceover?.id, currentTime]);
  useEffect(() => {
    if (!availableIndices.includes(index)) {
      setIframeSourceEpisode(episodes[firstVoiceoverIndex]?.ordinal || 1);
      setIndex(firstVoiceoverIndex);
    }
  }, [voiceoverId, firstVoiceoverIndex, index]);
  useEffect(() => {
    if (!community.loaded) return;
    let local: boolean | null = null;
    try {
      const stored = localStorage.getItem(AUTO_SKIP_KEY);
      if (stored === 'true' || stored === 'false') local = stored === 'true';
    } catch {}
    if (user?.auto_skip_segments != null) setAutoSkip(user.auto_skip_segments);
    else {
      setAutoSkip(local);
      if (user && local != null)
        void api('playback_settings', { auto_skip_segments: local }).then(
          community.refresh,
        );
    }
    setPreferenceReady(true);
  }, [community.loaded, user?.id, user?.auto_skip_segments]);
  const requestWakeLock = useCallback(async () => {
    if (
      !playbackActiveRef.current ||
      document.visibilityState !== 'visible' ||
      wakeLock.current ||
      wakeLockRequesting.current ||
      !('wakeLock' in navigator)
    )
      return;
    if (wakeLockRetry.current) {
      clearTimeout(wakeLockRetry.current);
      wakeLockRetry.current = null;
    }
    wakeLockRequesting.current = true;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (
        !playbackActiveRef.current ||
        document.visibilityState !== 'visible'
      ) {
        await sentinel.release();
        return;
      }
      wakeLock.current = sentinel;
      sentinel.addEventListener('release', () => {
        if (wakeLock.current === sentinel) wakeLock.current = null;
        if (playbackActiveRef.current && document.visibilityState === 'visible')
          wakeLockRetry.current = setTimeout(() => {
            void requestWakeLock();
          }, 500);
      });
    } catch {
      if (playbackActiveRef.current && document.visibilityState === 'visible')
        wakeLockRetry.current = setTimeout(() => {
          void requestWakeLock();
        }, 5000);
    } finally {
      wakeLockRequesting.current = false;
    }
  }, []);
  const setPlayback = useCallback(
    (active: boolean) => {
      playbackActiveRef.current = active;
      setPlaybackActive(active);
      if (active) void requestWakeLock();
      else {
        if (wakeLockRetry.current) clearTimeout(wakeLockRetry.current);
        wakeLockRetry.current = null;
        const sentinel = wakeLock.current;
        wakeLock.current = null;
        void sentinel?.release();
      }
    },
    [requestWakeLock],
  );
  const advanceToNext = useCallback(() => {
    if (!episode || nextIndex === undefined) return;
    const key = `${voiceover?.id}:${episode.id}`;
    if (advancedEpisode.current === key) return;
    advancedEpisode.current = key;
    autoplayNext.current = true;
    setPlayback(false);
    setIframeSourceEpisode(episodes[nextIndex].ordinal);
    setIndex(nextIndex);
  }, [episode, episodes, nextIndex, setPlayback, voiceover?.id]);
  useEffect(() => {
    const restore = () => {
      if (document.visibilityState === 'visible') void requestWakeLock();
    };
    const element = video.current;
    document.addEventListener('visibilitychange', restore);
    document.addEventListener('fullscreenchange', restore);
    window.addEventListener('pageshow', restore);
    element?.addEventListener('webkitbeginfullscreen', restore);
    element?.addEventListener('webkitendfullscreen', restore);
    return () => {
      document.removeEventListener('visibilitychange', restore);
      document.removeEventListener('fullscreenchange', restore);
      window.removeEventListener('pageshow', restore);
      element?.removeEventListener('webkitbeginfullscreen', restore);
      element?.removeEventListener('webkitendfullscreen', restore);
    };
  }, [episode?.id, isKodik, requestWakeLock]);
  useEffect(
    () => () => {
      playbackActiveRef.current = false;
      if (wakeLockRetry.current) clearTimeout(wakeLockRetry.current);
      const sentinel = wakeLock.current;
      wakeLock.current = null;
      void sentinel?.release();
    },
    [],
  );
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
        provider: 'aniliberty',
        voiceover: voiceover?.id || 'aniliberty',
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
          if (seconds > 0) flush();
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
  }, [animeId, episode?.id, user?.id, isKodik, voiceover?.id]);

  useEffect(() => {
    if (!animeId || !episode || !isKodik) return;
    let token = '',
      seconds = 0,
      position = episode.ordinal === initialEpisode ? initialPosition : 0,
      lastPosition = position,
      cancelled = false,
      sending = false,
      idleTimer: ReturnType<typeof setTimeout> | undefined;
    let knownDuration = 0;
    void fetch('/api/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        anime_id: animeId,
        episode: episode.ordinal,
        provider: 'kodik',
        voiceover: voiceover?.id || 'kodik',
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
          if (seconds >= 1) flush();
        });
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      try {
        const host = new URL(event.origin).hostname.toLowerCase();
        const allowed = [
          'kodik.info',
          'kodik.biz',
          'kodikres.com',
          'kodikplayer.com',
          'kodikonline.com',
          'kodik.cc',
          'aniqit.com',
        ];
        if (!allowed.some((item) => host === item || host.endsWith('.' + item)))
          return;
      } catch {
        return;
      }
      let payload = event.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      const timeValue =
          payload?.key === 'kodik_player_time_update'
            ? payload.value
            : payload?.kodik_player_time_update,
        durationValue =
          payload?.key === 'kodik_player_duration_update'
            ? payload.value
            : payload?.kodik_player_duration_update;
      const reportedDuration = Number(durationValue);
      if (
        Number.isFinite(reportedDuration) &&
        reportedDuration >= 60 &&
        reportedDuration <= 24 * 60 * 60
      ) {
        knownDuration = reportedDuration;
        setKodikDuration(reportedDuration);
      }
      if (
        payload?.key === 'kodik_player_video_ended' ||
        payload?.kodik_player_video_ended === true
      ) {
        advanceToNext();
        return;
      }
      const next = Number(timeValue);
      const episodeNumber = kodikEpisodeFromMessage(payload);
      if (episodeNumber != null) {
        // Kodik has already changed its own episode. Keep this iframe alive so
        // mobile browsers do not lose its fullscreen browsing context.
        selectEpisode(episodeNumber, true);
        return;
      }
      if (!Number.isFinite(next) || next < 0 || next > 24 * 60 * 60) return;
      const delta = next - lastPosition;
      if (delta > 0 && delta < 10) {
        autoplayNext.current = false;
        seconds += delta;
        setPlayback(true);
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => setPlayback(false), 12_000);
      }
      position = next;
      lastPosition = next;
      setCurrentTime(next);
      if (knownDuration >= 60 && next >= knownDuration - 1.25) advanceToNext();
    };
    const timer = setInterval(flush, 15000);
    window.addEventListener('message', receive);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      cancelled = true;
      clearInterval(timer);
      clearTimeout(idleTimer);
      setPlayback(false);
      window.removeEventListener('message', receive);
      window.removeEventListener('pagehide', flush);
    };
  }, [
    animeId,
    episode?.id,
    user?.id,
    isKodik,
    voiceoverId,
    setPlayback,
    advanceToNext,
    selectEpisode,
  ]);
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
    setCurrentTime(0);
    setKodikDuration(null);
    setIframeSeek(null);
    setSkipTimes({ source: 'none', confidence: 'unverified' });
    skippedSegment.current = '';
  }, [episode?.id, voiceover?.id, isKodik]);
  useEffect(() => {
    if (!animeId || !episode || isKodik) return;
    const controller = new AbortController(),
      params = new URLSearchParams({
        anime_id: String(animeId),
        episode: String(episode.ordinal),
        duration: String(kodikDuration || episode.duration),
        provider: isKodik ? 'kodik' : 'aniliberty',
        voiceover: voiceover?.id || (isKodik ? 'kodik' : 'aniliberty'),
      });
    if (kodikDuration) params.set('duration_verified', 'true');
    if (releaseId) params.set('release_id', String(releaseId));
    void fetch('/api/skip-times?' + params, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: SkipTimes | null) => {
        if (result) setSkipTimes(result);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [animeId, releaseId, episode?.id, voiceover?.id, isKodik, kodikDuration]);
  useEffect(() => {
    if (episode) onEpisodeChange(episode.ordinal);
  }, [episode?.id, onEpisodeChange]);
  useEffect(() => {
    if (!episode || !voiceover) return;
    onPlaybackSelectionChange?.({
      episode: episode.ordinal,
      provider: voiceover.provider,
      voiceover: voiceover.id,
    });
  }, [episode?.id, voiceover?.id, onPlaybackSelectionChange]);
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
      const relative = voiceover.player_url.startsWith('/');
      const url = new URL(voiceover.player_url, 'https://animonster.invalid');
      url.searchParams.set('episode', String(iframeSourceEpisode));
      const requestedPosition =
        iframeSeek ??
        (iframeSourceEpisode === initialEpisode && initialPosition > 0
          ? initialPosition
          : 0);
      if (requestedPosition > 0)
        url.searchParams.set(
          'start_from',
          String(Math.floor(requestedPosition)),
        );
      if (autoplayNext.current) url.searchParams.set('autoplay', '1');
      return relative ? `${url.pathname}${url.search}${url.hash}` : url.href;
    } catch {
      return '';
    }
  })();
  const activeKind =
      skipTimes.opening &&
      currentTime >= skipTimes.opening.start &&
      currentTime < skipTimes.opening.stop - 0.25
        ? 'opening'
        : skipTimes.ending &&
            currentTime >= skipTimes.ending.start &&
            currentTime < skipTimes.ending.stop - 0.25
          ? 'ending'
          : null,
    activeSegment = activeKind ? skipTimes[activeKind] : undefined,
    activeConfidence = activeKind
      ? skipTimes[`${activeKind}_confidence`] || skipTimes.confidence
      : skipTimes.confidence,
    autoSkipAllowed =
      activeConfidence === 'exact' || activeConfidence === 'matched',
    showAutoSkipQuestion =
      preferenceReady &&
      autoSkip == null &&
      activeKind === 'opening' &&
      autoSkipAllowed;
  const seekPast = (kind: 'opening' | 'ending', segment: SkipSegment) => {
    skippedSegment.current = `${episode?.id}:${voiceover?.id}:${kind}:${segment.stop}`;
    setCurrentTime(segment.stop);
    if (isKodik) {
      setIframeSourceEpisode(episode?.ordinal || iframeSourceEpisode);
      setIframeSeek(segment.stop);
      setIframeRevision((value) => value + 1);
    } else if (video.current) video.current.currentTime = segment.stop;
  };
  const saveAutoSkip = (value: boolean) => {
    setAutoSkip(value);
    try {
      localStorage.setItem(AUTO_SKIP_KEY, String(value));
    } catch {}
    if (user)
      void api('playback_settings', { auto_skip_segments: value }).then(
        community.refresh,
      );
  };
  useEffect(() => {
    if (
      isKodik ||
      !activeKind ||
      !activeSegment ||
      autoSkip !== true ||
      !autoSkipAllowed
    )
      return;
    const key = `${episode?.id}:${voiceover?.id}:${activeKind}:${activeSegment.stop}`;
    if (skippedSegment.current === key) return;
    seekPast(activeKind, activeSegment);
  }, [
    activeKind,
    activeSegment?.stop,
    autoSkip,
    autoSkipAllowed,
    episode?.id,
    voiceover?.id,
    isKodik,
  ]);
  return (
    <div className="episode-view">
      {voiceoversMessage && (
        <p className="muted" role="status">
          {voiceoversMessage}
        </p>
      )}
      <div className="player" data-keep-awake={playbackActive || undefined}>
        {episode?.plus_locked ? (
          <div className="plus-episode-lock">
            <strong>Ранний доступ AniMonster Plus</strong>
            <span>
              Бесплатный просмотр откроется{' '}
              {new Date(episode.free_at || 0).toLocaleString('ru-RU')}
            </span>
          </div>
        ) : isKodik ? (
          iframeUrl ? (
            <iframe
              ref={frame}
              key={voiceover.id + ':' + iframeRevision}
              src={iframeUrl}
              title={`${animeTitle} — ${voiceover.title}, серия ${episode.ordinal}`}
              allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *"
              allowFullScreen
              onError={() => {
                setError(
                  'Kodik временно недоступен. Повторите загрузку плеера.',
                );
              }}
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
            onPlay={() => setPlayback(true)}
            onPlaying={() => setPlayback(true)}
            onPause={() => setPlayback(false)}
            onTimeUpdate={(event) =>
              setCurrentTime(event.currentTarget.currentTime)
            }
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
            onCanPlay={() => {
              if (!autoplayNext.current || !video.current) return;
              autoplayNext.current = false;
              void video.current.play().catch(() => {});
            }}
            onEnded={advanceToNext}
            onError={() => {
              setPlayback(false);
              setError('Не удалось воспроизвести видео. Обновите источник.');
            }}
            aria-label={'Серия ' + episode?.ordinal}
          />
        )}
        {!isKodik && activeKind && activeSegment && !showAutoSkipQuestion && (
          <button
            type="button"
            className="skip-segment-button"
            onClick={() => seekPast(activeKind, activeSegment)}
          >
            Пропустить {activeKind === 'opening' ? 'опенинг' : 'эндинг'}
          </button>
        )}
        {!isKodik && showAutoSkipQuestion && activeSegment && (
          <div
            className="auto-skip-question"
            role="dialog"
            aria-label="Настройка автопропуска"
          >
            <strong>Пропускать опенинги и эндинги автоматически?</strong>
            <div>
              <button
                type="button"
                onClick={() => {
                  saveAutoSkip(true);
                  seekPast('opening', activeSegment);
                }}
              >
                Включить
              </button>
              <button type="button" onClick={() => saveAutoSkip(false)}>
                Нет
              </button>
            </div>
          </div>
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
        {voiceovers.length > 1 && (
          <NativeSelect
            className="voiceover-select"
            aria-label="Выбор озвучки"
            value={voiceover?.id || 'kodik'}
            onChange={(e) => {
              voiceoverUserSelected.current = true;
              setIframeSourceEpisode(episode?.ordinal || 1);
              setVoiceoverId(e.target.value);
            }}
          >
            {voiceovers.map((item) => (
              <option value={item.id} key={item.id}>
                {item.title} · {item.episode_ordinals?.length ?? item.episodes}{' '}
                серий
              </option>
            ))}
          </NativeSelect>
        )}
        <NativeSelect
          className="episode-select"
          aria-label="Выбор серии"
          value={index}
          onChange={(e) => {
            const selected = episodes[Number(e.target.value)];
            if (selected) selectEpisode(selected.ordinal);
          }}
        >
          {availableIndices.map((i) => {
            const e = episodes[i];
            return (
              <option value={i} key={e.id}>
                Серия {e.ordinal} · {e.name}
                {e.plus_locked
                  ? ` · Plus до ${new Date(e.free_at || 0).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </option>
            );
          })}
        </NativeSelect>
        {!isKodik && (
          <NativeSelect
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
          </NativeSelect>
        )}
        <button
          disabled={previousIndex === undefined}
          onClick={() =>
            previousIndex !== undefined &&
            selectEpisode(episodes[previousIndex].ordinal)
          }
          aria-label="Предыдущая серия"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          disabled={nextIndex === undefined}
          onClick={() =>
            nextIndex !== undefined &&
            selectEpisode(episodes[nextIndex].ordinal)
          }
          aria-label="Следующая серия"
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <p className="source-note">
        Озвучка: {voiceover?.title || 'Kodik'} · {availableIndices.length} серий
        доступно
      </p>
    </div>
  );
}
