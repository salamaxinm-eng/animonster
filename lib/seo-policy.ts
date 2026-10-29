export const PRIVATE_PAGE_SEGMENTS = [
  'admin',
  'profile',
  'bookmarks',
  'downloads',
  'watch',
  'auth',
  'reset-password',
  'verify-email',
  'vpn',
  'passport',
  'referrals',
  'plus',
] as const;
export const SENSITIVE_QUERY_KEYS = [
  'token',
  'access_token',
  'secret',
  'code',
  'state',
  'password',
  'session',
  'nonce',
] as const;

// Do not send sensitive routes, query strings or fragments to analytics. The
// same check applies to referrers after returning from an authentication flow.
export function analyticsLocation(
  value: string,
  origin = 'https://animonster.su',
) {
  try {
    if (!value.trim()) return null;
    const url = new URL(value, origin);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (url.pathname.startsWith('/ref/')) return null;
    if (
      PRIVATE_PAGE_SEGMENTS.some(
        (x) =>
          url.pathname === '/' + x || url.pathname.startsWith('/' + x + '/'),
      )
    )
      return null;
    for (const key of url.searchParams.keys())
      if (
        SENSITIVE_QUERY_KEYS.includes(
          key.toLowerCase() as (typeof SENSITIVE_QUERY_KEYS)[number],
        )
      )
        return null;
    if (
      url.hash &&
      /(?:token|secret|code|state|session|nonce)[=:.]/i.test(url.hash)
    )
      return null;
    return url.pathname + url.search; // fragments are never needed for pageview reports
  } catch {
    return null;
  }
}
