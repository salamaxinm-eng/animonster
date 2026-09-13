import { ApiError, fail } from '@/lib/server/core';
import {
  assertManifestSize,
  mediaProxyEnabled,
  readMediaTokenDetails,
  rewriteManifest,
  validateMediaUrl,
} from '@/lib/server/media';
import { premium, viewer } from '@/lib/server/core';

export const dynamic = 'force-dynamic';

async function upstream(start: URL, request: Request) {
  let url = start;
  for (let redirect = 0; redirect < 4; redirect++) {
    const headers = new Headers({
      Accept: request.headers.get('accept') || '*/*',
      'Accept-Encoding': 'identity',
      Referer: 'https://aniliberty.top/',
      'User-Agent': 'AniMonster-Media-Gateway/1.0',
    });
    for (const name of ['range', 'if-none-match', 'if-modified-since']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await fetch(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(45_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status))
      return { response, url };
    const location = response.headers.get('location');
    if (!location)
      throw new ApiError('Источник вернул неверный редирект.', 502);
    url = validateMediaUrl(new URL(location, url).href);
  }
  throw new ApiError('Слишком много перенаправлений источника.', 502);
}

export async function GET(request: Request) {
  try {
    if (!mediaProxyEnabled())
      throw new ApiError('Медиашлюз отключён.', 404, 'media_proxy_disabled');
    const token = new URL(request.url).searchParams.get('token') || '';
    const details = await readMediaTokenDetails(token),
      source = details.url;
    if (details.access?.freeAt && details.access.freeAt > Date.now()) {
      const user = await viewer(request);
      if (
        !user ||
        user.id !== details.access.userId ||
        !(await premium(user.id))
      )
        throw new ApiError(
          'Серия пока доступна только с AniMonster Plus.',
          403,
          'plus_early_access',
        );
    }
    const { response, url } = await upstream(source, request);
    if (!response.ok && response.status !== 304) {
      await response.body?.cancel();
      throw new ApiError(
        'Источник видео временно недоступен.',
        502,
        'media_upstream_error',
      );
    }
    const contentType = response.headers.get('content-type') || '';
    const manifest =
      contentType.toLowerCase().includes('mpegurl') ||
      url.pathname.toLowerCase().endsWith('.m3u8');
    if (manifest) {
      assertManifestSize(Number(response.headers.get('content-length') || 0));
      const bytes = new Uint8Array(await response.arrayBuffer());
      assertManifestSize(bytes.byteLength);
      const body = await rewriteManifest(
        new TextDecoder().decode(bytes),
        url,
        details.access,
      );
      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Cache-Control': details.access
            ? 'private, no-store'
            : 'private, max-age=10',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    const headers = new Headers({
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': details.access
        ? 'private, no-store'
        : 'public, max-age=86400, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    for (const name of [
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified',
    ]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    return fail(error);
  }
}
