'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useCommunity } from '@/components/community/context';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  offlineOptions,
  startOfflineDownload,
  startOfflineRangeDownload,
} from '@/lib/offline/downloader';

export function OfflineDownloadButton({
  animeId,
  episode,
  episodes,
}: {
  animeId: number;
  episode: number;
  episodes: number[];
}) {
  const community = useCommunity();
  const [open, setOpen] = useState(false);
  const [qualities, setQualities] = useState<(480 | 720 | 1080)[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const sortedEpisodes = [...new Set(episodes)].sort((a, b) => a - b);
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [from, setFrom] = useState(episode);
  const [to, setTo] = useState(episode);
  const [downloadable, setDownloadable] = useState<number[]>([episode]);

  const selectedEpisodes = sortedEpisodes.filter(
    (value) => value >= Math.min(from, to) && value <= Math.max(from, to),
  );

  async function loadOptions(selected: number[]) {
    if (selected.length > 50) {
      setQualities([]);
      setDownloadable([]);
      setMessage('За один раз можно выбрать не больше 50 серий.');
      return;
    }
    setBusy(true);
    setMessage('Проверяем доступные серии и качества…');
    try {
      const result = await offlineOptions(animeId, selected);
      setQualities(result.qualities);
      setDownloadable(result.items.map((item) => item.episode));
      setMessage(
        result.unavailableEpisodes.length
          ? `Доступно ${result.items.length} из ${selected.length}. Остальные серии отсутствуют у источника.`
          : '',
      );
    } catch (error) {
      setQualities([]);
      setDownloadable([]);
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
    setMode('single');
    setFrom(episode);
    setTo(episode);
    setOpen(true);
    await loadOptions([episode]);
  }

  async function download(quality: 480 | 720 | 1080) {
    setBusy(true);
    setMessage('Подготавливаем загрузку…');
    try {
      if (mode === 'range') {
        await startOfflineRangeDownload({
          animeId,
          episodes: downloadable,
          quality,
        });
        setMessage(
          `${downloadable.length} серий добавлено в очередь. Они будут скачиваться по очереди.`,
        );
      } else {
        await startOfflineDownload({ animeId, episode, quality });
        setMessage(
          'Серия добавлена в очередь. Прогресс доступен в разделе «Загрузки».',
        );
      }
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
          <DialogTitle>
            {mode === 'single' ? 'Скачать серию' : 'Скачать диапазон серий'}
          </DialogTitle>
          <DialogDescription>
            Копия AniLiberty сохранится внутри AniMonster на этом устройстве.
          </DialogDescription>
          <div className="offline-mode-switch" aria-label="Режим загрузки">
            <button
              className={mode === 'single' ? 'active' : ''}
              disabled={busy}
              onClick={() => {
                setMode('single');
                setFrom(episode);
                setTo(episode);
                void loadOptions([episode]);
              }}
            >
              Одна серия
            </button>
            <button
              className={mode === 'range' ? 'active' : ''}
              disabled={busy || sortedEpisodes.length < 2}
              onClick={() => {
                const last = sortedEpisodes.at(-1) || episode;
                setMode('range');
                setFrom(episode);
                setTo(last);
                setQualities([]);
                setDownloadable([]);
                setMessage('Выберите границы и проверьте доступность.');
              }}
            >
              Диапазон
            </button>
          </div>
          {mode === 'range' && (
            <div className="offline-range-picker">
              <label>
                С серии
                <NativeSelect
                  value={from}
                  onChange={(event) => {
                    setFrom(Number(event.target.value));
                    setQualities([]);
                  }}
                >
                  {sortedEpisodes.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label>
                По серию
                <NativeSelect
                  value={to}
                  onChange={(event) => {
                    setTo(Number(event.target.value));
                    setQualities([]);
                  }}
                >
                  {sortedEpisodes.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <button
                disabled={busy || !selectedEpisodes.length}
                onClick={() => void loadOptions(selectedEpisodes)}
              >
                Проверить {selectedEpisodes.length} серий
              </button>
            </div>
          )}
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
