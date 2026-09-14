'use client';

import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { AnimeGrid } from '@/components/anime-grid';
import { CommunityHeader } from '@/components/community/context';
import { MobileCatalogTabs } from '@/components/mobile-catalog-tabs';
import type { Anime } from '@/lib/anime';

export default function CatalogPage() {
  const [tab, setTab] = useState<'all' | 'ongoing'>('all');
  const [items, setItems] = useState<Anime[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [sort, setSort] = useState<'rating' | 'fresh'>('rating');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setTab(
      new URLSearchParams(location.search).get('tab') === 'ongoing'
        ? 'ongoing'
        : 'all',
    );
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    setLoading(true);
    setError('');
    fetch(
      `/api/catalog?page=${page}&sort=${sort}&kind=${tab === 'ongoing' ? 'ongoing' : ''}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || 'Не удалось загрузить каталог');
        setPages(Number(response.headers.get('X-Total-Pages')) || 1);
        return result as Anime[];
      })
      .then(setItems)
      .catch((reason) => {
        if (timedOut)
          setError(
            'Каталог загружается дольше обычного. Проверьте соединение и попробуйте ещё раз.',
          );
        else if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!controller.signal.aborted) setLoading(false);
        else if (timedOut) setLoading(false);
      });
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [initialized, tab, page, sort, retry]);

  return (
    <div className="social-site mobile-catalog-page">
      <CommunityHeader />
      <main className="title-page">
        <MobileCatalogTabs active={tab} />
        <div className="mobile-catalog-toolbar">
          <h2>{tab === 'ongoing' ? 'Онгоинги' : 'Популярное'}</h2>
          <button
            onClick={() => setSort(sort === 'rating' ? 'fresh' : 'rating')}
          >
            <SlidersHorizontal />{' '}
            {sort === 'rating' ? 'По рейтингу' : 'Сначала новые'}
          </button>
        </div>
        {loading ? (
          <p role="status">Загружаем каталог…</p>
        ) : error ? (
          <div className="error-msg" role="alert">
            <p>{error}</p>
            <button onClick={() => setRetry((value) => value + 1)}>
              Попробовать снова
            </button>
          </div>
        ) : (
          <AnimeGrid items={items} />
        )}
        {pages > 1 && (
          <nav className="catalog-pagination" aria-label="Страницы каталога">
            <button
              className="primary"
              disabled={loading || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Назад
            </button>
            <span>
              {page} / {pages}
            </span>
            <button
              className="primary"
              disabled={loading || page >= pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Далее
            </button>
          </nav>
        )}
      </main>
    </div>
  );
}
