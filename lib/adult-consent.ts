export const ADULT_CONSENT_COOKIE = 'am_adult_confirmed';

export function hasAdultConsent(cookieHeader: string | null | undefined) {
  return (cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .some((part) => part === `${ADULT_CONSENT_COOKIE}=1`);
}

export function adultConsentCookie(secure: boolean) {
  return `${ADULT_CONSENT_COOKIE}=1; SameSite=Lax; Path=/; Max-Age=31536000${secure ? '; Secure' : ''}`;
}
