'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCommunity } from './community/context';
type Status = {
  ready: boolean;
  account: { vk_user_id: string | null; disabled_at: number | null } | null;
  subscriptions: { anime_id: number }[];
};
export function VkEpisodeNotifications({ animeId }: { animeId: number }) {
  const { user } = useCommunity();
  const router = useRouter();
  const [data, setData] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    setData(null);
    setMessage('');
    if (!user) return;
    const controller = new AbortController();
    fetch('/api/vk-notifications', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [user?.id, animeId]);
  if (!data?.ready) return null;
  const active = data.subscriptions.some((s) => s.anime_id === animeId);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/vk-notifications', { cache: 'no-store' });
      const current = (await r.json()) as Status & { error?: string };
      if (!r.ok) throw Error(current.error || 'Не удалось проверить ВК');
      if (!current.account?.vk_user_id || current.account.disabled_at) {
        router.push(
          '/profile?section=settings&settings=notifications#vk-notifications',
        );
        return;
      }
      const subscribed = current.subscriptions.some(
        (s) => s.anime_id === animeId,
      );
      const response = await fetch('/api/vk-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: subscribed ? 'unsubscribe' : 'subscribe',
          anime_id: animeId,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || 'Не удалось изменить уведомления ВК');
      setData({
        ...current,
        subscriptions: subscribed
          ? current.subscriptions.filter((s) => s.anime_id !== animeId)
          : [...current.subscriptions, { anime_id: animeId }],
      });
      setMessage(
        subscribed ? 'Уведомления ВК отключены' : 'Уведомления ВК включены',
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Не удалось изменить уведомления ВК',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="episode-notifications">
      <button
        className="outline-button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void toggle()}
      >
        {active ? 'Не уведомлять ВК' : 'Уведомлять ВКонтакте'}
      </button>
      {message && <small role="status">{message}</small>}
    </div>
  );
}
