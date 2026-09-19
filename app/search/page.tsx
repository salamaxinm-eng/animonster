'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, X, Tags, ChevronDown } from 'lucide-react';
import { AnimeGrid } from '@/components/anime-grid';
import type { Anime } from '@/lib/anime';

const STORAGE_KEY = 'animonster-recent-searches';

export default function SearchPage() {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('');
  const [themes, setThemes] = useState<string[]>([]);
  const [themeSearch, setThemeSearch] = useState('');
  const [showThemeFilters, setShowThemeFilters] = useState(false);
  const [items, setItems] = useState<Anime[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(location.search);
      const initialQuery = params.get('q') || '';
      const initialTheme = params.get('tag') || '';
      setQuery(initialQuery);
      setSelectedTheme(initialTheme);
      setShowThemeFilters(!!initialTheme);
    };
    syncFromUrl();
    addEventListener('popstate', syncFromUrl);
    try {
      setRecent(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    } catch {}
    input.current?.focus();
    return () => removeEventListener('popstate', syncFromUrl);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/anime-tags?list=themes', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить темы');
        return (await response.json()) as { themes?: string[] };
      })
      .then((result) => setThemes(result.themes || []))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ sort: 'rating' });
        if (query.trim()) params.set('q', query.trim());
        if (selectedTheme) params.set('tag', selectedTheme);
        const response = await fetch('/api/catalog?' + params.toString(), {
          signal: controller.signal,
        });
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
  }, [query, selectedTheme]);

  function updateUrl(nextQuery: string, nextTheme: string) {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set('q', nextQuery.trim());
    if (nextTheme) params.set('tag', nextTheme);
    history.replaceState(
      null,
      '',
      params.size ? '/search?' + params.toString() : '/search',
    );
  }

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
    updateUrl(value, selectedTheme);
  }

  function changeTheme(value: string) {
    const next = value === selectedTheme ? '' : value;
    setSelectedTheme(next);
    updateUrl(query, next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    remember(query);
    updateUrl(query, selectedTheme);
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
        <section className="search-theme-filters">
          <button
            className={'search-theme-toggle' + (selectedTheme ? ' active' : '')}
            type="button"
            aria-expanded={showThemeFilters}
            onClick={() => setShowThemeFilters((open) => !open)}
          >
            <Tags size={17} aria-hidden="true" />
            <span>{selectedTheme || 'Фильтр по темам'}</span>
            <ChevronDown
              className={showThemeFilters ? 'expanded' : ''}
              size={17}
              aria-hidden="true"
            />
          </button>
          {showThemeFilters && (
            <div className="search-theme-panel">
              <div className="search-theme-panel-heading">
                <h2>Темы аниме</h2>
                {selectedTheme && (
                  <button type="button" onClick={() => changeTheme('')}>
                    Сбросить
                  </button>
                )}
              </div>
              <label className="search-theme-input">
                <Search size={16} aria-hidden="true" />
                <input
                  value={themeSearch}
                  onChange={(event) => setThemeSearch(event.target.value)}
                  placeholder="Найти тему"
                  aria-label="Найти тему"
                />
              </label>
              <div className="search-theme-options" aria-label="Выбрать тему">
                {themes
                  .filter((theme) =>
                    theme
                      .toLocaleLowerCase('ru-RU')
                      .includes(themeSearch.trim().toLocaleLowerCase('ru-RU')),
                  )
                  .map((theme) => (
                    <button
                      className={selectedTheme === theme ? 'selected' : ''}
                      type="button"
                      key={theme}
                      aria-pressed={selectedTheme === theme}
                      onClick={() => changeTheme(theme)}
                    >
                      {theme}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </section>
        {!query && !selectedTheme && recent.length > 0 && (
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
          {selectedTheme
            ? query
              ? `«${selectedTheme}» · «${query}»`
              : `Аниме с темой «${selectedTheme}»`
            : query
              ? `Результаты по запросу «${query}»`
              : 'Популярное сейчас'}
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
            <p>
              {selectedTheme
                ? 'В каталоге пока нет доступных аниме с этой темой.'
                : 'Проверь название или попробуй другой запрос.'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
