'use client';

import { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { posterUrl, type Anime } from '@/lib/anime';

type RelationCard = {
  item: Anime;
  label: string;
  active?: boolean;
  branch?: boolean;
};
type RelationResponse = {
  mainline: RelationCard[];
  branches: RelationCard[];
  related: RelationCard[];
};
const EMPTY: RelationResponse = { mainline: [], branches: [], related: [] };

export function SeasonNavigation({ animeId }: { animeId: number }) {
  const [relations, setRelations] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/anime-relations?anime_id=${animeId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return (await response.json()) as RelationResponse;
      })
      .then(setRelations)
      .catch(() => setRelations(EMPTY))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [animeId]);

  if (loading)
    return (
      <section className="season-navigation loading" aria-label="Сезоны">
        <p role="status">Ищем сезоны и продолжения…</p>
      </section>
    );
  if (
    relations.mainline.length < 2 &&
    !relations.branches.length &&
    !relations.related.length
  )
    return null;

  return (
    <section className="season-navigation" aria-labelledby="seasons-title">
      {relations.mainline.length > 1 && (
        <RelationRow
          id="seasons-title"
          title="Сезоны и продолжения"
          items={relations.mainline}
        />
      )}
      {relations.branches.length > 0 && (
        <RelationRow
          title="Ветки истории"
          items={relations.branches}
          icon={<GitBranch size={17} />}
        />
      )}
      {relations.related.length > 0 && (
        <RelationRow title="Связанное" items={relations.related} />
      )}
    </section>
  );
}

function RelationRow({
  id,
  title,
  items,
  icon,
}: {
  id?: string;
  title: string;
  items: RelationCard[];
  icon?: React.ReactNode;
}) {
  return (
    <div className="season-relation-row">
      <h2 id={id}>
        {icon} {title}
      </h2>
      <div>
        {items.map((card) => {
          const content = (
            <>
              <img src={posterUrl(card.item)} alt="" loading="lazy" />
              <span>{card.label}</span>
              <strong>{card.item.russian}</strong>
              <small>{card.item.aired_on?.slice(0, 4) || '—'}</small>
            </>
          );
          return card.active ? (
            <div
              className="season-card active"
              aria-current="page"
              key={card.item.id}
            >
              {content}
            </div>
          ) : (
            <a
              className={'season-card' + (card.branch ? ' branch' : '')}
              href={`/anime/${card.item.id}`}
              key={card.item.id}
            >
              {content}
            </a>
          );
        })}
      </div>
    </div>
  );
}
