import { ApiError, fail, viewer } from '@/lib/server/core';
import { getPassport, passportAccess } from '@/lib/server/passport';
import { renderPassportImage } from '@/lib/server/passport-image';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const id = params.get('id') || (await viewer(request))?.id;
    if (!id) throw new ApiError('Паспорт не найден', 404);
    const access = await passportAccess(request, id);
    if (!access) throw new ApiError('Паспорт не найден', 404);
    const passport = await getPassport(access.user, access.settings, access.own);
    return renderPassportImage(passport, params.get('format') === 'wide' ? 'wide' : 'portrait', params.get('download') === '1');
  } catch (error) { return fail(error); }
}
