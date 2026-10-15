import sharp from 'sharp';
import type { PassImageWidth } from '../pass-images';

export type PassAssetSource = { mime: string; data: Uint8Array; sha256: string };
type Image = { bytes: Uint8Array; mime: string; etag: string };

export async function resizePassAsset(source: PassAssetSource, width: PassImageWidth): Promise<Image> {
  const bytes = await sharp(source.data, { limitInputPixels: 25_000_000 })
    .autoOrient().resize({ width, withoutEnlargement: true, kernel: sharp.kernel.nearest })
    .webp({ quality: 88, alphaQuality: 100, effort: 4 }).toBuffer();
  return { bytes: new Uint8Array(bytes), mime: 'image/webp', etag: `"${source.sha256}-webp-v1-${width}"` };
}

export function createPassAssetCache(load: (id: string) => Promise<PassAssetSource | null>, maxBytes = 64 * 1024 * 1024) {
  const images = new Map<string, Image>(), pending = new Map<string, Promise<Image | null>>();
  let used = 0, active = 0;
  const queue: Array<() => void> = [];
  async function render(id: string, width: PassImageWidth) {
    if (active < 2) active++;
    else await new Promise<void>(resolve => queue.push(resolve));
    try {
      const source = await load(id);
      if (!source) return null;
      const image = await resizePassAsset(source, width);
      if (image.bytes.byteLength <= maxBytes) {
        images.set(`${id}:${width}`, image); used += image.bytes.byteLength;
        while (used > maxBytes) {
          const oldest = images.keys().next().value!;
          used -= images.get(oldest)!.bytes.byteLength; images.delete(oldest);
        }
      }
      return image;
    } finally {
      const next = queue.shift(); if (next) next(); else active--;
    }
  }
  return { async get(id: string, width: PassImageWidth) {
    const key = `${id}:${width}`, cached = images.get(key);
    if (cached) { images.delete(key); images.set(key, cached); return { image: cached, cache: 'HIT' }; }
    const shared = pending.get(key);
    if (shared) return { image: await shared, cache: 'SHARED' };
    const task = render(id, width); pending.set(key, task);
    try { return { image: await task, cache: 'MISS' }; } finally { pending.delete(key); }
  } };
}
