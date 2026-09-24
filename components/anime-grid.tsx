'use client';
import { posterUrl, type Anime } from '@/lib/anime';
import { Heart } from 'lucide-react';
import { api, useCommunity } from '@/components/community/context';
import { useEffect, useState } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
export function AnimeGrid({
  items,
  horizontal = false,
}: {
  items: Anime[];
  horizontal?: boolean;
}) {
  const c = useCommunity(),
    [saved, setSaved] = useState<number[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    if (!c.user) {
      setSaved([]);
      return;
    }
    let alive = true;
    api('profile')
      .then((p) => {
        if (alive)
          setSaved(
            p.entries
              .filter((e: any) => e.favorite)
              .map((e: any) => e.anime_id),
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [c.user?.id]);
  const cards = items.map((a) => (
    <AnimeCard
      anime={a}
      carousel={horizontal}
      saved={saved.includes(a.id)}
      key={a.id}
      onToggle={async () => {
        if (!c.user) {
          c.login();
          return;
        }
        try {
          await api('favorite', {
            anime_id: a.id,
            value: !saved.includes(a.id),
          });
          setSaved(
            saved.includes(a.id)
              ? saved.filter((x) => x !== a.id)
              : [...saved, a.id],
          );
          setError('');
          window.dispatchEvent(new Event('animonster-library-changed'));
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    />
  ));
  return (
    <>
      {horizontal ? (
        <Carousel
          className="anime-carousel"
          opts={{
            align: 'start',
            containScroll: 'trimSnaps',
            dragFree: true,
            loop: false,
          }}
          aria-label="Подборка аниме"
        >
          <CarouselContent className="anime-slider ml-0">
            {cards}
          </CarouselContent>
          {items.length > 1 && (
            <div className="anime-carousel-controls">
              <CarouselPrevious aria-label="Предыдущие аниме" />
              <CarouselNext aria-label="Следующие аниме" />
            </div>
          )}
        </Carousel>
      ) : (
        <div className="cards">{cards}</div>
      )}
      {error && (
        <p className="error-msg" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function AnimeCard({
  anime,
  carousel,
  saved,
  onToggle,
}: {
  anime: Anime;
  carousel: boolean;
  saved: boolean;
  onToggle: () => void | Promise<void>;
}) {
  const card = (
    <article className="card">
      <a className="poster" href={'/anime/' + anime.id}>
        <img src={posterUrl(anime)} alt={anime.russian} loading="lazy" />
        <span className="score">★ {anime.score}</span>
      </a>
      <div className="card-title">
        <a href={'/anime/' + anime.id}>{anime.russian}</a>
        <button
          aria-label="В избранное"
          className={saved ? 'saved' : ''}
          onClick={onToggle}
        >
          <Heart size={18} fill={saved ? 'currentColor' : 'none'} />
        </button>
      </div>
      <p>
        {anime.aired_on.slice(0, 4)} · {anime.episodes || '—'} серий
      </p>
      {anime.reason && <p className="recommendation-reason">{anime.reason}</p>}
    </article>
  );
  return carousel ? (
    <CarouselItem className="anime-slide basis-auto pl-0">{card}</CarouselItem>
  ) : (
    card
  );
}
