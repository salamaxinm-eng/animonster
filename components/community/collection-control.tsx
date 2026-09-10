'use client';
import { useEffect, useState } from 'react';
import { NativeSelect } from '@/components/ui/native-select';
import { api, useCommunity } from './context';
import { statuses, type Entry } from '@/lib/community';
export function CollectionControl({
  anime,
}: {
  anime: {
    id: number;
    russian: string;
    name: string;
    image: { original: string };
  };
}) {
  const { user, login } = useCommunity(),
    [entry, setEntry] = useState<Entry | null>(null),
    [status, setStatus] = useState('planned'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let ok = true;
    setEntry(null);
    if (user)
      api('profile')
        .then((x) => {
          if (ok) {
            const e = x.entries.find((x: Entry) => x.anime_id === anime.id);
            setEntry(e || null);
            setStatus(e?.status || 'planned');
          }
        })
        .catch(() => {});
    return () => {
      ok = false;
    };
  }, [user, anime.id]);
  async function save() {
    if (!user) {
      login();
      return;
    }
    setBusy(true);
    try {
      const e = {
        anime_id: anime.id,
        title: anime.russian || anime.name,
        image: anime.image.original.startsWith('https://')
          ? anime.image.original
          : 'https://shikimori.one' + anime.image.original,
        status,
        rating: entry?.rating || 0,
        favorite: entry?.favorite || 0,
      };
      await api('collection', e);
      setEntry(e);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="collection-control">
      <NativeSelect
        aria-label="Статус в коллекции"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        {Object.entries(statuses).map(([v, t]) => (
          <option value={v} key={v}>
            {t}
          </option>
        ))}
      </NativeSelect>
      <button className="primary" disabled={busy} onClick={save}>
        {entry ? 'Сохранить статус' : 'В коллекцию'}
      </button>
      {entry && <span className="success-msg">В твоём профиле</span>}
      {error && <span className="error-msg">{error}</span>}
    </div>
  );
}
