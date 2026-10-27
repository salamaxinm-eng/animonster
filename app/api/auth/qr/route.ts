import QRCode from 'qrcode';
import {
  ApiError,
  base,
  body,
  cookie,
  fail,
  json,
  requireUser,
  sameOrigin,
  viewer,
} from '@/lib/server/core';
import { qrCookieName, validQrId } from '@/lib/qr-login';
import {
  consumeQrLogin,
  createQrLogin,
  decideQrLogin,
  inspectQrLogin,
  pollQrLogin,
  qrLimit,
} from '@/lib/server/qr-login';
export const dynamic = 'force-dynamic';
function qrCookie(id: string, token: string, age: number) {
  const secure = new URL(base()).protocol === 'https:' ? '; Secure' : '';
  return `${qrCookieName(id)}=${token}; HttpOnly; SameSite=Strict; Path=/api/auth/qr; Max-Age=${age}${secure}`;
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = await body(request);
    if (!input || typeof input !== 'object')
      throw new ApiError('Некорректный запрос');
    const ip =
      request.headers.get('x-animonster-client-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'local';
    await qrLimit(ip, input.action === 'create');
    if (input.action === 'create') {
      if (await viewer(request))
        throw new ApiError(
          'Вы уже вошли в аккаунт.',
          409,
          'already_authenticated',
        );
      const flow = await createQrLogin(
        request.headers.get('user-agent') || '',
        ip,
      );
      const url = new URL('/auth/qr', base());
      url.hash = flow.id + '.' + flow.scanToken;
      const image = await QRCode.toDataURL(url.href, {
        width: 280,
        margin: 4,
        errorCorrectionLevel: 'M',
        color: { dark: '#110d1b', light: '#ffffff' },
      });
      const response = json({
        id: flow.id,
        expiresAt: flow.expiresAt,
        code: flow.code,
        device: flow.device,
        image,
      });
      response.headers.append(
        'Set-Cookie',
        qrCookie(flow.id, flow.browserToken, 150),
      );
      return response;
    }
    if (input.action === 'inspect')
      return json(await inspectQrLogin(input.id, input.token));
    if (input.action === 'approve' || input.action === 'deny') {
      let userId: string | null = null;
      if (input.action === 'approve') {
        const user = await requireUser(request);
        if (user.id !== input.userId)
          throw new ApiError(
            'Аккаунт изменился. Обновите страницу.',
            409,
            'account_changed',
          );
        userId = user.id;
      }
      return json(
        await decideQrLogin(
          input.id,
          input.token,
          userId,
          cookie(request, 'am_session'),
          input.action === 'approve',
        ),
      );
    }
    if (!validQrId(input.id))
      throw new ApiError('Некорректный QR-код', 400, 'qr_invalid');
    const browser = cookie(request, qrCookieName(input.id));
    if (input.action === 'poll' || input.action === 'cancel') {
      const result = await pollQrLogin(
        input.id,
        browser,
        input.action === 'cancel',
      );
      const response = json(result);
      if (input.action === 'cancel')
        response.headers.append('Set-Cookie', qrCookie(input.id, '', 0));
      return response;
    }
    if (input.action === 'consume') {
      if (await viewer(request))
        throw new ApiError(
          'Вы уже вошли в аккаунт.',
          409,
          'already_authenticated',
        );
      const token = await consumeQrLogin(input.id, browser);
      const response = json({ ok: true });
      response.headers.append(
        'Set-Cookie',
        `am_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${new URL(base()).protocol === 'https:' ? '; Secure' : ''}`,
      );
      response.headers.append('Set-Cookie', qrCookie(input.id, '', 0));
      return response;
    }
    throw new ApiError('Неизвестное действие');
  } catch (error) {
    return fail(error);
  }
}
