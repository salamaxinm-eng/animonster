import sharp from 'sharp';

export const IMAGE_WIDTHS = [240, 480, 960] as const;
export async function optimizeRemoteImage(bytes: Uint8Array, contentType: string, width: number) {
  const decoder = sharp(bytes, { limitInputPixels: 25_000_000 });
  const metadata = await decoder.metadata();
  // Preserve animation; cosmetics and uploaded user images use their own routes.
  if ((metadata.pages || 1) > 1) return { bytes, contentType };
  const result = await decoder.autoOrient().resize({ width, withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toBuffer();
  return { bytes: new Uint8Array(result), contentType: 'image/webp' };
}
