export const PASS_IMAGE_WIDTHS = [256, 512, 1024] as const;
export type PassImageWidth = typeof PASS_IMAGE_WIDTHS[number];

export function passImageUrl(source: string, width: PassImageWidth) {
  return /^\/api\/battlepass\/assets\/[a-f0-9-]{36}$/.test(source)
    ? `${source}?w=${width}` : source;
}
