'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AnimePage } from '@/components/anime-page';
import { CommunityHeader } from '@/components/community/context';
import type { Anime } from '@/lib/anime';

export default function Page() {
  const { id: slug } = useParams<{ id: string }>();
  const [anime, setAnime] = useState<Anime | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const match = /^(\d{1,9})(?:-[a-z0-9-]+)?$/.exec(slug);
    const query = match
      ? 'anime_id=' + encodeURIComponent(match[1])
      : 'alias=' + encodeURIComponent(slug);
    setLoading(true);
    setError('');
    fetch('/api/catalog?' + query, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || 'Не удалось загрузить тайтл');
        if (!result[0]) throw Error('Такой тайтл не найден.');
        return result[0] as Anime;
      })
      .then(setAnime)
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug, attempt]);

  if (anime) return <AnimePage anime={anime} />;

  return (
    <div className="social-site">
      <CommunityHeader />
      <main className="title-page title-load-state">
        {loading ? (
          <p role="status">Загружаем аниме…</p>
        ) : (
          <div role="alert" className="playback-error">
            <p>{error}</p>
            <button
              className="primary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Повторить
            </button>
            <a href="/#catalog">Вернуться в каталог</a>
          </div>
        )}
      </main>
    </div>
  );
}
