import { ApiError, runtime } from './core';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const TOKEN_LIFETIME_MS = 6 * 60 * 60 * 1000;

type MediaToken = { url: string; expires: number };

const base64url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString('base64url');

const allowedHosts = () => {
  const hosts = new Set(
    (runtime().MEDIA_PROXY_HOSTS || 'cache.libria.fun,cache1.libria.fun')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
  return hosts;
};

function allowedMediaHost(hostname: string) {
  const hosts = allowedHosts();
  // Each segment may be redirected to a different numbered provider cache.
  // Trust only that CDN family when its entry host is explicitly enabled.
  return (
    hosts.has(hostname) ||
    (hosts.has('cache.libria.fun') &&
      /^cache[1-9][0-9]*\.libria\.fun$/.test(hostname))
  );
}

export const mediaProxyEnabled = () => runtime().MEDIA_PROXY_ENABLED === 'true';

function mediaSecret() {
  const secret = runtime().MEDIA_PROXY_SECRET?.trim() || '';
  if (secret.length < 32)
    throw new ApiError(
      'Медиашлюз не настроен.',
      503,
      'media_proxy_unavailable',
    );
  return secret;
}

export function validateMediaUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(
      'Некорректная ссылка на поток.',
      400,
      'invalid_media_url',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !allowedMediaHost(url.hostname.toLowerCase())
  )
    throw new ApiError(
      'Источник потока не разрешён.',
      403,
      'media_host_denied',
    );
  return url;
}

async function signature(payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(mediaSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, encoder.encode(payload)),
    ),
  );
}

export async function mediaProxyUrl(
  value: string,
  expires = Date.now() + TOKEN_LIFETIME_MS,
) {
  if (!mediaProxyEnabled()) return value;
  const url = validateMediaUrl(value);
  const payload = base64url(
    encoder.encode(
      JSON.stringify({ url: url.href, expires } satisfies MediaToken),
    ),
  );
  return `/api/media?token=${encodeURIComponent(payload + '.' + (await signature(payload)))}`;
}

function constantTimeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++)
    difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function readMediaToken(token: string) {
  const separator = token.lastIndexOf('.');
  if (separator < 1) throw new ApiError('Некорректный токен потока.', 400);
  const payload = token.slice(0, separator);
  const supplied = token.slice(separator + 1);
  const expected = await signature(payload);
  if (!constantTimeEqual(supplied, expected))
    throw new ApiError('Недействительный токен потока.', 403);
  let parsed: MediaToken;
  try {
    parsed = JSON.parse(decoder.decode(Buffer.from(payload, 'base64url')));
  } catch {
    throw new ApiError('Некорректный токен потока.', 400);
  }
  if (!Number.isFinite(parsed.expires) || parsed.expires < Date.now())
    throw new ApiError('Ссылка на поток устарела.', 410, 'media_token_expired');
  return validateMediaUrl(parsed.url);
}

export async function rewriteManifest(manifest: string, source: URL) {
  const expires = Date.now() + TOKEN_LIFETIME_MS;
  const rewrite = async (value: string) =>
    mediaProxyUrl(new URL(value, source).href, expires);
  const lines = manifest.split(/\r?\n/);
  return (
    await Promise.all(
      lines.map(async (line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (!trimmed.startsWith('#')) return rewrite(trimmed);
        const matches = [...line.matchAll(/URI="([^"]+)"/g)];
        if (!matches.length) return line;
        let rewritten = line;
        for (const match of matches)
          rewritten = rewritten.replace(
            `URI="${match[1]}"`,
            `URI="${await rewrite(match[1])}"`,
          );
        return rewritten;
      }),
    )
  ).join('\n');
}

export function assertManifestSize(length: number) {
  if (length > MAX_MANIFEST_BYTES)
    throw new ApiError('Плейлист слишком большой.', 502);
}
