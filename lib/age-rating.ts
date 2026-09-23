export type CanonicalAgeRating = {
  label: string;
  isAdult: boolean;
};

export function shikimoriAgeRating(
  value: string | null | undefined,
): CanonicalAgeRating | null {
  switch (
    String(value || '')
      .trim()
      .toLocaleLowerCase('en-US')
  ) {
    case 'g':
      return { label: '0+', isAdult: false };
    case 'pg':
      return { label: '6+', isAdult: false };
    case 'pg_13':
      return { label: '13+', isAdult: false };
    case 'r':
      return { label: '17+', isAdult: false };
    case 'r_plus':
    case 'rx':
      return { label: '18+', isAdult: true };
    default:
      return null;
  }
}
