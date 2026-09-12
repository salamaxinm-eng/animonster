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

  useEffect(() => {
    setTab(
      new URLSearchParams(location.search).get('tab') === 'ongoing'
        ? 'ongoing'
        : 'all',
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
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
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [tab, page, sort]);

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
          <p className="error-msg" role="alert">
            {error}
          </p>
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
