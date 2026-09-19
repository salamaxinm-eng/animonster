'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

export function GlobalSearch() {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const sync = () => {
      if (location.pathname === '/search')
        setQuery(new URLSearchParams(location.search).get('q') || '');
    };
    sync();
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = query.trim();
    location.assign(
      clean ? `/search?q=${encodeURIComponent(clean)}` : '/search',
    );
  }

  return (
    <form className="global-search" role="search" onSubmit={submit}>
      <Search size={17} aria-hidden="true" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Найти аниме"
        aria-label="Поиск аниме"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery('')}
          aria-label="Очистить поиск"
        >
          <X size={15} />
        </button>
      )}
    </form>
  );
}
