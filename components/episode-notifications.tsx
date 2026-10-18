'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff } from 'lucide-react';
import { useCommunity } from './community/context';

export function EpisodeNotifications({
  animeId,
  title,
}: {
  animeId: number;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { user, login } = useCommunity(),
    [active, setActive] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    setActive(false);
    setMessage('');
    if (!user) return;
    const controller = new AbortController();
    fetch('/api/telegram', { signal: controller.signal, cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!controller.signal.aborted) setActive(
          !!data?.subscriptions?.some((item: { anime_id: number }) => item.anime_id === animeId),
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [user?.id, animeId]);
  async function toggle() {
    if (!user) return login();
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const status = await fetch('/api/telegram', { cache: 'no-store' });
      const telegram = await status.json();
      if (!status.ok) throw new Error(telegram.error || 'Не удалось проверить Telegram');
      if (!telegram.account?.telegram_id) {
        router.push('/profile?section=settings&settings=notifications#telegram');
        return;
      }
      const subscribed = !!telegram.subscriptions?.some(
        (item: { anime_id: number }) => item.anime_id === animeId,
      );
      const response = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: subscribed ? 'unsubscribe' : 'subscribe',
          anime_id: animeId,
          title,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось изменить уведомления');
      setActive(!subscribed);
      setMessage(subscribed ? 'Уведомления отключены' : 'Уведомления включены');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Не удалось изменить уведомления');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="episode-notifications">
      <button type="button" className="outline-button" onClick={toggle} disabled={busy} aria-busy={busy}>
        {active ? <BellOff size={17} /> : <Bell size={17} />}
        {active ? 'Не уведомлять' : 'Уведомлять о новых сериях'}
      </button>
      {message && <small role="status">{message}</small>}
    </div>
  );
}
