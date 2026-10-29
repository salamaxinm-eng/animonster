'use client';
import { FeedbackMessage } from '@/components/feedback-message';
import { useEffect, useState } from 'react';
import { posterUrl, type Anime } from '@/lib/anime';
import { horrorCandidates } from '@/lib/halloween';
export function HalloweenHorrorPrize() {
  const [anime, setAnime] = useState<Anime | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [closed, setClosed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setAnime(null);
    void fetch('/api/catalog?genre=' + encodeURIComponent('Ужасы'), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const items = horrorCandidates((await response.json()) as Anime[]);
        if (!items.length) throw Error();
        setAnime(items[Math.floor(Math.random() * items.length)]);
      })
      .catch((error) => {
        if (error.name !== 'AbortError')
          setError('Хоррор пока не нашёлся. Попробуем ещё раз?');
      });
    return () => controller.abort();
  }, [retry]);
  if (closed) return null;
  return (
    <div className="hw-horror-prize" role="region" aria-label="Хоррор от тыквы">
      <strong>Ты прошёл все 20 реплик. Твой хоррор:</strong>
      {anime ? (
        <a href={'/anime/' + anime.id} data-hw-watch>
          {<img src={posterUrl(anime, 240)} alt="" />}
          <span>{anime.russian}</span>
          <b>Смотреть ↗</b>
        </a>
      ) : error ? (
        <p role="alert"><FeedbackMessage>{error}</FeedbackMessage></p>
      ) : (
        <p role="status">Тыква выбирает аниме…</p>
      )}
      {error && (
        <button type="button" onClick={() => setRetry((value) => value + 1)}>
          Повторить
        </button>
      )}
      <button type="button" onClick={() => setClosed(true)}>
        Закрыть
      </button>
    </div>
  );
}
