'use client';
import { useEffect, useState } from 'react';
import { CommunityHeader, useCommunity } from '@/components/community/context';
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
export function AnimePage({ anime }: { anime: Anime }) {
  const [episodes, setEpisodes] = useState<Episode[]>([]),
    [voiceovers, setVoiceovers] = useState<Voiceover[]>([]),
    [voiceoverStatus, setVoiceoverStatus] = useState('disabled'),
    [episode, setEpisode] = useState(1),
    [start, setStart] = useState({ episode: 1, position: 0 }),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const { user } = useCommunity();
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
      setVoiceoverStatus(x.voiceovers_status || 'disabled');
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [anime.id, user?.id]);
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
            </div>
            <div className="genre-links">
              {anime.genres?.map((g) => (
                <a key={g} href={'/genres/' + encodeURIComponent(g)}>
                  {g}
                </a>
              ))}
            </div>
            <p className="title-description">
              {anime.description?.replace(/<[^>]*>/g, '')}
            </p>
            <CollectionControl anime={anime} />
          </div>
        </section>
        <section className="title-playback">
          <h2>Смотреть · серия {episode}</h2>
          {loading ? (
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
              episodes={episodes}
              voiceovers={voiceovers}
              voiceoverStatus={voiceoverStatus}
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
        <Comments
          key={episode}
          scope={'anime:' + anime.id + ':episode:' + episode}
        />
      </main>
    </div>
  );
}
