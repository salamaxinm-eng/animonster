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

  return (
    <section className="season-navigation" aria-labelledby="franchise-title">
      <div className="season-navigation-heading">
        <h2 id="franchise-title">Франшиза</h2>
        {total >= 3 && (
          <Link
            className="season-show-all"
            href={`/anime/${animeId}/franchise`}
          >
            Хронология франшизы <span>{total}</span>
          </Link>
        )}
      </div>
      {relations.mainline.length > 1 && (
        <RelationRow
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
        <RelationRow
          title="Связанное"
          items={relations.related}
        />
      )}
    </section>
  );
}

function RelationRow({
  title,
  items,
  icon,
}: {
  title: string;
  items: RelationCard[];
  icon?: React.ReactNode;
}) {
  return (
    <Carousel
      className="season-relation-row"
      opts={{
        align: 'start',
        containScroll: 'trimSnaps',
        dragFree: true,
        loop: false,
      }}
    >
      <div className="season-relation-heading">
        <h3>
          {icon} {title}
        </h3>
        <div className="season-relation-actions">
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
  const { api, canScrollNext } = useCarousel();

  useEffect(() => {
    if (!api) return;

    const reduceEdgeMomentum = () => {
      const { limit, location, scrollBody, target } = api.internalEngine();
      const constrainedTarget = limit.constrain(target.get());
      const releasedOutsideBounds = constrainedTarget !== target.get();
      const positionOutsideBounds = limit.reachedAny(location.get());

      if (!releasedOutsideBounds && !positionOutsideBounds) return;

      target.set(constrainedTarget);
      scrollBody.useDuration(14).useFriction(0.35);
    };

    api.on('pointerUp', reduceEdgeMomentum);
    return () => {
      api.off('pointerUp', reduceEdgeMomentum);
    };
  }, [api]);

  return (
    <div
      className={
        'season-relation-scroller' + (canScrollNext ? ' has-more' : '')
      }
    >
      <CarouselContent
        className="season-relation-track"
        aria-label={label}
      >
        {children}
      </CarouselContent>
    </div>
  );
}
