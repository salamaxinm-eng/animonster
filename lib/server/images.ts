import { ApiError } from './core';

const REMOTE_IMAGE_HOSTS = new Set([
  'api.anilibria.app',
  'shikimori.one',
  'desu.shikimori.one',
  'shikimori.io',
  'desu.shikimori.io',
  'st.kp.yandex.net',
  'avatars.mds.yandex.net',
  'image.openmoviedb.com',
]);

export function safeRemoteImageUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !REMOTE_IMAGE_HOSTS.has(url.hostname.toLowerCase())
  )
    throw new ApiError('Недопустимый источник изображения', 400);
  return url;
}

function contains(bytes: Uint8Array, text: string) {
  const needle = new TextEncoder().encode(text);
  outer: for (let index = 0; index <= bytes.length - needle.length; index++) {
    for (let offset = 0; offset < needle.length; offset++)
      if (bytes[index + offset] !== needle[offset]) continue outer;
    return true;
  }
  return false;
}

export function inspectImage(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    if (contains(bytes, 'acTL')) return null;
    return {
      mime: 'image/png',
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1],
        length = view.getUint16(offset + 2);
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      )
        return {
          mime: 'image/jpeg',
          height: view.getUint16(offset + 5),
          width: view.getUint16(offset + 7),
        };
      if (length < 2) break;
      offset += length + 2;
    }
    return null;
  }
  if (
    bytes.length >= 30 &&
    new TextDecoder('ascii').decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder('ascii').decode(bytes.slice(8, 12)) === 'WEBP'
  ) {
    if (contains(bytes, 'ANIM')) return null;
    const kind = new TextDecoder('ascii').decode(bytes.slice(12, 16));
    if (kind === 'VP8X')
      return {
        mime: 'image/webp',
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    if (kind === 'VP8L') {
      const bits = view.getUint32(21, true);
      return {
        mime: 'image/webp',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (kind === 'VP8 ' && bytes[23] === 0x9d)
      return {
        mime: 'image/webp',
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
  }
  return null;
}

export function validateImage(
  bytes: Uint8Array,
  options: { minWidth: number; minHeight: number; maxDimension?: number },
) {
  const image = inspectImage(bytes);
  if (!image)
    throw new ApiError(
      'Поддерживаются статичные PNG, JPEG и WebP.',
      415,
      'image_type_not_supported',
    );
  const maximum = options.maxDimension || 6000;
  if (
    image.width < options.minWidth ||
    image.height < options.minHeight ||
    image.width > maximum ||
    image.height > maximum
  )
    throw new ApiError(
      `Разрешение изображения должно быть от ${options.minWidth}×${options.minHeight} до ${maximum}×${maximum}.`,
      400,
      'image_dimensions_invalid',
    );
  return image;
}
