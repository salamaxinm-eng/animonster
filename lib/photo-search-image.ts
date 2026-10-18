import { MAX_PHOTO_BYTES, PHOTO_TYPES, type Crop } from './photo-search';

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
) {
  const width = image.naturalWidth * crop.width,
    height = image.naturalHeight * crop.height;
  if (width < 32 || height < 32)
    throw new Error('Выделенная область слишком маленькая. Увеличьте её.');
  const scale = Math.min(1, 1280 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
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
