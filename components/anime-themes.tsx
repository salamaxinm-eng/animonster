'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

const tagKey = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
function uniqueTags(values: string[]) {
  const seen = new Set<string>();
  return values
    .filter((value) => {
      const key = tagKey(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((value) => value.trim());
}

export function AnimeThemes({
  animeId,
  genres = [],
  children,
}: {
  animeId: number;
  genres?: string[];
  children?: ReactNode;
}) {
  const [themes, setThemes] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/anime-tags?anime_id=' + animeId, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить темы');
        return (await response.json()) as { themes?: string[] };
      })
      .then((result) => {
        if (!controller.signal.aborted)
          setThemes(uniqueTags(result.themes || []));
      })
      .catch(() => {
        if (!controller.signal.aborted) setThemes([]);
      });
    return () => controller.abort();
  }, [animeId]);

  const themeKeys = new Set(themes.map(tagKey));
  const visibleGenres = uniqueTags(genres).filter(
    (genre) => !themeKeys.has(tagKey(genre)),
  );

  return (
    <>
      {!!visibleGenres.length && (
        <nav className="genre-links" aria-label="Жанры">
          {visibleGenres.map((genre) => (
            <a
              key={tagKey(genre)}
              href={'/genres/' + encodeURIComponent(genre)}
            >
              {genre}
            </a>
          ))}
        </nav>
      )}
      {children}
      {!!themes.length && (
        <details className="anime-details">
          <summary>
            Подробная информация
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <section className="anime-themes" aria-label="Темы аниме">
            <h2>Темы</h2>
            <ul>
              {themes.map((theme) => (
                <li key={tagKey(theme)}>
                  <a href={'/search?tag=' + encodeURIComponent(theme)}>
                    {theme}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </details>
      )}
    </>
  );
}
