'use client';

import { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import Link from 'next/link';
import { posterUrl, type Anime } from '@/lib/anime';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  useCarousel,
} from '@/components/ui/carousel';

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

  const total = new Set(
    [...relations.mainline, ...relations.branches, ...relations.related].map(
      (card) => card.item.id,
    ),
  ).size;
  const allHref = `/anime/${animeId}/franchise`;
  const showAllIn =
    relations.mainline.length > 1
      ? 'mainline'
      : relations.branches.length
        ? 'branches'
        : 'related';

  return (
    <section className="season-navigation" aria-labelledby="seasons-title">
      {relations.mainline.length > 1 && (
        <RelationRow
          id="seasons-title"
          title="Сезоны и продолжения"
          items={relations.mainline}
          allHref={showAllIn === 'mainline' ? allHref : undefined}
          total={total}
        />
      )}
      {relations.branches.length > 0 && (
        <RelationRow
          title="Ветки истории"
          items={relations.branches}
          icon={<GitBranch size={17} />}
          allHref={showAllIn === 'branches' ? allHref : undefined}
          total={total}
        />
      )}
      {relations.related.length > 0 && (
        <RelationRow
          title="Связанное"
          items={relations.related}
          allHref={showAllIn === 'related' ? allHref : undefined}
          total={total}
        />
      )}
    </section>
  );
}

function RelationRow({
  id,
  title,
  items,
  icon,
  allHref,
  total,
}: {
  id?: string;
  title: string;
  items: RelationCard[];
  icon?: React.ReactNode;
  allHref?: string;
  total?: number;
}) {
  return (
    <Carousel
      className="season-relation-row"
      opts={{ align: 'start', containScroll: 'trimSnaps', loop: false }}
    >
      <div className="season-relation-heading">
        <h2 id={id}>
          {icon} {title}
        </h2>
        <div className="season-relation-actions">
          {allHref && (
            <Link className="season-show-all" href={allHref}>
              Показать все <span>{total}</span>
            </Link>
          )}
          {items.length > 1 && <RelationCarouselControls />}
        </div>
      </div>
      <RelationCarouselViewport label={`${title}: ${items.length} карточек`}>
        {items.map((card) => {
          const content = (
            <>
              <img src={posterUrl(card.item)} alt="" loading="lazy" />
              <span>{card.label}</span>
              <strong>{card.item.russian}</strong>
              <small>{card.item.aired_on?.slice(0, 4) || '—'}</small>
            </>
          );
          return (
            <CarouselItem
              className="season-relation-slide basis-auto pl-0"
              key={card.item.id}
            >
              {card.active ? (
                <div className="season-card active" aria-current="page">
                  {content}
                </div>
              ) : (
                <a
                  className={'season-card' + (card.branch ? ' branch' : '')}
                  href={`/anime/${card.item.id}`}
                >
                  {content}
                </a>
              )}
            </CarouselItem>
          );
        })}
      </RelationCarouselViewport>
    </Carousel>
  );
}

function RelationCarouselControls() {
  return (
    <div className="season-scroll-buttons" aria-label="Прокрутка списка">
      <CarouselPrevious
        className="static"
        aria-label="Показать предыдущие карточки"
      />
      <CarouselNext
        className="static"
        aria-label="Показать следующие карточки"
      />
    </div>
  );
}

function RelationCarouselViewport({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { canScrollNext } = useCarousel();
  return (
    <div
      className={
        'season-relation-scroller' + (canScrollNext ? ' has-more' : '')
      }
    >
      <CarouselContent
        className="season-relation-track ml-0"
        aria-label={label}
      >
        {children}
      </CarouselContent>
    </div>
  );
}
