'use client';

import { useEffect, useState } from 'react';

export function AnimeThemes({ animeId }: { animeId: number }) {
  const [themes, setThemes] = useState<string[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/anime-tags?anime_id=' + animeId, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Не удалось загрузить темы');
        return (await response.json()) as { themes?: string[] };
      })
      .then((result) => setThemes(result.themes || []))
      .catch(() => {
        if (!controller.signal.aborted) setThemes([]);
      });
    return () => controller.abort();
  }, [animeId]);

  if (!themes?.length) return null;
  return (
    <section className="anime-themes" aria-label="Темы аниме">
      <h2>Темы</h2>
      <ul>
        {themes.map((theme) => (
          <li key={theme}>
            <a href={'/search?tag=' + encodeURIComponent(theme)}>{theme}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
