import type { Crop } from './photo-search';

export type Pixels = { width: number; height: number; data: Uint8ClampedArray };
export const FULL_PHOTO: Crop = { x: 0, y: 0, width: 1, height: 1 };

// Analyze a small thumbnail, never the original 40 MP buffer. Sparse caption/UI
// pixels on a flat border should not be mistaken for the anime picture.
function contentBand(pixels: Pixels, vertical: boolean) {
  const { width, height, data } = pixels;
  const length = vertical ? height : width;
  const across = vertical ? width : height;
  const active: boolean[] = [];
  for (let row = 0; row < length; row++) {
    const bins = new Uint16Array(64);
    for (let col = Math.floor(across * 0.06); col < across * 0.94; col++) {
      const i = (vertical ? row * width + col : col * width + row) * 4;
      bins[(data[i] >> 6) * 16 + (data[i + 1] >> 6) * 4 + (data[i + 2] >> 6)]++;
    }
    const count = Math.ceil(across * 0.94) - Math.floor(across * 0.06);
    // Solid black/white/colored padding, including sparse text, stays inactive.
    active.push(Math.max(...bins) / count < 0.83);
  }
  // Bridge small plain patches inside an anime scene, but not large margins.
  const gap = Math.max(2, Math.round(length * 0.025));
  for (let start = 0; start < length; start++) {
    if (active[start]) continue;
    let end = start;
    while (end < length && !active[end]) end++;
    if (start > 0 && end < length && end - start <= gap)
      active.fill(true, start, end);
    start = end;
  }
  let best = { start: 0, end: length, size: 0 };
  for (let start = 0; start < length; start++) {
    if (!active[start]) continue;
    let end = start;
    while (end < length && active[end]) end++;
    if (end - start > best.size) best = { start, end, size: end - start };
    start = end;
  }
  // Conservative: require a substantial contiguous scene and substantial padding.
  if (best.size < length * 0.16 || best.size > length * 0.94)
    return [0, length];
  const outside = [...active.slice(0, best.start), ...active.slice(best.end)];
  if (outside.filter(Boolean).length > outside.length * 0.2) return [0, length];
  return [Math.max(0, best.start - 1), Math.min(length, best.end + 1)];
}

export function detectPhotoFrame(pixels: Pixels): Crop {
  const { width, height, data } = pixels;
  if (width < 16 || height < 16 || data.length !== width * height * 4)
    return { ...FULL_PHOTO };
  const [top, bottom] = contentBand(pixels, true);
  // Run horizontal detection only within the selected band; large horizontal
  // margins otherwise dominate the column statistics of a portrait screenshot.
  const band = {
    width,
    height: bottom - top,
    data: data.slice(top * width * 4, bottom * width * 4),
  };
  const [left, right] = contentBand(band, false);
  return {
    x: left / width,
    y: top / height,
    width: (right - left) / width,
    height: (bottom - top) / height,
  };
}

// Detect aligned, outlined bright glyphs. This is deliberately not OCR or an
// attempt to invent hidden scene detail. Only small text-like components are
// filled from surrounding pixels; original pixels remain available for search.
export function softenPhotoSubtitles(pixels: Pixels) {
  const { width, height, data } = pixels;
  const mask = new Uint8Array(width * height);
  const bright = (i: number) => {
    const r = data[i * 4],
      g = data[i * 4 + 1],
      b = data[i * 4 + 2];
    return (
      Math.min(r, g, b) > 175 && Math.max(r, g, b) - Math.min(r, g, b) < 65
    );
  };
  const radius = Math.max(1, Math.round(width / 320));
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const i = y * width + x;
      if (!bright(i)) continue;
      for (const d of [-radius, radius, -radius * width, radius * width]) {
        const j = (i + d) * 4;
        if (Math.max(data[j], data[j + 1], data[j + 2]) < 85) {
          mask[i] = 1;
          break;
        }
      }
    }
  }
  const visited = new Uint8Array(mask.length);
  const components: {
    x: number;
    y: number;
    right: number;
    bottom: number;
    points: number[];
  }[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || visited[i]) continue;
    const points = [i];
    visited[i] = 1;
    let x = i % width,
      right = x,
      y = Math.floor(i / width),
      bottom = y;
    for (let n = 0; n < points.length; n++) {
      const p = points[n],
        px = p % width,
        py = Math.floor(p / width);
      x = Math.min(x, px);
      right = Math.max(right, px);
      y = Math.min(y, py);
      bottom = Math.max(bottom, py);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx,
            ny = py + dy,
            next = ny * width + nx;
          if (
            nx < 0 ||
            nx >= width ||
            ny < 0 ||
            ny >= height ||
            !mask[next] ||
            visited[next]
          )
            continue;
          visited[next] = 1;
          points.push(next);
        }
    }
    const w = right - x + 1,
      h = bottom - y + 1;
    if (
      h >= Math.max(3, height * 0.009) &&
      h <= height * 0.13 &&
      w <= width * 0.09 &&
      points.length >= 3
    )
      components.push({ x, right, y, bottom, points });
    if (components.length > 600) return { pixels, changed: false };
  }
  const textMask = new Uint8Array(mask.length);
  for (const component of components) {
    const h = component.bottom - component.y + 1;
    const line = components.filter(
      (other) =>
        Math.abs(other.bottom - component.bottom) <= Math.max(2, h * 0.25) &&
        Math.abs(other.bottom - other.y + 1 - h) <= h * 0.45,
    );
    const span =
      Math.max(...line.map((c) => c.right)) - Math.min(...line.map((c) => c.x));
    if (line.length < 5 || span < width * 0.16) continue;
    for (const c of line)
      for (const p of c.points) {
        const px = p % width,
          py = Math.floor(p / width);
        for (let dy = -radius - 1; dy <= radius + 1; dy++)
          for (let dx = -radius - 1; dx <= radius + 1; dx++) {
            const nx = px + dx,
              ny = py + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height)
              textMask[ny * width + nx] = 1;
          }
      }
  }
  const count = textMask.reduce((sum, value) => sum + value, 0);
  if (count < 10 || count > width * height * 0.14)
    return { pixels, changed: false };
  const output = new Uint8ClampedArray(data);
  for (let i = 0; i < textMask.length; i++) {
    if (!textMask[i]) continue;
    const x = i % width,
      y = Math.floor(i / width);
    const samples: number[] = [];
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      for (
        let distance = 1;
        distance <= Math.max(12, width * 0.06);
        distance++
      ) {
        const nx = x + dx * distance,
          ny = y + dy * distance;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) break;
        const next = ny * width + nx;
        if (!textMask[next]) {
          samples.push(next);
          break;
        }
      }
    }
    if (!samples.length) continue;
    for (let channel = 0; channel < 3; channel++)
      output[i * 4 + channel] =
        samples.reduce((sum, p) => sum + data[p * 4 + channel], 0) /
        samples.length;
  }
  return { pixels: { width, height, data: output }, changed: true };
}
