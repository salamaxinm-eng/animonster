'use client';
import { useEffect, useState } from 'react';
import {
  CommunityHeader,
  useCommunity,
  api,
} from '@/components/community/context';
import { Comments } from '@/components/community/comments';
import { CollectionControl } from '@/components/community/collection-control';
import { EpisodePlayer } from '@/components/episode-player';
import {
  posterUrl,
  type Anime,
  type Episode,
  type Voiceover,
} from '@/lib/anime';
import { Button } from '@/components/ui/button';
import { EpisodeNotifications } from '@/components/episode-notifications';
import { AnimeThemes } from '@/components/anime-themes';
import { SeasonNavigation } from '@/components/season-navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
export function AnimePage({ anime }: { anime: Anime }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]),
    [voiceovers, setVoiceovers] = useState<Voiceover[]>([]),
    [episode, setEpisode] = useState(1),
    [start, setStart] = useState({ episode: 1, position: 0 }),
    [error, setError] = useState(''),
    [ageRejected, setAgeRejected] = useState(false),
    [ageBusy, setAgeBusy] = useState(false),
    [ageError, setAgeError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const community = useCommunity();
  const { user } = community;
  const ageLocked = !!anime.is_adult && !user?.adult_confirmed;
  async function load(retry = false) {
    setLoading(true);
    setError('');
    try {
      const [r, h] = await Promise.all([
        fetch(
          '/api/videos?id=' +
            anime.id +
            (anime.release_id ? '&release_id=' + anime.release_id : ''),
        ),
        fetch('/api/watch?anime=' + anime.id),
      ]);
      const x = (await r.json()) as any,
        history = (await h.json()) as { episode: number; position: number }[];
      if (!r.ok || !x.episodes?.length)
        throw Error(x.error || x.message || 'Серии временно недоступны.');
      const wanted = retry
        ? episode
        : Number(new URLSearchParams(location.search).get('episode')) ||
          history[0]?.episode ||
          1;
      const selected = x.episodes.some((e: Episode) => e.ordinal === wanted)
        ? wanted
        : x.episodes[0].ordinal;
      setStart({
        episode: selected,
        position:
          history.find((e: any) => e.episode === selected)?.position || 0,
      });
      setEpisode(selected);
      setEpisodes(x.episodes);
      setVoiceovers(x.voiceovers || []);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (ageLocked) {
      setLoading(false);
      return;
    }
    void load();
  }, [anime.id, user?.id, user?.adult_confirmed, ageLocked]);
  return (
    <div className="social-site">
      <CommunityHeader />
      <main className="title-page">
        <a className="muted" href="/#catalog">
          ← Каталог
        </a>
        <section className="title-intro">
          <img
            className="title-poster"
            src={posterUrl(anime)}
            alt={anime.russian}
          />
          <div>
            <span className="eyebrow">ANIMONSTER / АНИМЕ</span>
            <h1>{anime.russian}</h1>
            <p className="muted">{anime.name}</p>
            <div className="anime-meta">
              <strong>★ {anime.score}</strong>
              <span>{anime.aired_on.slice(0, 4)}</span>
              <span>{anime.episodes} серий</span>
              {anime.age_rating && <span>{anime.age_rating}</span>}
            </div>
            <div className="genre-links">
              {anime.genres?.map((g) => (
                <a key={g} href={'/genres/' + encodeURIComponent(g)}>
                  {g}
                </a>
              ))}
            </div>
            <AnimeThemes animeId={anime.id} />
            <p className="title-description">
              {anime.description?.replace(/<[^>]*>/g, '')}
            </p>
            <CollectionControl anime={anime} />
            <EpisodeNotifications animeId={anime.id} title={anime.russian} />
          </div>
        </section>
        <SeasonNavigation animeId={anime.id} />
        <section className="title-playback">
          <h2>Смотреть · серия {episode}</h2>
          {ageLocked ? (
            <div className="playback-error">
              {ageRejected
                ? 'Воспроизведение контента 18+ заблокировано.'
                : 'Перед просмотром нужно подтвердить возраст.'}
            </div>
          ) : loading ? (
            <p role="status">Загружаем серии…</p>
          ) : error ? (
            <div role="alert" className="playback-error">
              {error}
              <Button onClick={() => load(true)}>Повторить</Button>
            </div>
          ) : (
            <EpisodePlayer
              key={version}
              animeId={anime.id}
              releaseId={anime.release_id}
              episodes={episodes}
              voiceovers={voiceovers}
              animeTitle={anime.russian}
              initialEpisode={start.episode}
              initialPosition={start.position}
              onEpisodeChange={(n) => {
                setEpisode(n);
                window.history.replaceState(
                  null,
                  '',
                  '/anime/' + anime.id + '?episode=' + n,
                );
              }}
              onRetry={() => load(true)}
            />
          )}
        </section>
        <Dialog
          open={ageLocked && !ageRejected}
          onOpenChange={(open) => {
            if (!open) setAgeRejected(true);
          }}
        >
          <DialogContent>
            <DialogTitle>Вам уже исполнилось 18 лет?</DialogTitle>
            <DialogDescription>
              Подтверждение сохранится в аккаунте. До ответа видео не
              загружается.
            </DialogDescription>
            {ageError && (
              <p role="alert" className="error-msg">
                {ageError}
              </p>
            )}
            <div className="age-actions">
              <Button
                disabled={ageBusy}
                onClick={async () => {
                  if (!user) {
                    setAgeRejected(true);
                    community.login();
                    return;
                  }
                  setAgeBusy(true);
                  setAgeError('');
                  try {
                    await api('adult_consent', { confirmed: true });
                    await community.refresh();
                  } catch (reason) {
                    setAgeError((reason as Error).message);
                  } finally {
                    setAgeBusy(false);
                  }
                }}
              >
                {ageBusy
                  ? 'Сохраняем…'
                  : user
                    ? 'Да, мне есть 18'
                    : 'Войти и подтвердить возраст'}
              </Button>
              <Button variant="outline" onClick={() => setAgeRejected(true)}>
                Нет
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Comments
          key={episode}
          scope={'anime:' + anime.id + ':episode:' + episode}
        />
      </main>
    </div>
  );
}
