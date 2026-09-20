'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Filter, Search, X } from 'lucide-react';
import { AnimeGrid } from '@/components/anime-grid';
import { posterUrl, type Anime } from '@/lib/anime';

const STORAGE_KEY = 'animonster-recent-searches';
type Filters = {
  genres: string[];
  themes: string[];
  kind: '' | 'tv' | 'movie';
  status: '' | 'ongoing' | 'released';
};
type Facets = {
  genres: string[];
  themes: string[];
  kinds: { value: 'tv' | 'movie'; label: string }[];
  statuses: { value: 'ongoing' | 'released'; label: string }[];
};
type FranchiseGroup = {
  type: 'franchise';
  id: string;
  title: string;
  items: { item: Anime; label: string; branch?: boolean }[];
};
const EMPTY_FILTERS: Filters = { genres: [], themes: [], kind: '', status: '' };
const DEFAULT_FACETS: Facets = {
  genres: [
    'Экшен', 'Приключения', 'Комедия', 'Драма', 'Фэнтези', 'Романтика',
    'Фантастика', 'Триллер', 'Ужасы', 'Детектив', 'Повседневность', 'Спорт',
  ],
  themes: [
    'Школа', 'Магия', 'Военное', 'Исторический', 'Психологическое',
    'Путешествие во времени', 'Исекай', 'Музыка', 'Мифология', 'Самураи',
    'Суперспособности', 'Выживание',
  ],
  kinds: [
    { value: 'tv', label: 'Сериал' },
    { value: 'movie', label: 'Фильм' },
  ],
  statuses: [
    { value: 'ongoing', label: 'Онгоинг' },
    { value: 'released', label: 'Завершён' },
  ],
};

function filtersFromUrl(params: URLSearchParams): Filters {
  const kind = params.get('kind');
  const status = params.get('status');
  return {
    genres: [...new Set(params.getAll('genre').filter(Boolean))],
    themes: [
      ...new Set(
        [
          ...params.getAll('theme'),
          ...(params.get('tag') ? [params.get('tag')!] : []),
        ].filter(Boolean),
      ),
    ],
    kind: kind === 'tv' || kind === 'movie' ? kind : '',
    status: status === 'ongoing' || status === 'released' ? status : '',
  };
}

export default function SearchPage() {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [facets, setFacets] = useState<Facets>(DEFAULT_FACETS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [items, setItems] = useState<Anime[]>([]);
  const [groups, setGroups] = useState<FranchiseGroup[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(location.search);
      const nextFilters = filtersFromUrl(params);
      setQuery(params.get('q') || '');
      setFilters(nextFilters);
      setPage(Math.max(1, Number(params.get('page')) || 1));
      setFiltersOpen(
        !!(
          nextFilters.genres.length ||
          nextFilters.themes.length ||
          nextFilters.kind ||
          nextFilters.status
        ),
      );
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
    fetch('/api/search/facets', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as Facets;
      })
      .then((result) =>
        setFacets({
          genres: result.genres?.length ? result.genres : DEFAULT_FACETS.genres,
          themes: result.themes?.length ? result.themes : DEFAULT_FACETS.themes,
          kinds: result.kinds?.length ? result.kinds : DEFAULT_FACETS.kinds,
          statuses: result.statuses?.length
            ? result.statuses
            : DEFAULT_FACETS.statuses,
        }),
      )
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = buildParams(query, filters, page);
        const response = await fetch('/api/search?' + params.toString(), {
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw Error(result.error || 'Не удалось выполнить поиск');
        setItems(
          (result.results || [])
            .filter((entry: { type: string }) => entry.type === 'anime')
            .map((entry: { item: Anime }) => entry.item),
        );
        setGroups(
          (result.results || []).filter(
            (entry: { type: string }) => entry.type === 'franchise',
          ),
        );
        setPages(result.pagination?.pages || 1);
        setTotal(result.pagination?.total || 0);
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
  }, [query, filters, page]);

  function writeUrl(nextQuery: string, nextFilters: Filters, nextPage = 1) {
    const params = buildParams(nextQuery, nextFilters, nextPage);
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
    setPage(1);
    writeUrl(value, filters);
  }

  function changeFilters(next: Filters) {
    setFilters(next);
    setPage(1);
    writeUrl(query, next);
  }

  function toggleList(key: 'genres' | 'themes', value: string) {
    const current = filters[key];
    changeFilters({
      ...filters,
      [key]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    remember(query);
    writeUrl(query, filters, page);
  }

  const activeCount =
    filters.genres.length +
    filters.themes.length +
    Number(!!filters.kind) +
    Number(!!filters.status);
  const hasSearch = !!query.trim() || activeCount > 0;

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
        <div className="search-filter-toolbar">
          <button
            className={'search-filter-toggle' + (activeCount ? ' active' : '')}
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Filter size={17} /> Фильтры
            {activeCount > 0 && <span>{activeCount}</span>}
            <ChevronDown className={filtersOpen ? 'expanded' : ''} size={16} />
          </button>
          {activeCount > 0 && (
            <button
              type="button"
              className="search-filter-reset"
              onClick={() => changeFilters(EMPTY_FILTERS)}
            >
              Сбросить всё
            </button>
          )}
        </div>

        {filtersOpen && (
          <section className="search-filter-panel" aria-label="Фильтры поиска">
            <header>
              <div>
                <strong>Фильтры</strong>
                <span>Жанры и темы сочетаются по принципу «все выбранные»</span>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label="Закрыть фильтры"
              >
                <X />
              </button>
            </header>
            <FilterOptions
              title="Жанры"
              values={facets.genres}
              selected={filters.genres}
              onToggle={(value) => toggleList('genres', value)}
            />
            <FilterOptions
              title="Темы"
              values={facets.themes}
              selected={filters.themes}
              onToggle={(value) => toggleList('themes', value)}
            />
            <SingleOptions
              title="Тип"
              values={facets.kinds}
              selected={filters.kind}
              onChange={(kind) =>
                changeFilters({ ...filters, kind: kind as Filters['kind'] })
              }
            />
            <SingleOptions
              title="Статус"
              values={facets.statuses}
              selected={filters.status}
              onChange={(status) =>
                changeFilters({
                  ...filters,
                  status: status as Filters['status'],
                })
              }
            />
          </section>
        )}

        {activeCount > 0 && (
          <div className="search-filter-chips" aria-label="Выбранные фильтры">
            {filters.genres.map((value) => (
              <FilterChip
                key={'genre-' + value}
                label={value}
                onRemove={() => toggleList('genres', value)}
              />
            ))}
            {filters.themes.map((value) => (
              <FilterChip
                key={'theme-' + value}
                label={value}
                onRemove={() => toggleList('themes', value)}
              />
            ))}
            {filters.kind && (
              <FilterChip
                label={
                  facets.kinds.find((item) => item.value === filters.kind)
                    ?.label || filters.kind
                }
                onRemove={() => changeFilters({ ...filters, kind: '' })}
              />
            )}
            {filters.status && (
              <FilterChip
                label={
                  facets.statuses.find((item) => item.value === filters.status)
                    ?.label || filters.status
                }
                onRemove={() => changeFilters({ ...filters, status: '' })}
              />
            )}
          </div>
        )}

        {!hasSearch && recent.length > 0 && (
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
        <div className="search-results-heading">
          <h2>
            {query
              ? `Результаты по запросу «${query}»`
              : activeCount
                ? 'Результаты по фильтрам'
                : 'Популярное сейчас'}
          </h2>
          {!loading && !error && (
            <span>{total.toLocaleString('ru-RU')} тайтлов</span>
          )}
        </div>
        {loading ? (
          <p role="status">Ищем аниме…</p>
        ) : error ? (
          <p className="error-msg" role="alert">
            {error}
          </p>
        ) : items.length || groups.length ? (
          <>
            {groups.map((group) => (
              <FranchiseSearchBlock key={group.id} group={group} />
            ))}
            {items.length > 0 && <AnimeGrid items={items} />}
            {pages > 1 && (
              <nav className="catalog-pagination" aria-label="Страницы поиска">
                <button
                  className="primary"
                  disabled={page <= 1}
                  onClick={() => {
                    const next = page - 1;
                    setPage(next);
                    writeUrl(query, filters, next);
                  }}
                >
                  Назад
                </button>
                <span>
                  Страница {page} из {pages}
                </span>
                <button
                  className="primary"
                  disabled={page >= pages}
                  onClick={() => {
                    const next = page + 1;
                    setPage(next);
                    writeUrl(query, filters, next);
                  }}
                >
                  Далее
                </button>
              </nav>
            )}
          </>
        ) : (
          <div className="mobile-empty">
            <Search />
            <h3>Ничего не найдено</h3>
            <p>Измени запрос или убери часть фильтров.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function buildParams(query: string, filters: Filters, page: number) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  filters.genres.forEach((value) => params.append('genre', value));
  filters.themes.forEach((value) => params.append('theme', value));
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.status) params.set('status', filters.status);
  if (page > 1) params.set('page', String(page));
  return params;
}

function FilterOptions({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="search-filter-group">
      <strong>{title}</strong>
      <span className="search-filter-hint">Можно выбрать несколько</span>
      <div className="search-filter-options" role="group" aria-label={title}>
        {values.map((value) => (
          <button
            key={value}
            type="button"
            className={selected.includes(value) ? 'selected' : ''}
            aria-pressed={selected.includes(value)}
            onClick={() => onToggle(value)}
          >
            {selected.includes(value) && <Check size={14} />} {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function SingleOptions({
  title,
  values,
  selected,
  onChange,
}: {
  title: string;
  values: { value: string; label: string }[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="search-filter-group compact">
      <strong>{title}</strong>
      <div className="search-filter-options">
        {values.map((item) => (
          <button
            key={item.value}
            type="button"
            className={selected === item.value ? 'selected' : ''}
            aria-pressed={selected === item.value}
            onClick={() => onChange(selected === item.value ? '' : item.value)}
          >
            {selected === item.value && <Check size={14} />} {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button type="button" onClick={onRemove} title={`Убрать: ${label}`}>
      {label} <X size={13} />
    </button>
  );
}

function FranchiseSearchBlock({ group }: { group: FranchiseGroup }) {
  return (
    <section className="search-franchise-block">
      <header>
        <span>Франшиза</span>
        <h3>{group.title}</h3>
      </header>
      <div>
        {group.items.map(({ item, label, branch }) => (
          <a
            className={branch ? 'branch' : ''}
            href={'/anime/' + item.id}
            key={item.id}
          >
            <img src={posterUrl(item)} alt="" />
            <span>{label}</span>
            <strong>{item.russian}</strong>
            <small>{item.aired_on?.slice(0, 4) || '—'}</small>
          </a>
        ))}
      </div>
    </section>
  );
}
