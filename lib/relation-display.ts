import type {
  AnimeRelationsResult,
  RelationCard,
} from './server/anime-relations';

const year = (card: RelationCard) => {
  const value = Number(card.item.aired_on?.slice(0, 4));
  return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
};

export function chronologicalRelationCards(relations: AnimeRelationsResult) {
  const unique = new Map<number, RelationCard>();
  for (const card of [
    ...relations.mainline,
    ...relations.branches,
    ...relations.related,
  ]) {
    const current = unique.get(card.item.id);
    if (!current) unique.set(card.item.id, card);
    else if (card.active)
      unique.set(card.item.id, { ...current, active: true });
  }
  return [...unique.values()].sort(
    (left, right) =>
      year(left) - year(right) ||
      String(left.item.aired_on || '').localeCompare(
        String(right.item.aired_on || ''),
      ) ||
      left.item.id - right.item.id,
  );
}
