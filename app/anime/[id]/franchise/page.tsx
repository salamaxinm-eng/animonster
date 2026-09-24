import { notFound } from 'next/navigation';
import { CommunityHeader } from '@/components/community/context';
import { posterUrl } from '@/lib/anime';
import { chronologicalRelationCards } from '@/lib/relation-display';
import {
  animeRelations,
  type AnimeRelationsResult,
} from '@/lib/server/anime-relations';

export const dynamic = 'force-dynamic';

export default async function FranchisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const animeId = Number((await params).id);
  if (!Number.isInteger(animeId) || animeId < 1 || animeId > 999999999)
    notFound();
  let relations: AnimeRelationsResult;
  try {
    relations = await animeRelations(animeId);
  } catch {
    return (
      <div className="social-site franchise-page">
        <CommunityHeader />
        <main>
          <a className="muted" href={`/anime/${animeId}`}>
            ← Вернуться к тайтлу
          </a>
          <div className="playback-error" role="alert">
            Не удалось загрузить хронологию франшизы. Попробуйте позже.
          </div>
        </main>
      </div>
    );
  }
  const cards = chronologicalRelationCards(relations);
  if (!cards.length) notFound();
  const active = cards.find((card) => card.active) || cards[0];

  return (
    <div className="social-site franchise-page">
      <CommunityHeader />
      <main>
        <a className="muted" href={`/anime/${animeId}`}>
          ← Вернуться к тайтлу
        </a>
        <header className="franchise-heading">
          <span className="eyebrow">ХРОНОЛОГИЯ ФРАНШИЗЫ</span>
          <h1>{active.item.russian}</h1>
          <p>
            Все сезоны, продолжения и связанные истории — от ранних к поздним.
          </p>
        </header>
        <ol className="franchise-grid">
          {cards.map((card, index) => {
            const content = (
              <>
                <div className="franchise-poster">
                  <img src={posterUrl(card.item)} alt="" loading="lazy" />
                  <span>{index + 1}</span>
                </div>
                <div>
                  <span className="franchise-relation-label">{card.label}</span>
                  <h2>{card.item.russian || card.item.name}</h2>
                  <p>
                    {card.item.aired_on?.slice(0, 4) || 'Дата неизвестна'}
                    {card.item.kind === 'movie' ? ' · Фильм' : ' · Сериал'}
                    {card.item.episodes ? ` · ${card.item.episodes} серий` : ''}
                  </p>
                </div>
              </>
            );
            return (
              <li key={card.item.id}>
                {card.active ? (
                  <div className="franchise-card active" aria-current="page">
                    {content}
                  </div>
                ) : (
                  <a className="franchise-card" href={`/anime/${card.item.id}`}>
                    {content}
                  </a>
                )}
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}
