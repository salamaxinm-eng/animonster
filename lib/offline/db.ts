'use client';

import type { OfflineEpisode } from './types';

const DATABASE = 'animonster-offline-v1';
const STORE = 'episodes';

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

export const getOfflineEpisode = (id: string) =>
  transaction<OfflineEpisode | undefined>('readonly', (store) => store.get(id));

export const listOfflineEpisodes = () =>
  transaction<OfflineEpisode[]>('readonly', (store) => store.getAll()).then(
    (items) => items.sort((a, b) => b.updatedAt - a.updatedAt),
  );

export const putOfflineEpisode = (episode: OfflineEpisode) =>
  transaction<IDBValidKey>('readwrite', (store) => store.put(episode)).then(
    () => episode,
  );

export const removeOfflineEpisodeMetadata = (id: string) =>
  transaction<undefined>('readwrite', (store) => store.delete(id));
