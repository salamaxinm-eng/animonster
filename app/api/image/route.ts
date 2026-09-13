import { ApiError, fail } from '@/lib/server/core';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;
const MEMORY_TTL = 7 * 86400_000;
type CachedImage = {
  bytes: Uint8Array;
  contentType: string;
  cachedAt: number;
};
type ImageCacheState = {
  images: Map<string, CachedImage>;
  bytes: number;
};
const globalCache = globalThis as typeof globalThis & {
  __animonsterImageCache?: ImageCacheState;
};
const cacheState = (globalCache.__animonsterImageCache ??= {
  images: new Map(),
  bytes: 0,
});
const imageCache = cacheState.images;

function cachedResponse(image: CachedImage, status: 'HIT' | 'MISS') {
  return new Response(image.bytes.slice(), {
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=604800, stale-while-revalidate=2592000',
      'Content-Length': String(image.bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'X-AniMonster-Image-Cache': status,
    },
  });
}

function remember(url: string, image: CachedImage) {
  if (image.bytes.byteLength > 2 * 1024 * 1024) return;
  const previous = imageCache.get(url);
  if (previous) cacheState.bytes -= previous.bytes.byteLength;
  imageCache.delete(url);
  imageCache.set(url, image);
  cacheState.bytes += image.bytes.byteLength;
  while (cacheState.bytes > MAX_MEMORY_BYTES || imageCache.size > 256) {
    const oldest = imageCache.entries().next().value as
      | [string, CachedImage]
      | undefined;
    if (!oldest) break;
    imageCache.delete(oldest[0]);
    cacheState.bytes -= oldest[1].bytes.byteLength;
  }
}
const allowedHost = (hostname: string) =>
  hostname === 'api.anilibria.app' ||
  hostname === 'shikimori.one' ||
  hostname === 'desu.shikimori.one';

function safeImageUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !allowedHost(url.hostname))
    throw new ApiError('Недопустимый источник изображения', 400);
  return url;
}

async function upstream(start: URL) {
  let url = start;
  for (let redirect = 0; redirect < 4; redirect++) {
    const response = await fetch(url, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        'User-Agent': 'AniMonster-Image-Gateway/1.0',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      next: { revalidate: 30 * 86400 },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new ApiError('Неверный редирект изображения', 502);
    url = safeImageUrl(new URL(location, url).href);
  }
  throw new ApiError('Слишком много редиректов изображения', 502);
}

export async function GET(request: Request) {
  try {
    const source = safeImageUrl(
      new URL(request.url).searchParams.get('url') || '',
    );
    const cacheKey = source.href;
    const cached = imageCache.get(cacheKey);
    if (cached && cached.cachedAt > Date.now() - MEMORY_TTL) {
      imageCache.delete(cacheKey);
      imageCache.set(cacheKey, cached);
      return cachedResponse(cached, 'HIT');
    }
    if (cached) {
      imageCache.delete(cacheKey);
      cacheState.bytes -= cached.bytes.byteLength;
    }
    const response = await upstream(source);
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError('Изображение временно недоступно', 502);
    }
    const contentType = response.headers.get('content-type') || '';
    const length = Number(response.headers.get('content-length') || 0);
    if (!contentType.toLowerCase().startsWith('image/')) {
      await response.body?.cancel();
      throw new ApiError('Источник вернул не изображение', 502);
    }
    if (length > MAX_IMAGE_BYTES) {
      await response.body?.cancel();
      throw new ApiError('Изображение слишком большое', 413);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES)
      throw new ApiError('Изображение слишком большое', 413);
    const image = { bytes, contentType, cachedAt: Date.now() };
    remember(cacheKey, image);
    return cachedResponse(image, 'MISS');
  } catch (error) {
    return fail(error);
  }
}
