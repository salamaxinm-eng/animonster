export const PLAYER_CATALOG_ROUND_CENTS = 150000;
export const PLAYER_CATALOG_TITLES_PER_ROUND = 200;
export function playerCatalogProgress(totalCents: number) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0)
    throw new Error('Invalid donation total');
  const completedRounds = Math.floor(totalCents / PLAYER_CATALOG_ROUND_CENTS);
  const currentCents = totalCents % PLAYER_CATALOG_ROUND_CENTS;
  return {
    totalCents,
    currentCents,
    targetCents: PLAYER_CATALOG_ROUND_CENTS,
    completedRounds,
    fundedTitles: completedRounds * PLAYER_CATALOG_TITLES_PER_ROUND,
    titlesPerRound: PLAYER_CATALOG_TITLES_PER_ROUND,
    percent: (currentCents / PLAYER_CATALOG_ROUND_CENTS) * 100,
  };
}
export type PlayerCatalogFunding = ReturnType<typeof playerCatalogProgress> & {
  startsAt: number;
  acceptingDonations: boolean;
};
