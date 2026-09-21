'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Copy,
  Crown,
  Expand,
  LogOut,
  MessageCircle,
  Send,
  Share2,
  ShieldBan,
  UsersRound,
  VolumeX,
  X,
} from 'lucide-react';
import { CommunityHeader, useCommunity } from '@/components/community/context';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import type { Episode, Voiceover } from '@/lib/anime';

type PartySnapshot = {
  party: {
    code: string;
    host_user_id: string;
    anime_id: number;
    anime_title: string;
    release_id: number | null;
    episode: number;
    provider: 'aniliberty' | 'kodik';
    voiceover: string;
    position_ms: number;
    playing: number;
    state_version: number;
    state_updated_at: number;
    next_episode: number | null;
    next_episode_at: number | null;
    approximate_sync: boolean;
    expires_at: number;
  };
  me: { user_id: string; host: boolean; chat_muted: number };
  members: Array<{
    user_id: string;
    role: 'host' | 'member';
    nick: string;
    avatar: string;
    theme: string;
    online: boolean;
    chat_muted: number;
  }>;
  messages: Array<{
    id: string;
    author_id: string;
    nick: string;
    body: string;
    created_at: number;
    deleted_at: number | null;
  }>;
  quota: {
    plus: boolean;
    used: number;
    remaining: number | null;
    reset_at: number;
    watched_seconds: number;
  };
  playback_allowed: boolean;
  playback_error: { error: string; code: string } | null;
};

type VideoPayload = {
  episodes: Episode[];
  voiceovers: Voiceover[];
};

const reactions = ['❤️', '😂', '😮', '😢', '🔥', '👏'];

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      result.error || 'Не удалось выполнить действие',
    ) as Error & {
      code?: string;
      status?: number;
    };
    error.code = result.code;
    error.status = response.status;
    throw error;
  }
  return result;
}

export function WatchPartyRoom({ code }: { code: string }) {
  const community = useCommunity();
  const [snapshot, setSnapshot] = useState<PartySnapshot | null>(null);
  const snapshotRef = useRef<PartySnapshot | null>(null);
  const [videos, setVideos] = useState<VideoPayload>({
    episodes: [],
    voiceovers: [],
  });
  const [quality, setQuality] = useState('720');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [chatText, setChatText] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [hideReactions, setHideReactions] = useState(false);
  const [floating, setFloating] = useState<
    Array<{ id: string; emoji: string; nick: string }>
  >([]);
  const [clock, setClock] = useState(Date.now());
  const [relations, setRelations] = useState<
    Array<{ id: number; title: string; release_id?: number }>
  >([]);
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const applyingRemote = useRef(false);
  const kodikPosition = useRef(0);
  const kodikReloadAt = useRef(0);
  const [kodikRevision, setKodikRevision] = useState(0);
  const [kodikSeek, setKodikSeek] = useState(0);
  const partySeconds = useRef(0);
  const watchSeconds = useRef(0);
  const watchToken = useRef('');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setCurrentSnapshot = useCallback((value: PartySnapshot) => {
    snapshotRef.current = value;
    setSnapshot(value);
  }, []);

  const load = useCallback(
    async (join = false) => {
      if (!community.loaded || !community.user) return;
      try {
        const value = await requestJson(
          `/api/watch-parties/${encodeURIComponent(code)}${join ? '/join' : ''}`,
          join
            ? {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
              }
            : undefined,
        );
        setCurrentSnapshot(value);
        setError('');
      } catch (reason) {
        const failure = reason as Error & { code?: string; status?: number };
        if (!join && failure.code === 'party_membership_required')
          return load(true);
        setError(failure.message);
      } finally {
        setLoading(false);
      }
    },
    [code, community.loaded, community.user?.id, setCurrentSnapshot],
  );

  const refreshSoon = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void load();
    }, 120);
  }, [load]);

  useEffect(() => {
    if (!community.loaded) return;
    if (!community.user) {
      setLoading(false);
      return;
    }
    void load();
  }, [community.loaded, community.user?.id, load]);

  useEffect(() => {
    if (!snapshot) return;
    const source = new EventSource(
      `/api/watch-parties/${encodeURIComponent(code)}/events`,
    );
    source.onmessage = (message) => {
      try {
        const item = JSON.parse(message.data);
        if (item.type === 'reaction' && !hideReactions) {
          const reaction = {
            id: `${item.id}`,
            emoji: item.payload.reaction,
            nick: item.payload.nick,
          };
          setFloating((current) => [...current.slice(-7), reaction]);
          setTimeout(
            () =>
              setFloating((current) =>
                current.filter((entry) => entry.id !== reaction.id),
              ),
            3200,
          );
        }
        refreshSoon();
      } catch {}
    };
    return () => source.close();
  }, [code, !!snapshot, hideReactions, refreshSoon]);

  useEffect(() => {
    if (!snapshot) return;
    const beat = () =>
      fetch(`/api/watch-parties/${encodeURIComponent(code)}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(() => {});
    void beat();
    const timer = setInterval(beat, 20_000);
    return () => clearInterval(timer);
  }, [code, !!snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [!!snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    void Promise.all([
      requestJson(
        `/api/videos?id=${snapshot.party.anime_id}${
          snapshot.party.release_id
            ? `&release_id=${snapshot.party.release_id}`
            : ''
        }`,
      ),
      requestJson(
        `/api/anime-relations?anime_id=${snapshot.party.anime_id}`,
      ).catch(() => ({
        mainline: [],
        branches: [],
      })),
    ])
      .then(([videoPayload, relationPayload]) => {
        if (cancelled) return;
        setVideos(videoPayload);
        const cards = [
          ...(relationPayload.mainline || []),
          ...(relationPayload.branches || []),
        ];
        setRelations(
          cards.map((card: any) => ({
            id: card.item.id,
            title: card.item.russian || card.item.name,
            release_id: card.item.release_id,
          })),
        );
      })
      .catch((reason) => setError(reason.message));
    return () => {
      cancelled = true;
    };
  }, [
    snapshot?.party.anime_id,
    snapshot?.party.release_id,
    community.user?.id,
  ]);

  const selectedEpisode = videos.episodes.find(
    (item) => item.ordinal === snapshot?.party.episode,
  );
  const selectedVoiceover =
    videos.voiceovers.find((item) => item.id === snapshot?.party.voiceover) ||
    videos.voiceovers.find(
      (item) => item.provider === snapshot?.party.provider,
    ) ||
    videos.voiceovers[0];
  const isKodik = selectedVoiceover?.provider === 'kodik';
  const stream = selectedEpisode
    ? (quality === '1080'
        ? selectedEpisode.hls_1080
        : quality === '480'
          ? selectedEpisode.hls_480
          : selectedEpisode.hls_720) ||
      selectedEpisode.hls_720 ||
      selectedEpisode.hls_480 ||
      selectedEpisode.hls_1080
    : null;

  useEffect(() => {
    if (!stream || isKodik || !video.current) return;
    let hls: import('hls.js').default | undefined;
    let cancelled = false;
    const element = video.current;
    void import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(stream);
        hls.attachMedia(element);
      } else element.src = stream;
    });
    return () => {
      cancelled = true;
      hls?.destroy();
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, [stream, isKodik, snapshot?.party.anime_id, snapshot?.party.episode]);

  const expectedSeconds = useCallback(() => {
    const current = snapshotRef.current?.party;
    if (!current) return 0;
    return (
      (current.position_ms +
        (current.playing
          ? Math.max(0, Date.now() - current.state_updated_at)
          : 0)) /
      1000
    );
  }, []);

  useEffect(() => {
    if (!snapshot || !connected || isKodik || !video.current) return;
    const element = video.current;
    const apply = () => {
      applyingRemote.current = true;
      const target = expectedSeconds();
      if (
        Number.isFinite(element.duration) &&
        Math.abs(element.currentTime - target) > 2
      )
        element.currentTime = Math.min(
          target,
          Math.max(0, element.duration - 0.5),
        );
      if (snapshot.party.playing) void element.play().catch(() => {});
      else element.pause();
      setTimeout(() => {
        applyingRemote.current = false;
      }, 700);
    };
    apply();
    const timer = setInterval(apply, 5000);
    return () => clearInterval(timer);
  }, [
    connected,
    isKodik,
    snapshot?.party.state_version,
    snapshot?.party.playing,
    snapshot?.party.episode,
    expectedSeconds,
  ]);

  useEffect(() => {
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
      const time = Number(
        payload?.key === 'kodik_player_time_update'
          ? payload.value
          : payload?.kodik_player_time_update,
      );
      if (Number.isFinite(time) && time >= 0) {
        if (time > kodikPosition.current && time - kodikPosition.current < 10) {
          const delta = time - kodikPosition.current;
          partySeconds.current += delta;
          watchSeconds.current += delta;
        }
        kodikPosition.current = time;
      }
      if (
        (payload?.key === 'kodik_player_video_ended' ||
          payload?.kodik_player_video_ended === true) &&
        snapshotRef.current?.me.host
      )
        void scheduleNext();
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  });

  useEffect(() => {
    if (!snapshot || !connected || !isKodik || !snapshot.playback_allowed)
      return;
    const sync = () => {
      const target = expectedSeconds();
      if (
        Math.abs(kodikPosition.current - target) > 8 &&
        Date.now() - kodikReloadAt.current > 15_000
      ) {
        kodikReloadAt.current = Date.now();
        void fetch(`/api/watch-parties/${encodeURIComponent(code)}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seconds: 0, telemetry: 'kodik_desync' }),
        }).catch(() => {});
        setKodikSeek(target);
        setKodikRevision((value) => value + 1);
      }
    };
    sync();
    const timer = setInterval(sync, 5000);
    return () => clearInterval(timer);
  }, [
    connected,
    code,
    isKodik,
    snapshot?.party.state_version,
    snapshot?.playback_allowed,
    expectedSeconds,
  ]);

  const command = useCallback(
    async (commandName: string, values: Record<string, unknown> = {}) => {
      const current = snapshotRef.current;
      if (!current) return;
      try {
        const result = await requestJson(
          `/api/watch-parties/${encodeURIComponent(code)}/command`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              command: commandName,
              version: current.party.state_version,
              ...values,
            }),
          },
        );
        setCurrentSnapshot(result);
      } catch (reason) {
        const failure = reason as Error & { code?: string };
        if (failure.code === 'stale_party_state') void load();
        else setError(failure.message);
      }
    },
    [code, load, setCurrentSnapshot],
  );

  const scheduleNext = useCallback(async () => {
    const current = snapshotRef.current;
    if (!current?.me.host) return;
    const next = videos.episodes.find(
      (item) => item.ordinal > current.party.episode,
    );
    if (next) await command('schedule_next', { episode: next.ordinal });
  }, [command, videos.episodes]);

  useEffect(() => {
    if (!snapshot || !connected || !snapshot.playback_allowed) return;
    watchToken.current = '';
    watchSeconds.current = 0;
    partySeconds.current = 0;
    void requestJson('/api/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'start',
        anime_id: snapshot.party.anime_id,
        episode: snapshot.party.episode,
        provider: snapshot.party.provider,
        voiceover: snapshot.party.voiceover,
      }),
    })
      .then((result) => {
        watchToken.current = result.token || '';
      })
      .catch(() => {});
    const tick = setInterval(() => {
      if (
        !isKodik &&
        video.current &&
        !video.current.paused &&
        !video.current.seeking
      ) {
        partySeconds.current += 1;
        watchSeconds.current += 1;
      }
    }, 1000);
    const flush = async () => {
      const partyAmount = Math.floor(partySeconds.current);
      const historyAmount = Math.floor(watchSeconds.current);
      partySeconds.current -= partyAmount;
      watchSeconds.current -= historyAmount;
      const position = isKodik
        ? kodikPosition.current
        : video.current?.currentTime || 0;
      if (partyAmount > 0)
        void requestJson(
          `/api/watch-parties/${encodeURIComponent(code)}/progress`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seconds: partyAmount }),
          },
        )
          .then((result) => {
            if (!result.allowed) void load();
          })
          .catch(() => {});
      if (historyAmount > 0 && watchToken.current)
        void fetch('/api/watch', {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: watchToken.current,
            seconds: historyAmount,
            position,
          }),
        }).catch(() => {});
    };
    const flushTimer = setInterval(flush, 15_000);
    window.addEventListener('pagehide', flush);
    return () => {
      clearInterval(tick);
      clearInterval(flushTimer);
      void flush();
      window.removeEventListener('pagehide', flush);
    };
  }, [
    code,
    connected,
    isKodik,
    snapshot?.party.anime_id,
    snapshot?.party.episode,
    snapshot?.party.voiceover,
    snapshot?.playback_allowed,
    load,
  ]);

  const iframeUrl = useMemo(() => {
    if (!selectedVoiceover?.player_url || !snapshot) return '';
    try {
      const relative = selectedVoiceover.player_url.startsWith('/');
      const url = new URL(
        selectedVoiceover.player_url,
        'https://animonster.invalid',
      );
      url.searchParams.set('episode', String(snapshot.party.episode));
      const position = kodikSeek || expectedSeconds();
      if (position > 0)
        url.searchParams.set('start_from', String(Math.floor(position)));
      if (snapshot.party.playing) url.searchParams.set('autoplay', '1');
      return relative ? `${url.pathname}${url.search}` : url.href;
    } catch {
      return '';
    }
  }, [
    selectedVoiceover?.player_url,
    snapshot?.party.episode,
    snapshot?.party.playing,
    kodikRevision,
  ]);

  async function sendChat() {
    if (!chatText.trim()) return;
    const body = chatText;
    setChatText('');
    try {
      await requestJson(`/api/watch-parties/${encodeURIComponent(code)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      refreshSoon();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function sendReaction(reaction: string) {
    try {
      await requestJson(
        `/api/watch-parties/${encodeURIComponent(code)}/reaction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reaction }),
        },
      );
    } catch {}
  }

  async function moderate(values: Record<string, unknown>) {
    try {
      await requestJson(
        `/api/watch-parties/${encodeURIComponent(code)}/moderation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        },
      );
      refreshSoon();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function share() {
    const url = location.href;
    try {
      if (navigator.share)
        await navigator.share({ title: 'Смотрим аниме вместе', url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice('Ссылка скопирована');
      }
    } catch {}
  }

  async function leave(end = false) {
    try {
      await requestJson(
        `/api/watch-parties/${encodeURIComponent(code)}/leave${end ? '?end=true' : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      location.href = `/anime/${snapshot?.party.anime_id || ''}`;
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  if (!community.loaded || loading)
    return (
      <div className="social-site">
        <CommunityHeader />
        <main className="party-loading" role="status">
          Готовим комнату…
        </main>
      </div>
    );

  if (!community.user)
    return (
      <div className="social-site">
        <CommunityHeader />
        <main className="party-gate">
          <UsersRound size={44} />
          <h1>Войдите в AniMonster</h1>
          <p>
            Совместный просмотр доступен только авторизованным пользователям.
          </p>
          <Button onClick={community.login}>Войти и присоединиться</Button>
        </main>
      </div>
    );

  if (!snapshot)
    return (
      <div className="social-site">
        <CommunityHeader />
        <main className="party-gate">
          <ShieldBan size={44} />
          <h1>Не удалось открыть комнату</h1>
          <p>{error || 'Ссылка недействительна или комната уже завершена.'}</p>
          <Button variant="outline" onClick={() => (location.href = '/')}>
            На главную
          </Button>
        </main>
      </div>
    );

  const countdown = snapshot.party.next_episode_at
    ? Math.max(0, Math.ceil((snapshot.party.next_episode_at - clock) / 1000))
    : null;
  const nextEpisode = videos.episodes.find(
    (item) => item.ordinal > snapshot.party.episode,
  );

  return (
    <div className="social-site watch-party-site">
      <CommunityHeader />
      <main className="watch-party-page">
        <header className="party-topbar">
          <div>
            <a href={`/anime/${snapshot.party.anime_id}`} className="muted">
              <ChevronLeft size={17} /> К тайтлу
            </a>
            <h1>{snapshot.party.anime_title}</h1>
            <p>
              Комната {snapshot.party.code} · серия {snapshot.party.episode}
            </p>
          </div>
          <div className="party-top-actions">
            <Button variant="outline" onClick={() => void share()}>
              <Share2 size={17} /> Пригласить
            </Button>
            <Button
              variant="outline"
              onClick={() => void leave(snapshot.me.host)}
            >
              <LogOut size={17} /> {snapshot.me.host ? 'Завершить' : 'Выйти'}
            </Button>
          </div>
        </header>

        {error && (
          <div className="party-alert" role="alert">
            {error}
            <button onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="party-notice" role="status">
            {notice}
          </div>
        )}

        <div className="watch-party-layout">
          <section className="party-stage">
            <div className="party-player" ref={player}>
              {!connected ? (
                <div className="party-connect">
                  <UsersRound size={46} />
                  <h2>Подключиться к просмотру</h2>
                  <p>
                    Одно нажатие разрешит воспроизведение со звуком и
                    синхронизирует позицию.
                  </p>
                  <Button
                    disabled={!snapshot.playback_allowed}
                    onClick={() => {
                      setConnected(true);
                      setTimeout(() => {
                        if (!isKodik && snapshot.party.playing)
                          void video.current?.play().catch(() => {});
                      }, 100);
                    }}
                  >
                    Подключиться
                  </Button>
                  {!snapshot.playback_allowed && (
                    <div className="party-limit-card">
                      <strong>{snapshot.playback_error?.error}</strong>
                      <span>
                        Обновится{' '}
                        {new Date(snapshot.quota.reset_at).toLocaleString(
                          'ru-RU',
                          {
                            weekday: 'long',
                            hour: '2-digit',
                            minute: '2-digit',
                          },
                        )}
                      </span>
                      <a href="/profile">Подключить AniMonster Plus</a>
                    </div>
                  )}
                </div>
              ) : isKodik ? (
                iframeUrl ? (
                  <iframe
                    key={`${snapshot.party.anime_id}:${snapshot.party.episode}:${kodikRevision}`}
                    ref={frame}
                    src={iframeUrl}
                    title={`${snapshot.party.anime_title} — серия ${snapshot.party.episode}`}
                    allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *"
                    allowFullScreen
                  />
                ) : (
                  <div className="party-connect">
                    Источник временно недоступен.
                  </div>
                )
              ) : stream ? (
                <video
                  ref={video}
                  controls={snapshot.me.host}
                  playsInline
                  onPlay={() => {
                    if (snapshot.me.host && !applyingRemote.current)
                      void command('play');
                  }}
                  onPause={() => {
                    if (
                      snapshot.me.host &&
                      !applyingRemote.current &&
                      !video.current?.ended
                    )
                      void command('pause');
                  }}
                  onSeeked={() => {
                    if (snapshot.me.host && !applyingRemote.current)
                      void command('seek', {
                        position_ms: Math.floor(
                          (video.current?.currentTime || 0) * 1000,
                        ),
                      });
                  }}
                  onEnded={() => void scheduleNext()}
                />
              ) : (
                <div className="party-connect">
                  У этой озвучки нет нативного потока.
                </div>
              )}

              {snapshot.party.approximate_sync && connected && (
                <span className="party-soft-sync">
                  Мягкая синхронизация Kodik
                </span>
              )}
              {countdown !== null && (
                <div className="party-countdown">
                  <strong>Следующая серия через {countdown}</strong>
                  <span>Серия {snapshot.party.next_episode}</span>
                  {snapshot.me.host && (
                    <Button
                      variant="outline"
                      onClick={() => void command('cancel_next')}
                    >
                      Отменить
                    </Button>
                  )}
                </div>
              )}
              {!hideReactions && (
                <div className="party-floating-reactions" aria-live="polite">
                  {floating.map((item) => (
                    <span key={item.id} title={item.nick}>
                      {item.emoji}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="party-controls">
              {snapshot.me.host && (
                <>
                  <NativeSelect
                    aria-label="Выбор части франшизы"
                    value={snapshot.party.anime_id}
                    onChange={(event) => {
                      const item = relations.find(
                        (relation) =>
                          relation.id === Number(event.target.value),
                      );
                      if (item)
                        void command('change_media', {
                          anime_id: item.id,
                          release_id: item.release_id,
                          episode: 1,
                          provider: 'kodik',
                          voiceover: 'kodik',
                        });
                    }}
                  >
                    {(relations.length
                      ? relations
                      : [
                          {
                            id: snapshot.party.anime_id,
                            title: snapshot.party.anime_title,
                          },
                        ]
                    ).map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    aria-label="Выбор серии"
                    value={snapshot.party.episode}
                    onChange={(event) =>
                      void command('change_media', {
                        anime_id: snapshot.party.anime_id,
                        release_id: snapshot.party.release_id,
                        episode: Number(event.target.value),
                        provider: snapshot.party.provider,
                        voiceover: snapshot.party.voiceover,
                      })
                    }
                  >
                    {videos.episodes.map((item) => (
                      <option key={item.ordinal} value={item.ordinal}>
                        Серия {item.ordinal}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    aria-label="Выбор озвучки"
                    value={selectedVoiceover?.id || snapshot.party.voiceover}
                    onChange={(event) => {
                      const voiceover = videos.voiceovers.find(
                        (item) => item.id === event.target.value,
                      );
                      if (voiceover)
                        void command('change_media', {
                          anime_id: snapshot.party.anime_id,
                          release_id: snapshot.party.release_id,
                          episode: snapshot.party.episode,
                          provider: voiceover.provider,
                          voiceover: voiceover.id,
                        });
                    }}
                  >
                    {videos.voiceovers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </NativeSelect>
                </>
              )}
              {!isKodik && (
                <NativeSelect
                  value={quality}
                  aria-label="Качество"
                  onChange={(event) => setQuality(event.target.value)}
                >
                  {['480', '720', '1080'].map((item) => (
                    <option value={item} key={item}>
                      {item}p
                    </option>
                  ))}
                </NativeSelect>
              )}
              {snapshot.me.host && connected && isKodik && (
                <Button
                  variant="outline"
                  onClick={() =>
                    void command(snapshot.party.playing ? 'pause' : 'play')
                  }
                >
                  {snapshot.party.playing
                    ? 'Пауза для всех'
                    : 'Продолжить для всех'}
                </Button>
              )}
              {!snapshot.me.host && connected && !isKodik && (
                <Button
                  variant="outline"
                  aria-label="Полный экран"
                  onClick={() => void player.current?.requestFullscreen()}
                >
                  <Expand size={17} /> Полный экран
                </Button>
              )}
              {snapshot.me.host &&
                nextEpisode &&
                !snapshot.party.next_episode_at && (
                  <Button variant="outline" onClick={() => void scheduleNext()}>
                    Следующая серия
                  </Button>
                )}
            </div>

            <div className="party-status-strip">
              <span>
                <UsersRound size={16} />{' '}
                {snapshot.members.filter((item) => item.online).length}/
                {snapshot.members.length} в комнате
              </span>
              <span>
                {snapshot.quota.plus
                  ? 'Plus · серии без лимита'
                  : `Free · осталось ${snapshot.quota.remaining} из 10`}
              </span>
              <button onClick={() => setHideReactions((value) => !value)}>
                {hideReactions ? 'Показать реакции' : 'Скрыть реакции'}
              </button>
            </div>

            <div className="party-reaction-bar">
              {reactions.map((reaction) => (
                <button
                  key={reaction}
                  onClick={() => void sendReaction(reaction)}
                >
                  {reaction}
                </button>
              ))}
            </div>
          </section>

          <aside className={`party-sidebar ${chatOpen ? 'open' : ''}`}>
            <div className="party-sidebar-head">
              <div>
                <strong>Комната</strong>
                <span>{snapshot.members.length} участников</span>
              </div>
              <button
                className="party-mobile-close"
                onClick={() => setChatOpen(false)}
              >
                <X />
              </button>
            </div>
            <div className="party-invite-code">
              <span>{snapshot.party.code}</span>
              <button
                title="Скопировать код"
                onClick={() => {
                  void navigator.clipboard.writeText(snapshot.party.code);
                  setNotice('Код скопирован');
                }}
              >
                <Copy size={16} />
              </button>
            </div>
            <div className="party-members">
              {snapshot.members.map((member) => (
                <div
                  className={member.online ? '' : 'offline'}
                  key={member.user_id}
                >
                  <span className="party-member-avatar">
                    {member.nick.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{member.nick}</strong>
                    <small>
                      {member.role === 'host'
                        ? 'Ведущий'
                        : member.online
                          ? 'Смотрит'
                          : 'Не в сети'}
                    </small>
                  </span>
                  {member.role === 'host' && <Crown size={15} />}
                  {snapshot.me.host &&
                    member.user_id !== snapshot.me.user_id && (
                      <span className="party-member-actions">
                        <button
                          title="Отключить чат"
                          onClick={() =>
                            void moderate({
                              action: 'mute',
                              user_id: member.user_id,
                              value: !member.chat_muted,
                            })
                          }
                        >
                          <VolumeX size={14} />
                        </button>
                        <button
                          title="Выгнать"
                          onClick={() =>
                            void moderate({
                              action: 'kick',
                              user_id: member.user_id,
                            })
                          }
                        >
                          <ShieldBan size={14} />
                        </button>
                      </span>
                    )}
                </div>
              ))}
            </div>
            <div className="party-chat">
              {snapshot.messages.map((message) => (
                <article key={message.id}>
                  <div>
                    <strong>{message.nick}</strong>
                    <time>
                      {new Date(message.created_at).toLocaleTimeString(
                        'ru-RU',
                        { hour: '2-digit', minute: '2-digit' },
                      )}
                    </time>
                  </div>
                  <p>
                    {message.deleted_at ? 'Сообщение удалено' : message.body}
                  </p>
                  {!message.deleted_at && (
                    <div className="party-message-actions">
                      {snapshot.me.host && (
                        <button
                          onClick={() =>
                            void moderate({
                              action: 'delete_message',
                              message_id: message.id,
                            })
                          }
                        >
                          Удалить
                        </button>
                      )}
                      {message.author_id !== snapshot.me.user_id && (
                        <button
                          onClick={() =>
                            void requestJson(
                              `/api/watch-parties/${encodeURIComponent(code)}/chat`,
                              {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  action: 'report',
                                  message_id: message.id,
                                  reason: 'Нарушение правил комнаты',
                                }),
                              },
                            )
                              .then(() => setNotice('Жалоба отправлена'))
                              .catch((reason) => setError(reason.message))
                          }
                        >
                          Пожаловаться
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
            <form
              className="party-chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                void sendChat();
              }}
            >
              <input
                value={chatText}
                maxLength={600}
                disabled={!!snapshot.me.chat_muted}
                placeholder={
                  snapshot.me.chat_muted ? 'Ведущий отключил чат' : 'Сообщение…'
                }
                onChange={(event) => setChatText(event.target.value)}
              />
              <button
                disabled={!chatText.trim() || !!snapshot.me.chat_muted}
                aria-label="Отправить"
              >
                <Send size={18} />
              </button>
            </form>
          </aside>
        </div>

        <button className="party-mobile-chat" onClick={() => setChatOpen(true)}>
          <MessageCircle size={20} /> Чат
        </button>
      </main>
    </div>
  );
}
