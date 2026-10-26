'use client';
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- The custom media application needs a keyboard focus target. */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import Link from 'next/link';
import { PlayerHalloweenVisitor } from '@/components/halloween';
import { UserNickname } from '@/components/user-nickname';
import {
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  Volume2,
  Maximize,
  PictureInPicture2,
  Sparkles,
  Heart,
  Monitor,
  RotateCcw,
  Settings2,
  Download,
  Users,
  Copy,
} from 'lucide-react';
import { CommunityHeader, useCommunity } from '@/components/community/context';
import { useDemoProgress, useDemoRoom } from '@/hooks/use-demo-session';
import { useDemoAnalytics } from '@/hooks/use-demo-analytics';
import { useDemoFeedback } from '@/hooks/use-demo-feedback';
import { DemoFeedbackDialog } from '@/components/demo-feedback-dialog';
import { demoPosition, demoResumePoint } from '@/lib/demo-session';
import { seasonPoint, seasonPosition } from '@/lib/demo-season';
import { BuySubscription } from '@/components/community/buy-subscription';
import { DemoTimeline } from './demo-timeline';
import {
  startDemoDownload,
  startDemoSeasonDownload,
  OFFLINE_CHANGE_EVENT,
} from '@/lib/offline/downloader';
import type { OfflineEpisode } from '@/lib/offline/types';
import {
  GoalRewardPreview,
  useFundraisingGoals,
} from '@/components/community/fundraising-choice';
import {
  activeDemoSegment,
  boundedPosition,
  parseDemoCatalog,
  type DemoCatalog,
} from '@/lib/player-demo';

const STORE = 'animonster-player-demo-v2';
type Preferences = {
  episode: number;
  voice: string;
  position: number;
  rate: number;
  volume: number;
  autoNext: boolean;
  autoSkip: boolean;
  cueSize: number;
  cueColor: string;
  cueBackground: string;
  cueFont: string;
  continuous: boolean;
};
const defaults: Preferences = {
  episode: 1,
  voice: '',
  position: 0,
  rate: 1,
  volume: 1,
  autoNext: true,
  autoSkip: true,
  cueSize: 100,
  cueColor: '#ffffff',
  cueBackground: '#000000cc',
  cueFont: 'sans-serif',
  continuous: true,
};
const clock = (value: number) => {
  const seconds = Math.max(0, Math.floor(value || 0));
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export function PlayerDemo({
  catalog: initialCatalog,
}: {
  catalog: DemoCatalog;
}) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const community = useCommunity();
  const progress = useDemoProgress(community.user?.id, community.loaded);
  const room = useDemoRoom(community.user?.id);
  const guest = !!room.snapshot && !room.snapshot.host;
  const video = useRef<HTMLVideoElement>(null);
  const mediaLoaded = useRef(false);
  const surface = useRef<HTMLDivElement>(null);
  const [preferences, setPreferences] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [quality, setQuality] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cinema, setCinema] = useState(false);
  const [visible, setVisible] = useState(true);
  const [retry, setRetry] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pip, setPip] = useState(false);
  const [fauxFullscreen, setFauxFullscreen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [bundleDownload, setBundleDownload] = useState(true);
  const [subtitles, setSubtitles] = useState('off');
  const hydrated = useRef('');
  const selected = useRef({ episode: 1, voice: '' });
  const applyingRoom = useRef(0);
  const resume = useRef(0);
  const startPlaying = useRef(false);
  const lastSave = useRef(0);
  const lastBroadcast = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchTap = useRef<{
    time: number;
    side: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ time: 0, side: 0, timer: null });
  const touchHandledUntil = useRef(0);
  const { goals } = useFundraisingGoals(true);
  const goal = goals.find((item) => item.slug === 'player');
  const continuous =
    preferences.continuous &&
    !!catalog.season &&
    catalog.season.chapters.some(
      (item) => item.episode === preferences.episode,
    );
  const point = continuous
    ? seasonPoint(catalog.season!, time)
    : { episode: preferences.episode, position: time };
  const chapter = continuous
    ? catalog.season!.chapters.find((item) => item.episode === point.episode)
    : undefined;
  const episode =
    catalog.episodes.find((item) => item.number === point.episode) ||
    catalog.episodes[0];
  const feedback = useDemoFeedback(
    catalog,
    community.user?.id,
    community.loaded,
    continuous,
    episode.number,
  );
  const resumeAfterFeedback = useRef(false);
  const availableVoices = continuous ? catalog.season!.voices : episode.voices;
  const voice =
    availableVoices.find((item) => item.id === preferences.voice) ||
    availableVoices[0];
  useDemoAnalytics(
    video,
    catalog,
    community.loaded,
    community.user?.id,
    continuous,
    episode.number,
    voice?.id || '',
  );
  const downloadVoice =
    episode.voices.find((item) => item.id === voice.id) || episode.voices[0];
  const downloadingSeason = bundleDownload && !!catalog.season;
  const downloadSelection = downloadingSeason
    ? catalog.season!.voices.find((item) => item.id === voice.id)
    : downloadVoice;
  const tracks = continuous ? catalog.season!.subtitles : episode.subtitles;
  const next = catalog.episodes[catalog.episodes.indexOf(episode) + 1];
  const localSegment = activeDemoSegment(
    downloadVoice,
    continuous ? point.position : time,
  );
  const segment =
    localSegment && chapter
      ? {
          start: chapter.start + localSegment.start,
          stop: Math.min(chapter.stop, chapter.start + localSegment.stop),
        }
      : localSegment;
  const source =
    voice.qualities.find((item) => item.height === quality)?.url ||
    voice.master;
  const latest = useRef(preferences);
  latest.current = preferences;
  selected.current = { episode: episode.number, voice: voice.id };
  const timeline = useRef({
    continuous,
    season: catalog.season,
    episode: episode.number,
  });
  timeline.current = {
    continuous,
    season: catalog.season,
    episode: episode.number,
  };
  const playback = useRef({
    episode: episode.number,
    voice: voice.id,
    quality,
    source,
    continuous,
  });
  playback.current = {
    episode: episode.number,
    voice: voice.id,
    quality,
    source,
    continuous,
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch('/api/player-demo', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          const fresh = parseDemoCatalog(data.catalog);
          if (!cancelled) {
            const current = playback.current;
            const nextEpisode = fresh.episodes.find(
              (item) => item.number === current.episode,
            );
            const nextContinuous = latest.current.continuous && !!fresh.season;
            const nextVoice = (
              nextContinuous ? fresh.season!.voices : nextEpisode?.voices
            )?.find((item) => item.id === current.voice);
            const nextSource =
              nextVoice?.qualities.find(
                (item) => item.height === current.quality,
              )?.url || nextVoice?.master;
            if (nextSource && nextSource !== current.source && video.current) {
              resume.current =
                nextContinuous && !current.continuous
                  ? seasonPosition(
                      fresh.season!,
                      current.episode,
                      video.current.currentTime,
                    )
                  : !nextContinuous &&
                      current.continuous &&
                      timeline.current.season
                    ? seasonPoint(
                        timeline.current.season,
                        video.current.currentTime,
                      ).position
                    : video.current.currentTime;
              startPlaying.current = !video.current.paused;
            }
            setCatalog((old) =>
              JSON.stringify(old) === JSON.stringify(fresh) ? old : fresh,
            );
          }
        }
      } catch {}
      if (!cancelled) timer = setTimeout(() => void refresh(), 30000);
    };
    timer = setTimeout(() => void refresh(), 15000);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const persist = useCallback(
    (position: number, flush = false) => {
      if (!mediaLoaded.current || !progress.ready) return;
      const current = timeline.current;
      const saved =
        current.continuous && current.season
          ? seasonPoint(current.season, position)
          : { episode: current.episode, position };
      try {
        localStorage.setItem(
          STORE,
          JSON.stringify({ ...latest.current, ...saved }),
        );
      } catch {
        /* Private browsing can disable storage. */
      }
      progress.save(
        { voice: selected.current.voice, ...saved, updatedAt: Date.now() },
        flush,
      );
    },
    [progress.save, progress.ready],
  );

  useEffect(() => {
    try {
      const current = localStorage.getItem(STORE);
      const saved = JSON.parse(
        current || localStorage.getItem('animonster-player-demo-v1') || 'null',
      );
      if (saved && typeof saved === 'object') {
        const restored = {
          ...defaults,
          episode: Number.isInteger(saved.episode) ? saved.episode : 1,
          voice: typeof saved.voice === 'string' ? saved.voice : '',
          rate: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(saved.rate)
            ? saved.rate
            : 1,
          volume: Number.isFinite(saved.volume)
            ? Math.max(0, Math.min(1, saved.volume))
            : 1,
          autoNext: typeof saved.autoNext === 'boolean' ? saved.autoNext : true,
          autoSkip: current ? saved.autoSkip !== false : true,
          continuous: saved.continuous !== false,
          cueSize: [75, 100, 125, 150, 200].includes(saved.cueSize)
            ? saved.cueSize
            : 100,
          cueColor: ['#ffffff', '#ffff00', '#00ffff'].includes(saved.cueColor)
            ? saved.cueColor
            : '#ffffff',
          cueBackground: ['#000000cc', '#00000000'].includes(
            saved.cueBackground,
          )
            ? saved.cueBackground
            : '#000000cc',
          cueFont: ['sans-serif', 'serif', 'monospace'].includes(saved.cueFont)
            ? saved.cueFont
            : 'sans-serif',
          position: Number.isFinite(saved.position)
            ? Math.max(0, saved.position)
            : 0,
        };
        setPreferences(restored);
        resume.current =
          restored.continuous && catalog.season
            ? seasonPosition(
                catalog.season,
                restored.episode,
                restored.position,
              )
            : restored.position;
      }
    } catch {
      /* Start fresh if stored preferences are invalid. */
    }
    setPip(
      !!document.pictureInPictureEnabled ||
        typeof (
          video.current as HTMLVideoElement & {
            webkitSetPresentationMode?: unknown;
          }
        )?.webkitSetPresentationMode === 'function',
    );
  }, []);

  useEffect(() => {
    if (!progress.ready) return;
    const key = community.user?.id || 'guest';
    if (hydrated.current === key) return;
    hydrated.current = key;
    const saved = demoResumePoint(
      Object.values(progress.items),
      catalog.episodes,
    );
    if (saved && !room.requested) {
      resume.current =
        latest.current.continuous && catalog.season
          ? seasonPosition(catalog.season, saved.episode, saved.position)
          : saved.position;
      setPreferences((old) => ({
        ...old,
        episode: saved.episode,
        voice: saved.voice,
        position: saved.position,
      }));
    }
    setReady(true);
  }, [
    progress.ready,
    progress.items,
    community.user?.id,
    catalog.episodes,
    room.requested,
  ]);

  useEffect(() => {
    const changed = (event: Event) => {
      const item = (event as CustomEvent<OfflineEpisode>).detail;
      if (item?.provider !== 'demo') return;
      setDownloadBusy(
        item.status === 'queued' || item.status === 'downloading',
      );
      setDownloadStatus(
        item.status === 'completed'
          ? 'Скачано — открывайте «Загрузки» без интернета'
          : item.status === 'failed'
            ? item.error || 'Ошибка загрузки'
            : item.status === 'paused'
              ? 'Загрузка на паузе'
              : `Скачиваем: ${Math.round(item.downloadedBytes / 1024 / 1024)} МБ`,
      );
    };
    window.addEventListener(OFFLINE_CHANGE_EVENT, changed);
    return () => window.removeEventListener(OFFLINE_CHANGE_EVENT, changed);
  }, []);

  useEffect(() => {
    if (!fauxFullscreen) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFauxFullscreen(false);
    };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener('keydown', escape);
    };
  }, [fauxFullscreen]);

  useEffect(() => {
    const tracks = video.current?.textTracks;
    if (!tracks) return;
    Array.from(tracks).forEach((track, index) => {
      track.mode = String(index) === subtitles ? 'showing' : 'disabled';
    });
  }, [subtitles, episode.number, source]);

  useEffect(() => {
    const snapshot = room.snapshot;
    if (!snapshot || !ready || room.isSending()) return;
    const state = snapshot.room;
    const targetEpisode = catalog.episodes.find(
      (item) => item.number === state.episode,
    );
    if (!targetEpisode) return;
    if (
      continuous &&
      !catalog.season!.chapters.some((item) => item.episode === state.episode)
    )
      return;
    const localExpected = demoPosition(
      state,
      Date.now() + room.clockOffset.current,
      targetEpisode.duration,
    );
    const expected = continuous
      ? seasonPosition(catalog.season!, state.episode, localExpected)
      : localExpected;
    if (!continuous && state.episode !== episode.number) {
      applyingRoom.current = Date.now() + 1500;
      resume.current = expected;
      startPlaying.current = state.playing;
      setCountdown(null);
      setPreferences((old) => ({
        ...old,
        episode: state.episode,
        rate: state.rate,
      }));
      return;
    }
    const element = video.current;
    if (!element || !mediaLoaded.current) {
      resume.current = expected;
      startPlaying.current = state.playing;
      return;
    }
    if (!snapshot.host || state.version > 1) {
      const drift = Math.abs(element.currentTime - expected);
      if (drift > 1.25) {
        applyingRoom.current = Date.now() + 1000;
        element.currentTime = boundedPosition(expected, element.duration);
      }
      if (!snapshot.host || !waiting) {
        element.playbackRate = state.rate;
        setPreferences((old) =>
          old.rate === state.rate ? old : { ...old, rate: state.rate },
        );
        if (state.playing && element.paused) {
          applyingRoom.current = Date.now() + 1000;
          void element
            .play()
            .catch(() =>
              setNotice('Нажмите ▶, чтобы включить совместный просмотр.'),
            );
        }
        if (!state.playing && !element.paused) {
          applyingRoom.current = Date.now() + 1000;
          element.pause();
        }
      }
    }
  }, [room.snapshot, ready, episode.number, catalog.episodes, continuous]);

  useEffect(() => {
    if (!ready || !video.current) return;
    const element = video.current;
    mediaLoaded.current = false;
    let engine: import('hls.js').default | undefined;
    let cancelled = false;
    let networkRetries = 0;
    let mediaRecovered = false;
    setError('');
    setWaiting(true);
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setBuffered(0);
    const attach = async () => {
      if (element.canPlayType('application/vnd.apple.mpegurl')) {
        element.src = source;
        return;
      }
      const { default: Hls } = await import('hls.js');
      if (cancelled) return;
      if (!Hls.isSupported()) {
        setError(
          'Этот браузер не поддерживает поток. Попробуйте другой браузер.',
        );
        setWaiting(false);
        return;
      }
      engine = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
      engine.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (
          data.type === Hls.ErrorTypes.NETWORK_ERROR &&
          networkRetries++ < 2
        ) {
          engine?.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
          mediaRecovered = true;
          engine?.recoverMediaError();
          return;
        }
        setError(
          'Не удалось загрузить видео. Проверьте соединение и повторите попытку.',
        );
        setWaiting(false);
      });
      engine.loadSource(source);
      engine.attachMedia(element);
    };
    void attach().catch(() => {
      if (!cancelled) {
        setError('Не удалось запустить плеер. Повторите попытку.');
        setWaiting(false);
      }
    });
    return () => {
      cancelled = true;
      mediaLoaded.current = false;
      engine?.destroy();
      element.removeAttribute('src');
      element.load();
    };
  }, [source, ready, retry]);

  useEffect(() => {
    if (!ready) return;
    const element = video.current;
    if (element) {
      element.volume = preferences.volume;
      element.playbackRate = preferences.rate;
    }
    persist(element?.currentTime || resume.current);
  }, [preferences, ready, persist]);

  useEffect(() => {
    const save = () => persist(video.current?.currentTime || 0, true);
    const visibility = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      save();
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [persist]);

  useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
      if (countdown > 0) setCountdown(countdown - 1);
      else if (next) selectEpisode(next.number, true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, next]);

  useEffect(() => {
    if (preferences.autoSkip && segment && video.current && !guest && playing)
      seek(segment.stop);
  }, [preferences.autoSkip, segment, guest, playing]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (touchTap.current.timer) clearTimeout(touchTap.current.timer);
    },
    [],
  );

  function toggle() {
    const element = video.current;
    if (!element || error) return;
    if (guest) {
      if (element.paused && room.snapshot?.room.playing)
        void element
          .play()
          .catch(() => setNotice('Нажмите воспроизведение ещё раз.'));
      else setNotice('Просмотром управляет ведущий комнаты.');
      return;
    }
    if (element.paused)
      void element
        .play()
        .catch(() => setNotice('Нажмите воспроизведение ещё раз.'));
    else element.pause();
  }
  function seek(position: number) {
    if (guest) return;
    if (video.current)
      video.current.currentTime = boundedPosition(
        position,
        video.current.duration,
      );
    setCountdown(null);
    broadcast({ position: video.current?.currentTime || 0 });
  }
  function broadcast(
    change: Partial<{
      episode: number;
      position: number;
      playing: boolean;
      rate: number;
    }> = {},
  ) {
    if (!room.snapshot?.host) return;
    const rawPosition = change.position ?? video.current?.currentTime ?? 0;
    const currentPoint = continuous
      ? seasonPoint(catalog.season!, rawPosition)
      : {
          episode: episode.number,
          position: Math.min(episode.duration, rawPosition),
        };
    room.queue({
      playing: !video.current?.paused,
      rate: latest.current.rate,
      ...change,
      episode: change.episode ?? currentPoint.episode,
      position:
        change.episode !== undefined
          ? (change.position ?? 0)
          : currentPoint.position,
    });
  }
  function selectEpisode(number: number, automatic = false) {
    if (guest) return;
    if (
      continuous &&
      !catalog.season!.chapters.some((item) => item.episode === number)
    ) {
      setNotice(
        'Серия подключается к общему потоку. Попробуйте через несколько секунд.',
      );
      return;
    }
    if (video.current) persist(video.current.currentTime, true);
    const saved = automatic ? undefined : progress.items[number],
      target = catalog.episodes.find((item) => item.number === number);
    if (!target) return;
    const position =
      saved && saved.position < target.duration - 3 ? saved.position : 0;
    resume.current = position;
    const globalPosition = continuous
      ? seasonPosition(catalog.season!, number, position)
      : position;
    resume.current = globalPosition;
    startPlaying.current = true;
    setCountdown(null);
    setPreferences((old) => ({
      ...old,
      episode: number,
      voice: saved?.voice || old.voice,
      position,
    }));
    if (continuous && video.current) {
      video.current.currentTime = globalPosition;
      setTime(globalPosition);
      void video.current.play().catch(() => {});
    }
    broadcast({ episode: number, position, playing: true });
  }
  function switchMode() {
    if (!catalog.season) return;
    const current = continuous
      ? seasonPoint(catalog.season, video.current?.currentTime || time)
      : {
          episode: episode.number,
          position: video.current?.currentTime || time,
        };
    persist(video.current?.currentTime || time, true);
    resume.current = continuous
      ? current.position
      : seasonPosition(catalog.season, current.episode, current.position);
    startPlaying.current = !!video.current && !video.current.paused;
    setPreferences((old) => ({
      ...old,
      continuous: !continuous,
      episode: current.episode,
      position: current.position,
    }));
    setCountdown(null);
  }
  function switchSource(action: () => void, reset = false) {
    resume.current = reset ? 0 : video.current?.currentTime || 0;
    startPlaying.current = reset || !!(video.current && !video.current.paused);
    setCountdown(null);
    action();
  }
  function showControls() {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (video.current && !video.current.paused) setVisible(false);
    }, 3000);
  }
  async function enterFullscreen() {
    if (fauxFullscreen) {
      setFauxFullscreen(false);
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (surface.current?.requestFullscreen)
        await surface.current.requestFullscreen();
      else if (
        (
          video.current as HTMLVideoElement & {
            webkitEnterFullscreen?: () => void;
          }
        )?.webkitEnterFullscreen
      )
        (
          video.current as HTMLVideoElement & {
            webkitEnterFullscreen: () => void;
          }
        ).webkitEnterFullscreen();
      else setFauxFullscreen(true);
    } catch {
      try {
        const element = video.current as HTMLVideoElement & {
          webkitEnterFullscreen?: () => void;
        };
        if (element?.webkitEnterFullscreen) {
          element.webkitEnterFullscreen();
          return;
        }
      } catch {}
      setFauxFullscreen(true);
    }
  }

  return (
    <div className={`site demo-site${cinema ? ' demo-cinema' : ''}`}>
      <CommunityHeader />
      <main className="demo-main">
        <a href="/" className="demo-back">
          <ArrowLeft size={16} /> На главную
        </a>
        <header className="demo-heading">
          <div className="demo-kicker">
            <Sparkles size={16} /> ANIMONSTER LAB · ОТКРЫТОЕ ДЕМО
          </div>
          <h1>
            Твой просмотр.
            <br />
            <span>По твоим правилам.</span>
          </h1>
          <p>
            Пробуем собственный плеер на {catalog.title}. Все возможности демо
            открыты бесплатно.
          </p>
        </header>
        <div className="demo-layout">
          <section className="demo-watch" aria-label="Демонстрация плеера">
            <section className="demo-room-panel" aria-label="Смотреть вместе">
              <div>
                <Users size={18} />
                <strong>Смотреть вместе</strong>
                {room.snapshot && (
                  <span>
                    {room.snapshot.host ? 'Вы ведущий' : 'Управляет ведущий'} ·{' '}
                    {
                      room.snapshot.members.filter((member) => member.online)
                        .length
                    }{' '}
                    в сети
                  </span>
                )}
              </div>
              {room.snapshot ? (
                <>
                  <p>
                    {room.snapshot.members.map((member,index)=><span key={member.user_id}>{index>0?', ':''}<UserNickname user={member}/>{member.online?'':' · не в сети'}</span>)}
                  </p>
                  <button
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(location.href)
                        .then(() => setNotice('Ссылка на комнату скопирована.'))
                        .catch(() =>
                          setNotice(
                            'Скопируйте адрес страницы, чтобы пригласить друзей.',
                          ),
                        )
                    }
                  >
                    <Copy size={15} /> Пригласить по ссылке
                  </button>
                  <button onClick={() => void room.leave()}>
                    {room.snapshot.host ? 'Завершить комнату' : 'Выйти'}
                  </button>
                </>
              ) : room.requested ? (
                <>
                  <button
                    disabled={room.busy}
                    onClick={() => {
                      if (!community.user) {
                        community.login();
                        return;
                      }
                      void room.join();
                    }}
                  >
                    Войти в комнату
                  </button>
                  <button onClick={() => void room.leave()}>
                    Смотреть самостоятельно
                  </button>
                </>
              ) : (
                <button
                  disabled={room.busy}
                  onClick={() => {
                    if (!community.user) {
                      community.login();
                      return;
                    }
                    video.current?.pause();
                    void room.create(
                      episode.number,
                      continuous ? point.position : time,
                    );
                  }}
                >
                  Создать комнату
                </button>
              )}
              {room.error && <p role="alert">{room.error}</p>}
            </section>
            <PlayerHalloweenVisitor disabled={fauxFullscreen} />
            {/* The player is a keyboard application; focus enables Space/arrow shortcuts without stealing page keys. */}
            <div
              ref={surface}
              role="application"
              className={`demo-screen${visible || !playing || settings ? ' controls-visible' : ''}${fauxFullscreen ? ' demo-faux-fullscreen' : ''}`}
              style={
                {
                  '--demo-cue-size': `${(preferences.cueSize / 100) * 20}px`,
                  '--demo-cue-color': preferences.cueColor,
                  '--demo-cue-bg': preferences.cueBackground,
                  '--demo-cue-font': preferences.cueFont,
                } as CSSProperties
              }
              tabIndex={0}
              aria-label="Плеер. Пробел — пауза, стрелки — перемотка, F — полный экран"
              onPointerMove={showControls}
              onPointerDown={showControls}
              onFocusCapture={showControls}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setVisible(true);
              }}
              onKeyDown={(event) => {
                if (event.ctrlKey || event.metaKey || event.altKey) return;
                if (
                  (event.target as HTMLElement).closest(
                    'input,select,textarea,[contenteditable="true"]',
                  )
                )
                  return;
                if (
                  event.key === ' ' &&
                  (event.target as HTMLElement).closest('button,a')
                )
                  return;
                if (
                  [' ', 'ArrowLeft', 'ArrowRight', 'f', 'F', 'm', 'M'].includes(
                    event.key,
                  )
                )
                  event.preventDefault();
                if (event.key === ' ') toggle();
                if (event.key === 'ArrowLeft') seek(time - 10);
                if (event.key === 'ArrowRight') seek(time + 10);
                if (event.key.toLowerCase() === 'f') void enterFullscreen();
                if (event.key.toLowerCase() === 'm')
                  setPreferences((old) => ({
                    ...old,
                    volume: old.volume ? 0 : 1,
                  }));
                showControls();
              }}
            >
              <video
                ref={video}
                playsInline
                preload="metadata"
                aria-label={`${catalog.title}, серия ${episode.number}`}
                onClick={() => {
                  if (Date.now() > touchHandledUntil.current) toggle();
                }}
                onPointerUp={(event) => {
                  if (event.pointerType !== 'touch') return;
                  touchHandledUntil.current = Date.now() + 600;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const side =
                    event.clientX - rect.left < rect.width / 2 ? -1 : 1;
                  if (
                    Date.now() - touchTap.current.time < 320 &&
                    touchTap.current.side === side
                  ) {
                    if (touchTap.current.timer)
                      clearTimeout(touchTap.current.timer);
                    touchTap.current.time = 0;
                    if (guest) {
                      setNotice('Перемоткой управляет ведущий.');
                      return;
                    }
                    seek(event.currentTarget.currentTime + side * 10);
                    setNotice(`${side > 0 ? '+' : '−'}10 секунд`);
                  } else {
                    touchTap.current.time = Date.now();
                    touchTap.current.side = side;
                    touchTap.current.timer = setTimeout(() => {
                      touchTap.current.timer = null;
                      toggle();
                    }, 320);
                  }
                }}
                onDoubleClick={(event) => {
                  if (Date.now() < touchHandledUntil.current) return;
                  if (guest) {
                    setNotice('Перемоткой управляет ведущий.');
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  const change =
                    event.clientX - rect.left < rect.width / 2 ? -10 : 10;
                  seek(event.currentTarget.currentTime + change);
                  setNotice(`${change > 0 ? '+' : '−'}10 секунд`);
                }}
                onLoadedMetadata={(event) => {
                  feedback.reset();
                  const element = event.currentTarget;
                  mediaLoaded.current = true;
                  setDuration(element.duration);
                  element.currentTime = boundedPosition(
                    resume.current,
                    element.duration,
                  );
                  setTime(element.currentTime);
                  element.volume = latest.current.volume;
                  element.playbackRate = latest.current.rate;
                  Array.from(element.textTracks).forEach((track, index) => {
                    track.mode =
                      String(index) === subtitles ? 'showing' : 'disabled';
                  });
                  if (startPlaying.current) {
                    startPlaying.current = false;
                    void element.play().catch(() => {});
                  }
                }}
                onPlay={() => {
                  if (video.current) feedback.sample(video.current);
                  setPlaying(true);
                  showControls();
                  if (mediaLoaded.current && Date.now() > applyingRoom.current)
                    broadcast({ playing: true });
                }}
                onPause={() => {
                  feedback.reset();
                  setPlaying(false);
                  persist(video.current?.currentTime || 0, true);
                  if (mediaLoaded.current && Date.now() > applyingRoom.current)
                    broadcast({ playing: false });
                }}
                onWaiting={() => {
                  feedback.reset();
                  setWaiting(true);
                  if (mediaLoaded.current) broadcast({ playing: false });
                }}
                onPlaying={() => {
                  setWaiting(false);
                  setPlaying(true);
                  if (mediaLoaded.current && Date.now() > applyingRoom.current)
                    broadcast({ playing: true });
                }}
                onSeeked={() => {
                  feedback.reset();
                  if (mediaLoaded.current && Date.now() > applyingRoom.current)
                    broadcast({ position: video.current?.currentTime || 0 });
                }}
                onRateChange={(event) => {
                  feedback.reset();
                  const rate = event.currentTarget.playbackRate;
                  if (guest) {
                    const expected = room.snapshot!.room.rate;
                    if (rate !== expected)
                      event.currentTarget.playbackRate = expected;
                    return;
                  }
                  if (![0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(rate))
                    return;
                  if (rate !== latest.current.rate) {
                    setPreferences((old) => ({ ...old, rate }));
                    if (Date.now() > applyingRoom.current) broadcast({ rate });
                  }
                }}
                onCanPlay={() => setWaiting(false)}
                onTimeUpdate={(event) => {
                  const element = event.currentTarget;
                  feedback.sample(element);
                  if (continuous) {
                    const currentPoint = seasonPoint(
                      catalog.season!,
                      element.currentTime,
                    );
                    if (
                      currentPoint.episode !== selected.current.episode &&
                      Date.now() > applyingRoom.current
                    )
                      broadcast({
                        episode: currentPoint.episode,
                        position: currentPoint.position,
                      });
                  }
                  setTime(element.currentTime);
                  if (element.buffered.length)
                    setBuffered(
                      element.buffered.end(element.buffered.length - 1),
                    );
                  if (Date.now() - lastSave.current > 3000) {
                    persist(element.currentTime);
                    lastSave.current = Date.now();
                  }
                  if (
                    room.snapshot?.host &&
                    Date.now() - lastBroadcast.current > 10000
                  ) {
                    lastBroadcast.current = Date.now();
                    broadcast();
                  }
                }}
                onEnded={() => {
                  feedback.reset();
                  setPlaying(false);
                  if (!continuous && preferences.autoNext && next && !guest)
                    setCountdown(10);
                }}
                onError={() => {
                  feedback.reset();
                  setError('Видео недоступно. Попробуйте загрузить его снова.');
                  setWaiting(false);
                }}
                onSeeking={() => feedback.reset()}
              >
                {tracks?.map((track) => (
                  <track
                    key={track.url}
                    kind="subtitles"
                    src={track.url}
                    srcLang={track.language}
                    label={track.title}
                  />
                ))}
              </video>
              <DemoFeedbackDialog
                key={community.user?.id || 'guest'}
                feedback={feedback}
                onOpen={() => {
                  resumeAfterFeedback.current =
                    !room.snapshot && !!video.current && !video.current.paused;
                  if (resumeAfterFeedback.current) video.current?.pause();
                }}
                onClosed={() => {
                  if (resumeAfterFeedback.current && !room.snapshot)
                    void video.current?.play().catch(() => {});
                  resumeAfterFeedback.current = false;
                }}
              />
              <div className="demo-screen-label">
                AM<span>PLAYER</span>
                <small>
                  {continuous ? 'Сезон · ' : ''}Серия {episode.number}
                </small>
              </div>
              {waiting && !error && (
                <div className="demo-center demo-buffer" role="status">
                  <span className="demo-spinner" /> Загружаем видео…
                </div>
              )}
              {!playing && !waiting && !error && countdown === null && (
                <button
                  className="demo-big-play"
                  onClick={() => {
                    surface.current?.focus({ preventScroll: true });
                    toggle();
                  }}
                  aria-label="Воспроизвести"
                >
                  <Play size={34} fill="currentColor" />
                </button>
              )}
              {error && (
                <div className="demo-center demo-error" role="alert">
                  <p>{error}</p>
                  <button
                    onClick={() =>
                      switchSource(() => setRetry((old) => old + 1))
                    }
                  >
                    <RotateCcw size={16} /> Повторить
                  </button>
                </div>
              )}
              {notice && (
                <div className="demo-notice" role="status">
                  {notice}
                </div>
              )}
              {segment && !preferences.autoSkip && !guest && (
                <button
                  className="demo-skip"
                  onClick={() => seek(segment.stop)}
                >
                  Пропустить {segment === voice.ending ? 'титры' : 'заставку'}{' '}
                  <ArrowRight size={16} />
                </button>
              )}
              {countdown !== null && next && (
                <div className="demo-up-next" role="status">
                  <strong>
                    Серия {next.number} через {countdown} с
                  </strong>
                  <button onClick={() => setCountdown(null)}>Остаться</button>
                  <button onClick={() => selectEpisode(next.number, true)}>
                    Смотреть сейчас
                  </button>
                </div>
              )}
              <div className="demo-controls">
                <DemoTimeline
                  time={time}
                  duration={duration}
                  buffered={buffered}
                  preview={
                    continuous ? catalog.season!.preview : episode.preview
                  }
                  chapters={continuous ? catalog.season!.chapters : undefined}
                  disabled={guest}
                  onSeek={seek}
                />
                <div className="demo-control-row">
                  <button
                    onClick={toggle}
                    aria-label={playing ? 'Пауза' : 'Воспроизвести'}
                  >
                    {playing ? <Pause size={21} /> : <Play size={21} />}
                  </button>
                  <button
                    onClick={() => seek(time - 10)}
                    aria-label="Назад на 10 секунд"
                  >
                    <RotateCcw size={19} />
                  </button>
                  <Volume2 size={18} />
                  <input
                    className="demo-volume"
                    aria-label="Громкость"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={preferences.volume}
                    onChange={(event) =>
                      setPreferences((old) => ({
                        ...old,
                        volume: Number(event.target.value),
                      }))
                    }
                  />
                  <span className="demo-time">
                    {clock(time)} / {clock(duration)}
                  </span>
                  <span className="demo-control-spacer" />
                  <select
                    aria-label="Скорость"
                    disabled={guest}
                    value={preferences.rate}
                    onChange={(event) => {
                      broadcast({ rate: Number(event.target.value) });
                      setPreferences((old) => ({
                        ...old,
                        rate: Number(event.target.value),
                      }));
                    }}
                  >
                    {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}×
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Качество"
                    value={
                      voice.qualities.some((item) => item.height === quality)
                        ? quality
                        : 0
                    }
                    onChange={(event) =>
                      switchSource(() => setQuality(Number(event.target.value)))
                    }
                  >
                    <option value={0}>Авто</option>
                    {voice.qualities.map((item) => (
                      <option key={item.height} value={item.height}>
                        {item.height}p
                      </option>
                    ))}
                  </select>
                  {!!tracks?.length && (
                    <select
                      aria-label="Субтитры"
                      value={subtitles}
                      onChange={(event) => {
                        setSubtitles(event.target.value);
                        const tracks = video.current?.textTracks;
                        if (tracks)
                          Array.from(tracks).forEach((track, index) => {
                            track.mode =
                              String(index) === event.target.value
                                ? 'showing'
                                : 'disabled';
                          });
                      }}
                    >
                      <option value="off">Без субтитров</option>
                      {tracks!.map((track, index) => (
                        <option key={track.url} value={index}>
                          {track.title}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    className="demo-cinema-toggle"
                    aria-label="Режим кино"
                    aria-pressed={cinema}
                    onClick={() => setCinema(!cinema)}
                  >
                    <Monitor size={19} />
                  </button>
                  {pip && (
                    <button
                      aria-label="Картинка в картинке"
                      onClick={() => {
                        const apple = video.current as HTMLVideoElement & {
                          webkitSetPresentationMode?: (value: string) => void;
                        };
                        if (
                          !document.pictureInPictureEnabled &&
                          apple?.webkitSetPresentationMode
                        ) {
                          try {
                            apple.webkitSetPresentationMode(
                              'picture-in-picture',
                            );
                          } catch {
                            setNotice('Картинка в картинке сейчас недоступна.');
                          }
                          return;
                        }
                        void (
                          document.pictureInPictureElement
                            ? document.exitPictureInPicture()
                            : video.current?.requestPictureInPicture()
                        )?.catch(() =>
                          setNotice('Этот режим пока недоступен.'),
                        );
                      }}
                    >
                      <PictureInPicture2 size={19} />
                    </button>
                  )}
                  <button
                    aria-label="Полный экран"
                    title="Полный экран · F"
                    onClick={() => void enterFullscreen()}
                  >
                    <Maximize size={20} />
                  </button>
                  <button
                    aria-label="Настройки плеера и субтитров"
                    aria-expanded={settings}
                    onClick={() => setSettings(!settings)}
                  >
                    <Settings2 size={20} />
                  </button>
                </div>
              </div>
              {settings && (
                <div className="demo-player-options">
                  <strong>Плеер и субтитры</strong>
                  <button
                    aria-label="Закрыть настройки"
                    onClick={() => setSettings(false)}
                  >
                    ×
                  </button>
                  <label>
                    Качество
                    <select
                      value={
                        voice.qualities.some((item) => item.height === quality)
                          ? quality
                          : 0
                      }
                      onChange={(event) =>
                        switchSource(() =>
                          setQuality(Number(event.target.value)),
                        )
                      }
                    >
                      <option value={0}>Авто</option>
                      {voice.qualities.map((item) => (
                        <option key={item.height} value={item.height}>
                          {item.height}p
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Скорость
                    <select
                      disabled={guest}
                      value={preferences.rate}
                      onChange={(event) => {
                        const rate = Number(event.target.value);
                        setPreferences((old) => ({ ...old, rate }));
                        broadcast({ rate });
                      }}
                    >
                      {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                        <option key={rate} value={rate}>
                          {rate}×
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Дорожка
                    <select
                      value={subtitles}
                      onChange={(event) => setSubtitles(event.target.value)}
                    >
                      <option value="off">Выключены</option>
                      {tracks?.map((track, index) => (
                        <option key={track.url} value={index}>
                          {track.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Размер
                    <select
                      value={preferences.cueSize}
                      onChange={(event) =>
                        setPreferences((old) => ({
                          ...old,
                          cueSize: Number(event.target.value),
                        }))
                      }
                    >
                      {[75, 100, 125, 150, 200].map((value) => (
                        <option key={value} value={value}>
                          {value}%
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Цвет
                    <select
                      value={preferences.cueColor}
                      onChange={(event) =>
                        setPreferences((old) => ({
                          ...old,
                          cueColor: event.target.value,
                        }))
                      }
                    >
                      <option value="#ffffff">Белый</option>
                      <option value="#ffff00">Жёлтый</option>
                      <option value="#00ffff">Голубой</option>
                    </select>
                  </label>
                  <label>
                    Фон
                    <select
                      value={preferences.cueBackground}
                      onChange={(event) =>
                        setPreferences((old) => ({
                          ...old,
                          cueBackground: event.target.value,
                        }))
                      }
                    >
                      <option value="#000000cc">Тёмный</option>
                      <option value="#00000000">Прозрачный</option>
                    </select>
                  </label>
                  <label>
                    Шрифт
                    <select
                      value={preferences.cueFont}
                      onChange={(event) =>
                        setPreferences((old) => ({
                          ...old,
                          cueFont: event.target.value,
                        }))
                      }
                    >
                      <option value="sans-serif">Без засечек</option>
                      <option value="serif">С засечками</option>
                      <option value="monospace">Моноширинный</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
            <div className="demo-episode-heading">
              <div>
                <span className="demo-kicker">СМОТРИМ СЕЙЧАС</span>
                <h2>{catalog.title}</h2>
                <p>
                  Серия {episode.number} · {episode.title}
                </p>
              </div>
              <span className="demo-free">Открыто для всех</span>
            </div>
            <div className="demo-settings">
              <button
                className="demo-season-toggle"
                aria-pressed={continuous}
                disabled={!catalog.season}
                onClick={switchMode}
              >
                <span>
                  {continuous ? 'Сезон одним видео' : 'По отдельным сериям'}
                </span>
                <small>
                  {continuous
                    ? `${catalog.season!.chapters.length} серии · общая шкала`
                    : 'Переключить режим просмотра'}
                </small>
              </button>
              <button
                className="demo-next-button"
                disabled={!next || guest}
                onClick={() => {
                  if (next) selectEpisode(next.number, true);
                }}
              >
                Следующая серия <ArrowRight size={15} />
              </button>
              <label>
                Озвучка
                <select
                  value={voice.id}
                  onChange={(event) => {
                    switchSource(() =>
                      setPreferences((old) => ({
                        ...old,
                        voice: event.target.value,
                      })),
                    );
                    setNotice('В разных релизах тайминги могут отличаться.');
                  }}
                >
                  {availableVoices.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={continuous || preferences.autoNext}
                  disabled={guest || continuous}
                  onChange={(event) => {
                    setPreferences((old) => ({
                      ...old,
                      autoNext: event.target.checked,
                    }));
                    setCountdown(null);
                  }}
                />{' '}
                {continuous
                  ? 'Непрерывное воспроизведение'
                  : 'Следующая серия автоматически'}
              </label>
              <label>
                <input
                  type="checkbox"
                  disabled={
                    guest || (!downloadVoice.opening && !downloadVoice.ending)
                  }
                  checked={preferences.autoSkip}
                  onChange={(event) =>
                    setPreferences((old) => ({
                      ...old,
                      autoSkip: event.target.checked,
                    }))
                  }
                />{' '}
                {downloadVoice.opening || downloadVoice.ending
                  ? 'Пропускать заставки и титры'
                  : 'Разметка заставок готовится'}
              </label>
            </div>
            <p className="demo-progress-note">
              {community.user ? (
                'Позиция просмотра сохраняется в аккаунте и доступна на других устройствах.'
              ) : (
                <>
                  Позиция сохраняется на этом устройстве.{' '}
                  <button onClick={() => community.login()}>Войти</button>,
                  чтобы продолжать на других устройствах.
                </>
              )}
            </p>
            <nav className="demo-episodes" aria-label="Серии">
              {catalog.episodes.map((item) => (
                <button
                  aria-current={
                    item.number === episode.number ? 'true' : undefined
                  }
                  key={item.number}
                  disabled={guest}
                  onClick={() => {
                    if (item.number !== episode.number)
                      selectEpisode(item.number);
                  }}
                >
                  {item.number}
                  <small>серия</small>
                </button>
              ))}
            </nav>
            <section
              className="demo-download-panel"
              aria-label="Скачивание видео"
            >
              <div>
                <Download size={19} />
                <strong>
                  {downloadingSeason
                    ? 'Все серии одним видео'
                    : `Скачать серию ${episode.number}`}
                </strong>
              </div>
              <p>
                {downloadingSeason
                  ? 'Один файл с главами серий, выбранной озвучкой и русскими субтитрами.'
                  : 'Выбранная озвучка и субтитры для этой серии.'}{' '}
                Сохраните для просмотра на сайте без интернета или скачайте MP4
                на устройство.
              </p>
              <div
                className="demo-download-scope"
                role="group"
                aria-label="Что скачать"
              >
                <button
                  aria-pressed={downloadingSeason}
                  disabled={!catalog.season}
                  onClick={() => setBundleDownload(true)}
                >
                  Все серии (
                  {catalog.season?.chapters.length || catalog.episodes.length})
                </button>
                <button
                  aria-pressed={!downloadingSeason}
                  onClick={() => setBundleDownload(false)}
                >
                  Только серия {episode.number}
                </button>
              </div>
              <div className="demo-download-actions demo-download-quality-grid">
                {downloadSelection?.qualities
                  .filter((item) => item.download)
                  .map((item) => (
                    <div className="demo-download-quality" key={item.height}>
                      <div>
                        <strong>{item.height}p</strong>
                        <span>
                          {item.download!.size >= 1024 ** 3
                            ? `${(item.download!.size / 1024 ** 3).toFixed(2)} ГБ`
                            : `${Math.round(item.download!.size / 1024 ** 2)} МБ`}
                        </span>
                      </div>
                      <button
                        disabled={downloadBusy}
                        onClick={() => {
                          if (downloadingSeason && !catalog.season?.id) {
                            setDownloadStatus(
                              'Объединённый файл ещё готовится.',
                            );
                            return;
                          }
                          setDownloadBusy(true);
                          setDownloadStatus('Подготавливаем загрузку…');
                          const task = downloadingSeason
                            ? startDemoSeasonDownload(
                                catalog.season!.id!,
                                voice.id,
                                item.height,
                                community.user?.id,
                              )
                            : startDemoDownload(
                                episode.number,
                                voice.id,
                                item.height,
                                community.user?.id,
                              );
                          void task
                            .then(() =>
                              setDownloadStatus(
                                'Скачивание началось. Не закрывайте вкладку до завершения.',
                              ),
                            )
                            .catch((cause) => {
                              setDownloadBusy(false);
                              setDownloadStatus((cause as Error).message);
                            });
                        }}
                      >
                        <Download size={15} />
                        Смотреть офлайн на сайте
                      </button>
                      <a
                        href={item.download!.url}
                        download={`ReZero-TV4-${downloadingSeason ? `episodes-${catalog.season!.chapters.map((chapter) => chapter.episode).join('-')}` : `episode-${episode.number}`}-${voice.id}-${item.height}p.mp4`}
                      >
                        Скачать MP4 на устройство ↓
                      </a>
                    </div>
                  ))}
              </div>
              <Link href="/downloads" className="demo-download-library">
                Открыть загрузки →
              </Link>
              {!downloadSelection?.qualities.some((item) => item.download) && (
                <p>Файлы для скачивания ещё готовятся.</p>
              )}
              {downloadStatus && <p role="status">{downloadStatus}</p>}
            </section>
          </section>
          <aside className="demo-aside">
            <div className="demo-feature-card">
              <Sparkles size={23} />
              <span className="demo-kicker">
                МАЛЕНЬКИЕ ВЕЩИ. БОЛЬШАЯ РАЗНИЦА.
              </span>
              <h2>Удобно с первой серии</h2>
              <ul>
                <li>Несколько озвучек и Full HD</li>
                <li>Сезон одной лентой с отметками серий</li>
                <li>Твоя скорость просмотра</li>
                <li>Продолжение с места остановки</li>
                <li>Пропуск заставок и автопереход</li>
                <li>Режим кино и горячие клавиши</li>
              </ul>
              <p>
                ← → перемотка · Пробел — пауза · F — полный экран. На телефоне —
                двойное касание слева или справа.
              </p>
            </div>
            <section className="demo-support">
              <Heart size={23} />
              <span className="demo-kicker">СОЗДАЁМ ВМЕСТЕ</span>
              <h2>
                Больше аниме.
                <br />В нашем плеере.
              </h2>
              <p>
                Это первый шаг. Поддержка поможет расширять библиотеку и
                развивать плеер.
              </p>
              {goal && (
                <>
                  <div className="demo-goal">
                    <strong>{goal.raised.toLocaleString('ru-RU')} ₽</strong>
                    <span>
                      из {goal.targetAmount.toLocaleString('ru-RU')} ₽
                    </span>
                  </div>
                  <progress
                    max={100}
                    value={goal.percent}
                    aria-label="Прогресс сбора на плеер"
                  />
                  <GoalRewardPreview goal={goal} />
                </>
              )}
              <BuySubscription
                className="demo-support-button"
                initialPlan="support"
                label="Поддержать новый плеер"
              />
              <p className="demo-payment-note">
                Просмотр и скачивание в демо бесплатны. Поддержка — по желанию.
              </p>
              <a href="/statistics">
                Подробнее о поддержке <ArrowRight size={15} />
              </a>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
