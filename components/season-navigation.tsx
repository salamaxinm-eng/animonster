'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, GitBranch } from 'lucide-react';
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
  const track = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const update = () =>
      setCanScrollRight(
        element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [items.length]);
  const moveNext = () => {
    const element = track.current;
    if (!element) return;
    element.scrollTo({
      left: element.scrollLeft + Math.max(220, element.clientWidth * 0.72),
      behavior: 'smooth',
    });
  };
  return (
    <div className="season-relation-row">
      <div className="season-relation-heading">
        <h2 id={id}>
          {icon} {title}
        </h2>
      </div>
      <div className="season-relation-scroller">
        <div
          ref={track}
          className="season-relation-track"
          onWheel={(event) => {
            const element = event.currentTarget;
            if (element.scrollWidth <= element.clientWidth) return;
            event.preventDefault();
            element.scrollLeft += event.deltaY || event.deltaX;
          }}
        >
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
        {items.length > 1 && (
          <button
            className="season-edge-button next"
            type="button"
            disabled={!canScrollRight}
            onClick={moveNext}
            aria-label="Показать следующие карточки"
          >
            <ChevronRight />
          </button>
        )}
      </div>
    </div>
  );
}
