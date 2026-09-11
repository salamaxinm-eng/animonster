'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CommunityHeader, useCommunity } from '@/components/community/context';
import { AnimeGrid } from '@/components/anime-grid';
import { Button } from '@/components/ui/button';
import type { Anime } from '@/lib/anime';

const labels: Record<string, string> = {
  recommended: 'Все рекомендации',
  new: 'Новые эпизоды',
  popular: 'Популярное сейчас',
};

export default function BrowsePage() {
  const { source } = useParams<{ source: string }>();
  const { user } = useCommunity();
  const [items, setItems] = useState<Anime[]>([]);
  const [title, setTitle] = useState(labels[source] || 'Подборка');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const section = Math.max(0, Number(new URLSearchParams(location.search).get('section')) || 0);
    setLoading(true);
    setError('');
    const url = source === 'recommended'
      ? '/api/recommendations'
      : '/api/catalog?sort=' + (source === 'new' ? 'fresh' : 'rating') + '&page=' + page;
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw Error(result.error || 'Не удалось загрузить подборку');
        if (source === 'recommended') {
          const selected = result.sections?.[section] || result.sections?.[0];
          setTitle(selected?.title || labels.recommended);
          setPages(1);
          return selected?.items || [];
        }
        setTitle(labels[source] || 'Подборка');
        setPages(Number(response.headers.get('X-Total-Pages')) || 1);
        return result;
      })
      .then(setItems)
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [source, page, user?.id]);

  const back = source === 'recommended' ? '/recommendations' : '/';
  return (
    <div className="social-site">
      <CommunityHeader />
      <main className="title-page browse-page">
        <span className="eyebrow">ANIMONSTER / ПОДБОРКА</span>
        <div className="browse-heading">
          <div>
            <h1>{title}</h1>
            <p className="muted">Все тайтлы этой подборки на одной странице.</p>
          </div>
          <a href={back}>← Назад</a>
        </div>
        {loading ? (
          <p role="status">Загружаем аниме…</p>
        ) : error ? (
          <p className="error-msg" role="alert">{error}</p>
        ) : items.length ? (
          <AnimeGrid items={items} />
        ) : (
          <p className="muted">В этой подборке пока нет тайтлов.</p>
        )}
        {source !== 'recommended' && pages > 1 && (
          <div className="catalog-pagination">
            <Button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Назад</Button>
            <span>{page} / {pages}</span>
            <Button disabled={page >= pages || loading} onClick={() => setPage((value) => Math.min(pages, value + 1))}>Далее</Button>
          </div>
        )}
      </main>
    </div>
  );
}
