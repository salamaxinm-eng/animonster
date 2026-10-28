import {
  fitCrop,
  MAX_PHOTO_BYTES,
  PHOTO_TYPES,
  type Crop,
} from './photo-search';
import {
  detectPhotoFrame,
  softenPhotoSubtitles,
} from './photo-search-preprocess';
import type { PhotoVariant } from './photo-search-runner';

async function loadImage(url: string, signal: AbortSignal) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const abort = () => {
      image.src = '';
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(
        new Error(
          'Изображение повреждено или не поддерживается. Выберите другой файл.',
        ),
      );
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    image.src = url;
  });
}

export async function preparePhoto(file: File, signal: AbortSignal) {
  if (!PHOTO_TYPES.includes(file.type))
    throw new Error('Выберите изображение JPG, PNG или WebP.');
  if (!file.size || file.size > MAX_PHOTO_BYTES)
    throw new Error('Размер изображения должен быть от 1 байта до 12 МБ.');
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const png = head.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  const webp =
    String.fromCharCode(...head.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...head.slice(8, 12)) === 'WEBP';
  if (
    !(
      (file.type === 'image/jpeg' && jpeg) ||
      (file.type === 'image/png' && png) ||
      (file.type === 'image/webp' && webp)
    )
  )
    throw new Error('Содержимое файла не соответствует формату изображения.');
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url, signal);
    const width = image.naturalWidth,
      height = image.naturalHeight;
    if (width < 32 || height < 32)
      throw new Error(
        'Кадр слишком маленький. Выберите изображение не меньше 32 × 32 пикселей.',
      );
    if (width * height > 40_000_000 || width > 16000 || height > 16000)
      throw new Error(
        'Слишком высокое разрешение. Уменьшите изображение до 40 мегапикселей.',
      );
    const scale = Math.min(1, 1920 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Браузер не поддерживает обработку изображений.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await loadImage(canvas.toDataURL('image/jpeg', 0.92), signal);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPhoto(
  image: HTMLImageElement,
  crop: Crop,
  mirror = false,
  options: { softenText?: boolean; ratio?: number } = {},
) {
  const width = image.naturalWidth * crop.width,
    height = image.naturalHeight * crop.height;
  if (width < 32 || height < 32)
    throw new Error('Выделенная область слишком маленькая. Увеличьте её.');
  const scale = Math.min(
    1,
    (options.softenText ? 640 : 1280) / Math.max(width, height),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  if (options.ratio)
    canvas.height = Math.max(32, Math.round(canvas.width / options.ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Браузер не поддерживает обработку изображений.');
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(
    image,
    crop.x * image.naturalWidth,
    crop.y * image.naturalHeight,
    width,
    height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  if (options.softenText) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const cleaned = softenPhotoSubtitles(pixels);
    if (cleaned.changed) {
      pixels.data.set(cleaned.pixels.data);
      ctx.putImageData(pixels, 0, 0);
    }
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => {
        if (blob && blob.size <= 2 * 1024 * 1024) resolve(blob);
        else
          reject(
            new Error('Не удалось подготовить кадр. Выберите меньшую область.'),
          );
      },
      'image/jpeg',
      0.88,
    ),
  );
}

export function suggestPhotoCrop(image: HTMLImageElement): Crop {
  const scale = Math.min(
    1,
    384 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, width: 1, height: 1 };
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return detectPhotoFrame(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

export function photoSearchVariants(
  image: HTMLImageElement,
  crop: Crop,
  automatic: boolean,
  mirrorOnly = false,
): PhotoVariant[] {
  if (!automatic || mirrorOnly)
    return [
      {
        label: mirrorOnly ? 'Зеркальный кадр' : 'Выбранный кадр',
        image: () => exportPhoto(image, crop, mirrorOnly),
      },
    ];
  const width = image.naturalWidth,
    height = image.naturalHeight;
  const portrait = (width * crop.width) / (height * crop.height) < 1;
  // With a blurred background there is no reliable flat-border signal. Landscape
  // windows are hypotheses, not recovered pixels. Keep them inside the detected region.
  const window = (y = 0.5): Crop => {
    const relative = fitCrop(
      width * crop.width,
      height * crop.height,
      16 / 9,
      1,
      0.5,
      y,
    );
    return {
      x: crop.x + relative.x * crop.width,
      y: crop.y + relative.y * crop.height,
      width: relative.width * crop.width,
      height: relative.height * crop.height,
    };
  };
  // Preserve all available scene information first. A crop cannot reconstruct
  // the missing sides of a vertical edit and must not replace the original.
  const frame = crop;
  const variants: PhotoVariant[] = [
    { label: 'Кадр без полей', image: () => exportPhoto(image, frame) },
    {
      label: 'Кадр с обработкой субтитров',
      image: () => exportPhoto(image, frame, false, { softenText: true }),
    },
    {
      label: 'Зеркальный кадр с обработкой субтитров',
      image: () => exportPhoto(image, frame, true, { softenText: true }),
    },
  ];
  if (portrait) {
    variants.push({
      label: 'Другая область вертикального скрина',
      image: () => exportPhoto(image, window()),
    });
  } else {
    const ratio = (width * frame.width) / (height * frame.height);
    variants.push(
      Math.abs(ratio - 16 / 9) > 0.12
        ? {
            label: 'Восстановленные пропорции 16:9',
            image: () =>
              exportPhoto(image, frame, false, {
                ratio: 16 / 9,
                softenText: true,
              }),
          }
        : {
            label: 'Исходный скриншот',
            image: () =>
              exportPhoto(image, { x: 0, y: 0, width: 1, height: 1 }),
          },
    );
  }
  return variants;
}
