'use client';
import { useEffect, useState } from 'react';
import { CommunityHeader, useCommunity } from '@/components/community/context';
import { AnimeGrid } from '@/components/anime-grid';
import type { Anime } from '@/lib/anime';
import { Button } from '@/components/ui/button';
export default function Page() {
  const { user } = useCommunity(),
    [sections, setSections] = useState<
      { title: string; note?: string; items: Anime[] }[]
    >([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const refresh=()=>setAttempt(x=>x+1);
    window.addEventListener('animonster-library-changed',refresh);
    return()=>window.removeEventListener('animonster-library-changed',refresh);
  },[]);
  useEffect(() => {
    const a = new AbortController();
    setLoading(true);
    fetch('/api/recommendations', { signal: a.signal })
      .then(async (r) => {
        const x = (await r.json()) as any;
        if (!r.ok) throw Error(x.error);
        setSections(x.sections);
        setError('');
      })
      .catch((e) => {
        if (!a.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!a.signal.aborted) setLoading(false);
      });
    return () => a.abort();
  }, [user?.id, attempt]);
  return (
    <div className="social-site">
      <CommunityHeader />
      <main className="title-page">
        <span className="eyebrow">ТВОЯ СЛЕДУЮЩАЯ ИСТОРИЯ</span>
        <h1>Рекомендации</h1>
        {loading ? (
          <p role="status">Подбираем аниме…</p>
        ) : error ? (
          <div role="alert">
            <p>{error}</p>
            <Button onClick={() => setAttempt((x) => x + 1)}>Повторить</Button>
          </div>
        ) : (
          sections.map((s, index) => (
            <section className="recommend-section" key={s.title}>
              <div className="recommend-heading">
                <h2>{s.title}</h2>
                <a href={`/browse/recommended?section=${index}`}>Смотреть все</a>
              </div>
              {s.note && <p className="muted">{s.note}</p>}
              {s.items.length ? (
                <AnimeGrid items={s.items} horizontal />
              ) : (
                <p className="muted">Пока нет новых подходящих тайтлов.</p>
              )}
            </section>
          ))
        )}
      </main>
    </div>
  );
}
