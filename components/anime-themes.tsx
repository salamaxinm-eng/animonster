'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { tagKey, uniqueTags, partitionTags } from '@/lib/anime-taxonomy';

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
  const [classifiedGenres, setClassifiedGenres] = useState<string[] | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/anime-tags?v=2&anime_id=' + animeId, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить темы');
        return (await response.json()) as {
          themes?: string[];
          genres?: string[];
        };
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setThemes(uniqueTags(result.themes || []));
          setClassifiedGenres(result.genres ? uniqueTags(result.genres) : null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setThemes([]);
      });
    return () => controller.abort();
  }, [animeId]);

  const visibleGenres =
    classifiedGenres ?? partitionTags(genres, themes).genres;

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
                  <a href={'/search?theme=' + encodeURIComponent(theme)}>
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
