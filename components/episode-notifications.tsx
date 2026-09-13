'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { useCommunity } from './community/context';

export function EpisodeNotifications({
  animeId,
  title,
}: {
  animeId: number;
  title: string;
}) {
  const { user, login } = useCommunity(),
    [active, setActive] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    if (!user) return;
    fetch('/api/telegram')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) =>
        setActive(
          !!data?.subscriptions?.some((item: any) => item.anime_id === animeId),
        ),
      )
      .catch(() => {});
  }, [user?.id, animeId]);
  async function toggle() {
    if (!user) return login();
    setMessage('');
    const response = await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: active ? 'unsubscribe' : 'subscribe',
        anime_id: animeId,
        title,
      }),
    });
    const result = await response.json();
    if (!response.ok)
      return setMessage(result.error || 'Не удалось изменить уведомления');
    setActive(!active);
    setMessage(active ? 'Уведомления отключены' : 'Уведомления включены');
  }
  return (
    <div className="episode-notifications">
      <button type="button" className="outline-button" onClick={toggle}>
        {active ? <BellOff size={17} /> : <Bell size={17} />}
        {active ? 'Не уведомлять' : 'Уведомлять о новых сериях'}
      </button>
      {message && <small>{message}</small>}
    </div>
  );
}
