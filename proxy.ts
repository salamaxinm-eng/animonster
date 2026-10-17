import { NextResponse, type NextRequest } from 'next/server';
import { titleBlocked } from '@/lib/server/title-restrictions';
import { titleBlockedPage } from '@/lib/server/title-blocked-page';

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/title-blocked') return titleBlockedPage();
  const match = /^\/anime\/(\d{1,9})(?:-[a-z0-9-]+)?\/?$/.exec(
    request.nextUrl.pathname,
  );
  if (!match) return NextResponse.next();
  const response = (await titleBlocked(request.headers, Number(match[1])))
    ? titleBlockedPage()
    : NextResponse.next();
  // Neither the permitted page nor the denial may be shared between countries.
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/anime/:path*', '/title-blocked'] };
