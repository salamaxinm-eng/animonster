'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Trophy, X } from 'lucide-react';
import { useCommunity } from '@/components/community/context';

type Notice = {
  achievement_id: string;
  name: string;
  description: string;
  rarity: string;
  xp_awarded: number;
};
export function OnePieceToasts() {
  const { user } = useCommunity();
  const [items, setItems] = useState<Notice[]>([]);
  const busy = useRef(false);
  const poll = useCallback(
    async (signal?: AbortSignal) => {
      if (!user || busy.current || document.hidden) return;
      busy.current = true;
      try {
        const r = await fetch('/api/one-piece', {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'notices' }),
        });
        if (r.ok) {
          const incoming = (await r.json()) as Notice[];
          if (!signal?.aborted)
            setItems((current) => [...current, ...incoming].slice(-3));
        }
      } catch {
        /* Persistent profile notifications remain available. */
      } finally {
        busy.current = false;
      }
    },
    [user?.id],
  );
  useEffect(() => {
    setItems([]);
    if (!user) return;
    const controller = new AbortController(),
      refresh = () => void poll(controller.signal);
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('one-piece-achievements', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('one-piece-achievements', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [user?.id, poll]);
  useEffect(() => {
    if (!items.length) return;
    const timer = setTimeout(
      () => setItems((current) => current.slice(1)),
      9000,
    );
    return () => clearTimeout(timer);
  }, [items]);
  return (
    <div className="op-toasts" aria-live="polite">
      {items.map((item) => (
        <aside
          key={item.achievement_id}
          className={`op-toast op-rarity-${item.rarity}`}
        >
          <Trophy aria-hidden="true" />
          <div>
            <small>ДОСТИЖЕНИЕ ПОЛУЧЕНО</small>
            <strong>{item.name}</strong>
            <p>{item.description}</p>
            <a href="/achievements/one-piece">
              +{item.xp_awarded} XP · Открыть путешествие
            </a>
          </div>
          <button
            onClick={() =>
              setItems((current) =>
                current.filter((n) => n.achievement_id !== item.achievement_id),
              )
            }
            aria-label="Закрыть уведомление"
          >
            <X size={16} />
          </button>
        </aside>
      ))}
    </div>
  );
}
