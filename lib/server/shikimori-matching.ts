export type ShikimoriAnimeCandidate = {
  id: number | string;
  malId?: number | string | null;
  name?: string | null;
  russian?: string | null;
  synonyms?: Array<string | null> | null;
  kind?: string | null;
  aired_on?: string | null;
  airedOn?: { date?: string | null } | null;
  poster?: { originalUrl?: string | null } | null;
  rating?: string | null;
  genres?: Array<{
    kind?: string | null;
    russian?: string | null;
  }> | null;
};

export type KodikCatalogIdentity = {
  title: string;
  year: number;
  type: string;
};

export type AnimeTitleIdentity = {
  shikimori_id?: number;
  mal_id?: number;
  name: string;
  russian: string;
};

export function normalizeMatchTitle(value: string | null | undefined) {
  return (value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/[ё]/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function exactShikimoriMatch<T extends ShikimoriAnimeCandidate>(
  candidates: T[],
  anime: AnimeTitleIdentity,
) {
  if (anime.shikimori_id) {
    const byId = candidates.find(
      (candidate) => Number(candidate.id) === anime.shikimori_id,
    );
    if (
      byId &&
      (!anime.mal_id || !byId.malId || Number(byId.malId) === anime.mal_id)
    )
      return byId;
    return undefined;
  }

  const expectedTitles = new Set(
    [anime.russian, anime.name].map(normalizeMatchTitle).filter(Boolean),
  );
  const exactMatches = candidates.filter((candidate) => {
    if (
      anime.mal_id &&
      candidate.malId &&
      Number(candidate.malId) !== anime.mal_id
    )
      return false;
    const candidateTitles = [
      candidate.russian,
      candidate.name,
      ...(candidate.synonyms || []),
    ]
      .map(normalizeMatchTitle)
      .filter(Boolean);
    return candidateTitles.some((title) => expectedTitles.has(title));
  });
  return exactMatches.length === 1 ? exactMatches[0] : undefined;
}

export function exactKodikCatalogMatch<T extends ShikimoriAnimeCandidate>(
  candidates: T[],
  item: KodikCatalogIdentity,
) {
  const wanted = normalizeMatchTitle(item.title);
  const movie = item.type === 'anime' || item.type === 'movie';
  if (!wanted || !Number.isInteger(item.year) || item.year < 1900) return;
  const matches = candidates.filter((candidate) => {
    const candidateMovie = candidate.kind === 'movie';
    if (candidateMovie !== movie) return false;
    if (Number(String(candidate.aired_on || '').slice(0, 4)) !== item.year)
      return false;
    return [candidate.name, candidate.russian, ...(candidate.synonyms || [])]
      .map(normalizeMatchTitle)
      .some((title) => title === wanted);
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function russianThemes(candidate: ShikimoriAnimeCandidate) {
  const seen = new Set<string>();
  return (candidate.genres || [])
    .filter((item) => item.kind === 'theme' && item.russian?.trim())
    .map((item) => item.russian!.trim())
    .filter((name) => {
      const key = normalizeMatchTitle(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
