'use client';
import { posterUrl, type Anime } from '@/lib/anime';
import { Heart } from 'lucide-react';
import { api, useCommunity } from '@/components/community/context';
import { useEffect, useState } from 'react';
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
  return (
    <>
      <div className={horizontal ? 'anime-slider' : 'cards'}>
        {items.map((a) => (
          <article className="card" key={a.id}>
            <a className="poster" href={'/anime/' + a.id}>
              <img src={posterUrl(a)} alt={a.russian} loading="lazy" />
              <span className="score">★ {a.score}</span>
            </a>
            <div className="card-title">
              <a href={'/anime/' + a.id}>{a.russian}</a>
              <button
                aria-label="В избранное"
                className={saved.includes(a.id) ? 'saved' : ''}
                onClick={async () => {
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
              >
                <Heart
                  size={18}
                  fill={saved.includes(a.id) ? 'currentColor' : 'none'}
                />
              </button>
            </div>
            <p>
              {a.aired_on.slice(0, 4)} · {a.episodes || '—'} серий
            </p>
          </article>
        ))}
      </div>
      {error && (
        <p className="error-msg" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
