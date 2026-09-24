'use client';

const ROOT = 'animonster-offline-v1';
const FALLBACK_DATABASE = 'animonster-offline-files-v1';
const FALLBACK_STORE = 'files';
let opfsSupported: Promise<boolean> | undefined;

function storageRoot() {
  if (!navigator.storage?.getDirectory)
    throw new Error('Офлайн-хранилище не поддерживается этим браузером.');
  return navigator.storage.getDirectory();
}

function fallbackDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(FALLBACK_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FALLBACK_STORE))
        request.result.createObjectStore(FALLBACK_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function fallbackRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await fallbackDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(FALLBACK_STORE, mode);
    const request = run(transaction.objectStore(FALLBACK_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

const fallbackKey = (episodeId: string, name: string) => `${episodeId}/${name}`;

async function canUseOpfs() {
  if (opfsSupported) return opfsSupported;
  opfsSupported = (async () => {
    try {
      if (!navigator.storage?.getDirectory) return false;
      const root = await navigator.storage.getDirectory();
      const probe = await root.getFileHandle('.animonster-probe', {
        create: true,
      });
      if (typeof probe.createWritable !== 'function') return false;
      const writable = await probe.createWritable();
      await writable.write(new Uint8Array(0));
      await writable.close();
      await probe.getFile();
      await root.removeEntry('.animonster-probe').catch(() => {});
      return true;
    } catch {
      return false;
    }
  })();
  return opfsSupported;
}

async function canUseFallback() {
  try {
    await fallbackRequest('readwrite', (store) =>
      store.put(new Blob(), '.animonster-probe'),
    );
    await fallbackRequest('readwrite', (store) =>
      store.delete('.animonster-probe'),
    );
    return true;
  } catch {
    return false;
  }
}

export async function ensureOfflineStorage() {
  if ((await canUseOpfs()) || (await canUseFallback())) return;
  throw new Error(
    'Safari не дал доступ к хранилищу. Откройте AniMonster не в приватном режиме и повторите попытку.',
  );
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
  if (!(await canUseOpfs())) {
    if (signal.aborted) throw new DOMException('Paused', 'AbortError');
    const data = await response.blob();
    if (signal.aborted) throw new DOMException('Paused', 'AbortError');
    await fallbackRequest('readwrite', (store) =>
      store.put(data, fallbackKey(episodeId, name)),
    );
    onBytes(data.size);
    return data.size;
  }
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
  if (await canUseOpfs()) {
    try {
      const directory = await episodeDirectory(episodeId, false);
      return await (await directory.getFileHandle(name)).getFile();
    } catch (error) {
      if ((error as DOMException).name !== 'NotFoundError') throw error;
    }
  }
  const value = await fallbackRequest<Blob | undefined>('readonly', (store) =>
    store.get(fallbackKey(episodeId, name)),
  );
  if (!value) throw new DOMException('Файл не найден', 'NotFoundError');
  return value;
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
  if (await canUseOpfs()) {
    const root = await rootDirectory();
    await root.removeEntry(id, { recursive: true }).catch((error) => {
      if ((error as DOMException).name !== 'NotFoundError') throw error;
    });
  }
  const database = await fallbackDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(FALLBACK_STORE, 'readwrite');
    const store = transaction.objectStore(FALLBACK_STORE);
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      if (String(current.key).startsWith(`${id}/`)) current.delete();
      current.continue();
    };
    cursor.onerror = () => reject(cursor.error);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
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
