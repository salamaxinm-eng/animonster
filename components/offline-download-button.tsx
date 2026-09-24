'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useCommunity } from '@/components/community/context';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { offlineOptions, startOfflineDownload } from '@/lib/offline/downloader';

export function OfflineDownloadButton({
  animeId,
  episode,
}: {
  animeId: number;
  episode: number;
}) {
  const community = useCommunity();
  const [open, setOpen] = useState(false);
  const [qualities, setQualities] = useState<(480 | 720 | 1080)[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function showOptions() {
    if (!community.user) {
      community.login();
      return;
    }
    if (!community.user.entitlements.can_download) {
      setMessage('Доступно с AniMonster Plus');
      setQualities([]);
      setOpen(true);
      return;
    }
    setBusy(true);
    setMessage('Проверяем доступные качества…');
    setOpen(true);
    try {
      const result = await offlineOptions(animeId, episode);
      setQualities(result.qualities);
      setMessage('');
    } catch (error) {
      setQualities([]);
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function download(quality: 480 | 720 | 1080) {
    setBusy(true);
    setMessage('Подготавливаем загрузку…');
    try {
      await startOfflineDownload({ animeId, episode, quality });
      setMessage('Загрузка началась. Прогресс доступен в разделе «Загрузки».');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void showOptions()}>
        <Download size={18} /> Скачать
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="offline-quality-dialog">
          <DialogTitle>Скачать серию</DialogTitle>
          <DialogDescription>
            Копия AniLiberty сохранится внутри AniMonster на этом устройстве.
          </DialogDescription>
          {message && <p role="status">{message}</p>}
          <div className="offline-quality-list">
            {qualities.map((quality) => (
              <button
                className="primary"
                disabled={busy}
                key={quality}
                onClick={() => void download(quality)}
              >
                {quality}p
              </button>
            ))}
          </div>
          {!community.user?.entitlements.can_download && community.user && (
            <a className="primary" href="/plus">
              Открыть AniMonster Plus
            </a>
          )}
          <a href="/downloads">Перейти к загрузкам</a>
        </DialogContent>
      </Dialog>
    </>
  );
}
