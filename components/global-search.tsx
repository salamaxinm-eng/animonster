'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { posterUrl, type Anime } from '@/lib/anime';

export function GlobalSearch() {
  const root = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Anime[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (location.pathname === '/search')
        setQuery(new URLSearchParams(location.search).get('q') || '');
    };
    sync();
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '7' });
        if (query.trim()) params.set('q', query.trim());
        const response = await fetch('/api/search?' + params, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const payload = await response.json();
        const found = new Map<number, Anime>();
        for (const result of payload.results || []) {
          if (result.type === 'anime') found.set(result.item.id, result.item);
          else
            for (const card of result.items || [])
              found.set(card.item.id, card.item);
        }
        setItems([...found.values()].slice(0, 7));
      } catch {
        if (!controller.signal.aborted) setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = query.trim();
    location.assign(
      clean ? `/search?q=${encodeURIComponent(clean)}` : '/search',
    );
  }

  return (
    <form ref={root} className="global-search" role="search" onSubmit={submit}>
      <Search size={17} aria-hidden="true" />
      <input
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        placeholder="Найти аниме"
        aria-label="Поиск аниме"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="global-search-results"
        autoComplete="off"
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setOpen(true);
          }}
          aria-label="Очистить поиск"
        >
          <X size={15} />
        </button>
      )}
      {open && (
        <div
          className="global-search-results"
          id="global-search-results"
          role="listbox"
        >
          <div className="global-search-caption">
            {query.trim() ? 'Подходящие аниме' : 'Популярное'}
          </div>
          {items.map((anime) => (
            <a
              href={`/anime/${anime.id}`}
              className="global-search-result"
              role="option"
              aria-label={`${anime.russian}, ${anime.aired_on?.slice(0, 4) || 'год неизвестен'}`}
              aria-selected="false"
              key={anime.id}
            >
              <img src={posterUrl(anime)} alt="" />
              <span>
                <strong>{anime.russian}</strong>
                <small>
                  {anime.aired_on?.slice(0, 4) || '—'} ·{' '}
                  {anime.kind === 'movie' ? 'Фильм' : 'Сериал'}
                </small>
              </span>
            </a>
          ))}
          {loading && <p className="global-search-state">Ищем…</p>}
          {!loading && !items.length && (
            <p className="global-search-state">Ничего не найдено</p>
          )}
          <a
            className="global-search-all"
            href={
              query.trim()
                ? `/search?q=${encodeURIComponent(query.trim())}`
                : '/search'
            }
          >
            Все результаты
          </a>
        </div>
      )}
    </form>
  );
}
