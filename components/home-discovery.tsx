'use client';

import { useEffect, useState } from 'react';
import { Clock3, Flame, Grid2X2, LayoutGrid, Sparkles } from 'lucide-react';
import type { Anime } from '@/lib/anime';
import { AnimeGrid } from './anime-grid';
import { useCommunity } from './community/context';

type Section = { title: string; note?: string; items: Anime[] };
type DiscoveryTab = 'recommended' | 'new' | 'popular';

const tabs: { id: DiscoveryTab; label: string; icon: typeof Sparkles }[] = [
  { id: 'recommended', label: 'Для вас', icon: Sparkles },
  { id: 'new', label: 'Новые эпизоды', icon: Clock3 },
  { id: 'popular', label: 'Популярное', icon: Flame },
];

export function HomeDiscovery() {
  const community = useCommunity();
  const [active, setActive] = useState<DiscoveryTab>('recommended');
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const url =
      active === 'recommended'
        ? '/api/recommendations'
        : '/api/catalog?sort=' + (active === 'new' ? 'fresh' : 'rating');
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error('Не удалось загрузить подборку');
        const result: any = await response.json();
        if (active === 'recommended') return result.sections || [];
        return [
          {
            title: active === 'new' ? 'Свежие эпизоды' : 'Популярное сейчас',
            note:
              active === 'new'
                ? 'Недавно обновлённые тайтлы.'
                : 'Аниме с высоким рейтингом зрителей.',
            items: result,
          },
        ];
      })
      .then(setSections)
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, community.user?.id]);

  return (
    <section className="home-discovery" aria-label="Подборки AniMonster">
      <nav className="home-section-tabs" aria-label="Разделы главной">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={active === tab.id ? 'active' : ''}
              aria-pressed={active === tab.id}
              onClick={() => setActive(tab.id)}
            >
              <Icon size={17} />
              {tab.label}
            </button>
          );
        })}
        <a href="/genres">
          <Grid2X2 size={17} /> Жанры
        </a>
        <a href="#catalog">
          <LayoutGrid size={17} /> Весь каталог
        </a>
      </nav>

      {loading ? (
        <div className="home-discovery-loading" role="status">
          Собираем подборку…
        </div>
      ) : error ? (
        <p className="home-discovery-error" role="alert">
          {error}
        </p>
      ) : (
        sections.map((section, index) => (
          <div className="home-rail" key={section.title}>
            <div className="home-rail-heading">
              <div>
                <h2>{section.title}</h2>
                {section.note && <p>{section.note}</p>}
              </div>
              <a href={`/browse/${active}?section=${index}`}>
                Смотреть все
              </a>
            </div>
            <AnimeGrid items={section.items.slice(0, 16)} horizontal />
          </div>
        ))
      )}
    </section>
  );
}
