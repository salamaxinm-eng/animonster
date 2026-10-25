export type DemoPreviewCue = {
  start: number;
  stop: number;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
function seconds(value: string) {
  const parts = value.trim().split(':').map(Number);
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : NaN;
}
export function parseDemoPreviews(
  text: string,
  base: string,
): DemoPreviewCue[] {
  const result: DemoPreviewCue[] = [];
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n');
    const index = lines.findIndex((line) => line.includes('-->'));
    if (index < 0) continue;
    const [from, to] = lines[index].split('-->');
    const start = seconds(from),
      stop = seconds(to);
    const match = /^([^#]+)#xywh=(\d+),(\d+),(\d+),(\d+)$/.exec(
      lines[index + 1]?.trim() || '',
    );
    if (
      !match ||
      !Number.isFinite(start) ||
      !Number.isFinite(stop) ||
      start < 0 ||
      stop <= start
    )
      continue;
    const url = new URL(match[1], base),
      origin = new URL(base).origin;
    const [x, y, width, height] = match.slice(2).map(Number);
    if (
      url.origin !== origin ||
      !/^\/demo-media\/[a-zA-Z0-9/_-]+\.jpg$/.test(url.pathname) ||
      width < 1 ||
      height < 1 ||
      width > 640 ||
      height > 360 ||
      x + width > 10000 ||
      y + height > 10000
    )
      continue;
    result.push({ start, stop, url: url.href, x, y, width, height });
  }
  return result;
}
