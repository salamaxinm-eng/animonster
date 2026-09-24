'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, HardDrive, Pause, Play, Trash2 } from 'lucide-react';
import { CommunityHeader } from '@/components/community/context';
import { listOfflineEpisodes } from '@/lib/offline/db';
import {
  deleteOfflineEpisode,
  OFFLINE_CHANGE_EVENT,
  offlineDownloadActive,
  pauseOfflineDownload,
  resumeOfflineDownload,
} from '@/lib/offline/downloader';
import type { OfflineEpisode } from '@/lib/offline/types';

const bytes = (value: number) =>
  value >= 1024 ** 3
    ? `${(value / 1024 ** 3).toFixed(1)} GB`
    : `${(value / 1024 ** 2).toFixed(value >= 100 * 1024 ** 2 ? 0 : 1)} MB`;

function progress(item: OfflineEpisode) {
  const segments = item.manifestData?.segments || [];
  if (!segments.length) return 0;
  return Math.round(
    (segments.filter((segment) => segment.downloaded).length /
      segments.length) *
      100,
  );
}

export default function DownloadsPage() {
  const [items, setItems] = useState<OfflineEpisode[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      void listOfflineEpisodes()
        .then(setItems)
        .catch(() => setMessage('Локальное хранилище недоступно.')),
    [],
  );
  useEffect(() => {
    load();
    const changed = () => load();
    window.addEventListener(OFFLINE_CHANGE_EVENT, changed);
    return () => window.removeEventListener(OFFLINE_CHANGE_EVENT, changed);
  }, [load]);
  async function removeWhere(predicate: (item: OfflineEpisode) => boolean) {
    for (const item of items.filter(predicate))
      await deleteOfflineEpisode(item.id);
    load();
  }
  return (
    <div className="social-site offline-page">
      <CommunityHeader />
      <main>
        <div className="offline-heading">
          <div>
            <span className="eyebrow">ANIMONSTER PLUS</span>
            <h1>Загрузки</h1>
            <p>Серии хранятся только на этом устройстве.</p>
          </div>
          <HardDrive size={42} />
        </div>
        {items.length > 0 && (
          <div className="offline-bulk-actions">
            <button
              onClick={() => void removeWhere((item) => !!item.watchedAt)}
            >
              Удалить просмотренные
            </button>
            <button onClick={() => void removeWhere(() => true)}>
              Удалить все
            </button>
          </div>
        )}
        {message && <p role="alert">{message}</p>}
        {!items.length ? (
          <div className="empty">
            <Download size={32} />
            <h2>Загрузок пока нет</h2>
            <p>Откройте серию и нажмите «Скачать».</p>
          </div>
        ) : (
          <div className="offline-list">
            {items.map((item) => {
              const percent = progress(item);
              const active = offlineDownloadActive(item.id);
              return (
                <article className="offline-card" key={item.id}>
                  <img src={item.animePoster} alt="" />
                  <div className="offline-card-body">
                    <h2>{item.animeTitle}</h2>
                    <p>
                      Серия {item.episode} · {item.quality}p ·{' '}
                      {item.voiceoverName}
                    </p>
                    {item.status !== 'completed' && (
                      <>
                        <progress max="100" value={percent} />
                        <p>
                          {percent}% · {bytes(item.downloadedBytes)}
                          {item.speedBytesPerSecond
                            ? ` · ${bytes(item.speedBytesPerSecond)}/с`
                            : ''}
                        </p>
                      </>
                    )}
                    {item.status === 'completed' && (
                      <p className="success-msg">
                        Скачано · {bytes(item.size)}
                      </p>
                    )}
                    {item.error && item.error !== 'deleted' && (
                      <p className="error-msg">{item.error}</p>
                    )}
                    <div className="offline-card-actions">
                      {item.status === 'completed' ? (
                        <a
                          className="primary"
                          href={`/downloads/watch?id=${encodeURIComponent(item.id)}`}
                        >
                          <Play size={16} /> Смотреть
                        </a>
                      ) : item.status === 'downloading' && active ? (
                        <button
                          onClick={() => void pauseOfflineDownload(item.id)}
                        >
                          <Pause size={16} /> Пауза
                        </button>
                      ) : (
                        <button
                          className="primary"
                          onClick={() =>
                            void resumeOfflineDownload(item.id).catch((error) =>
                              setMessage(error.message),
                            )
                          }
                        >
                          <Play size={16} /> Продолжить
                        </button>
                      )}
                      <button
                        onClick={() =>
                          void deleteOfflineEpisode(item.id).then(load)
                        }
                      >
                        <Trash2 size={16} /> Удалить
                      </button>
                      <button
                        onClick={() =>
                          void removeWhere(
                            (candidate) => candidate.animeId === item.animeId,
                          )
                        }
                      >
                        <Trash2 size={16} /> Удалить тайтл
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
