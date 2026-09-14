'use client';
import { useEffect, useState } from 'react';
import type { Anime } from '@/lib/anime';
import { AnimeGrid } from './anime-grid';
import { Button } from './ui/button';
export function GenreCatalog({ genre }: { genre: string }) {
  const [items, setItems] = useState<Anime[]>([]),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    const a = new AbortController();
    setLoading(true);
    fetch('/api/catalog?genre=' + encodeURIComponent(genre) + '&page=' + page, {
      signal: a.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error('Не удалось загрузить жанр');
        setPages(Number(r.headers.get('X-Total-Pages')) || 1);
        setItems(await r.json());
        setError('');
      })
      .catch((e) => {
        if (!a.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!a.signal.aborted) setLoading(false);
      });
    return () => a.abort();
  }, [genre, page]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Загрузка…</p>
      ) : items.length ? (
        <AnimeGrid items={items} />
      ) : (
        <p>Тайтлов пока нет.</p>
      )}
      <nav className="catalog-pagination">
        <Button
          disabled={loading || page === 1}
          onClick={() => setPage(page - 1)}
        >
          Назад
        </Button>
        <span>
          {page} / {pages}
        </span>
        <Button
          disabled={loading || page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Далее
        </Button>
      </nav>
    </>
  );
}
