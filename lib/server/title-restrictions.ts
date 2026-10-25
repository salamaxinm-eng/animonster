import { isIP } from 'node:net';
import geoip from 'geoip-country';
import { db } from './core';

export const TITLE_BLOCKED_MESSAGE = 'Тайтл заблокирован';

type TitleIdentity =
  | number
  | { id: number; shikimori_id?: number; mal_id?: number };
type RequestHeaders = Pick<Headers, 'get'>;

// Copyright complaint: disabled globally, independent of GeoIP or admin edits.
const unavailableTitles = new Set([55825, 46569, 60460]);
export function permanentlyRestrictedTitle(title: TitleIdentity) {
  const ids = typeof title === 'number' ? [title] : [title.id, title.shikimori_id, title.mal_id];
  return ids.some((id) => typeof id === 'number' && unavailableTitles.has(id));
}

export async function restrictedTitle(title: TitleIdentity) {
  const ids =
    typeof title === 'number'
      ? [title]
      : [title.id, title.shikimori_id, title.mal_id];
  const valid = [
    ...new Set(
      ids.filter(
        (id): id is number =>
          Number.isInteger(id) && Number(id) > 0 && Number(id) <= 999999999,
      ),
    ),
  ];
  if (!valid.length) return false;
  // Read the authoritative list on every request: admin edits apply immediately
  // to every process, including the separately invoked Next.js proxy.
  return Boolean(
    await db()
      .prepare(`SELECT anime_id FROM title_region_restrictions
    WHERE anime_id IN (${valid.map(() => '?').join(',')}) LIMIT 1`)
      .bind(...valid)
      .first(),
  );
}

export function visitorCountry(headers: RequestHeaders): string | null {
  // The public Caddy MUST overwrite this header with its TCP peer's address.
  // Never trust country headers, cookies, query parameters or a client-supplied XFF.
  const address = (headers.get('x-animonster-client-ip') || '').trim();
  const ip = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (!isIP(ip)) return null;
  return geoip.lookup(ip)?.country || null;
}

export async function titleBlocked(
  headers: RequestHeaders,
  title: TitleIdentity,
) {
  if (permanentlyRestrictedTitle(title)) return true;
  const country = visitorCountry(headers);
  // An unrecognised address must not accidentally expose the disputed title.
  return (
    (country === null || country === 'RU') && (await restrictedTitle(title))
  );
}

export async function titleRestrictionResponse(
  headers: RequestHeaders,
  title: TitleIdentity,
) {
  if (!(await titleBlocked(headers, title))) return null;
  if (permanentlyRestrictedTitle(title)) {
    return Response.json(
      { error: 'Доступ к материалу закрыт по требованию правообладателя', code: 'title_unavailable' },
      { status: 451, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
  return Response.json(
    {
      error: TITLE_BLOCKED_MESSAGE,
      code: 'title_region_restricted',
      redirect: '/vpn',
    },
    { status: 451, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
