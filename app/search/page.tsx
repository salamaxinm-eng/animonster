'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { AnimeGrid } from '@/components/anime-grid';
import type { Anime } from '@/lib/anime';

const STORAGE_KEY = 'animonster-recent-searches';

export default function SearchPage() {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Anime[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const initial = new URLSearchParams(location.search).get('q') || '';
    setQuery(initial);
    try {
      setRecent(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    } catch {}
    input.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(
          '/api/catalog?sort=rating&q=' + encodeURIComponent(query),
          { signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || 'Не удалось выполнить поиск');
        setItems(result);
      } catch (reason) {
        if (!controller.signal.aborted) setError((reason as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function remember(value: string) {
    const clean = value.trim();
    if (!clean) return;
    const next = [
      clean,
      ...recent.filter((item) => item.toLowerCase() !== clean.toLowerCase()),
    ].slice(0, 6);
    setRecent(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function changeQuery(value: string) {
    setQuery(value);
    history.replaceState(
      null,
      '',
      value.trim()
        ? '/search?q=' + encodeURIComponent(value.trim())
        : '/search',
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    remember(query);
    history.replaceState(
      null,
      '',
      query.trim()
        ? '/search?q=' + encodeURIComponent(query.trim())
        : '/search',
    );
  }

  return (
    <div className="mobile-search-page social-site">
      <form className="mobile-search-form" onSubmit={submit}>
        <button type="button" onClick={() => history.back()} aria-label="Назад">
          <ArrowLeft />
        </button>
        <label>
          <Search aria-hidden="true" />
          <input
            ref={input}
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="Название аниме"
            aria-label="Поиск аниме"
          />
          {query && (
            <button
              type="button"
              onClick={() => changeQuery('')}
              aria-label="Очистить"
            >
              <X />
            </button>
          )}
        </label>
      </form>
      <main className="mobile-search-results">
        {!query && recent.length > 0 && (
          <section className="recent-searches">
            <div>
              <h1>Недавние запросы</h1>
              <button
                onClick={() => {
                  setRecent([]);
                  localStorage.removeItem(STORAGE_KEY);
                }}
              >
                Очистить
              </button>
            </div>
            <nav>
              {recent.map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    changeQuery(value);
                    remember(value);
                  }}
                >
                  {value}
                </button>
              ))}
            </nav>
          </section>
        )}
        <h2>
          {query ? `Результаты по запросу «${query}»` : 'Популярное сейчас'}
        </h2>
        {loading ? (
          <p role="status">Ищем аниме…</p>
        ) : error ? (
          <p className="error-msg" role="alert">
            {error}
          </p>
        ) : items.length ? (
          <AnimeGrid items={items} />
        ) : (
          <div className="mobile-empty">
            <Search />
            <h3>Ничего не найдено</h3>
            <p>Проверь название или попробуй другой запрос.</p>
          </div>
        )}
      </main>
    </div>
  );
}
