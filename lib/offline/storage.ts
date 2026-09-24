'use client';

const ROOT = 'animonster-offline-v1';

function storageRoot() {
  if (!navigator.storage?.getDirectory)
    throw new Error('Офлайн-хранилище не поддерживается этим браузером.');
  return navigator.storage.getDirectory();
}

async function rootDirectory() {
  return (await storageRoot()).getDirectoryHandle(ROOT, { create: true });
}

export async function episodeDirectory(id: string, create = true) {
  return (await rootDirectory()).getDirectoryHandle(id, { create });
}

export async function writeResponseFile(
  episodeId: string,
  name: string,
  response: Response,
  signal: AbortSignal,
  onBytes: (bytes: number) => void,
) {
  const directory = await episodeDirectory(episodeId);
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  const reader = response.body?.getReader();
  let size = 0;
  try {
    if (!reader) {
      const data = await response.arrayBuffer();
      await writable.write(data);
      size = data.byteLength;
      onBytes(size);
    } else {
      while (true) {
        if (signal.aborted) throw new DOMException('Paused', 'AbortError');
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        size += value.byteLength;
        onBytes(value.byteLength);
      }
    }
    await writable.close();
    return size;
  } catch (error) {
    await writable.abort().catch(() => {});
    await directory.removeEntry(name).catch(() => {});
    throw error;
  }
}

export async function readOfflineFile(episodeId: string, name: string) {
  const directory = await episodeDirectory(episodeId, false);
  return (await directory.getFileHandle(name)).getFile();
}

export async function offlineFileExists(episodeId: string, name: string) {
  try {
    await readOfflineFile(episodeId, name);
    return true;
  } catch {
    return false;
  }
}

export async function deleteOfflineFiles(id: string) {
  const root = await rootDirectory();
  await root.removeEntry(id, { recursive: true }).catch((error) => {
    if ((error as DOMException).name !== 'NotFoundError') throw error;
  });
}

export async function cachePoster(url: string) {
  if (!('caches' in window) || !url) return;
  const cache = await caches.open('animonster-offline-posters-v1');
  if (!(await cache.match(url))) {
    const response = await fetch(url);
    if (response.ok) await cache.put(url, response);
  }
}

export async function storageEstimate() {
  const value = await navigator.storage?.estimate?.();
  return { quota: value?.quota || 0, usage: value?.usage || 0 };
}
