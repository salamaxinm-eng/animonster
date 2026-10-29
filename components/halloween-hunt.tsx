'use client';
import { FeedbackMessage } from '@/components/feedback-message';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Ghost } from 'lucide-react';
import { useCommunity } from '@/components/community/context';
import { useHalloween } from '@/components/halloween';
import { HALLOWEEN_SPIRITS, halloweenLocalDay } from '@/lib/halloween';
const GUEST_KEY = 'animonster-halloween-spirits-2026';
type Hunt = {
  found: string[];
  awarded: boolean;
  ready: boolean;
  candleUsed: boolean;
  find: (id: string) => Promise<void>;
  light: () => Promise<{ day: string }>;
};
const Context = createContext<Hunt>({
  found: [],
  awarded: false,
  ready: false,
  candleUsed: false,
  find: async () => {},
  light: async () => {
    throw Error('Загрузка…');
  },
});
export const useHalloweenHunt = () => useContext(Context);
function readGuest(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(GUEST_KEY) || '[]');
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter((id) =>
              (HALLOWEEN_SPIRITS as readonly string[]).includes(id),
            ),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}
export function HalloweenHuntProvider({ children }: { children: ReactNode }) {
  const community = useCommunity(),
    { active } = useHalloween();
  const userId = community.user?.id || null;
  const [found, setFound] = useState<string[]>([]),
    [awarded, setAwarded] = useState(false),
    [ready, setReady] = useState(false),
    [candleUsed, setCandleUsed] = useState(false),
    [day, setDay] = useState(''),
    [message, setMessage] = useState('');
  const account = useRef(userId);
  account.current = userId;
  async function request(input: Record<string, unknown>, signal?: AbortSignal) {
    const response = await fetch('/api/halloween', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, userId }),
      signal: signal || AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (!response.ok)
      throw Object.assign(
        Error(data.error || 'Не удалось сохранить результат'),
        { code: data.code },
      );
    return data;
  }
  useEffect(() => {
    if (!community.loaded || !active) return;
    const controller = new AbortController();
    setReady(false);
    setFound([]);
    setAwarded(false);
    void (async () => {
      try {
        const response = await fetch('/api/halloween', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw Error();
        let data = await response.json();
        if (data.userId !== userId) return;
        const guest = readGuest();
        if (userId && data.active) {
          for (const id of guest)
            data = await request(
              { action: 'find', spirit: id },
              controller.signal,
            );
          if (guest.length) localStorage.removeItem(GUEST_KEY);
        }
        if (controller.signal.aborted || account.current !== userId) return;
        setFound(userId ? data.found : guest);
        setAwarded(data.awarded);
        setDay(data.day);
        setCandleUsed(data.candleUsed);
        if (userId && guest.length && data.awarded) {
          setMessage(
            'Все духи найдены! Значок «Ловец духов» сохранён в профиле.',
          );
          void community.refresh();
        }
      } catch {
        if (!controller.signal.aborted)
          setMessage(
            'Не удалось загрузить охоту за духами. Попробуйте обновить страницу.',
          );
      } finally {
        if (!controller.signal.aborted) setReady(true);
      }
    })();
    return () => controller.abort();
  }, [community.loaded, userId, active]);
  useEffect(() => {
    if (!day || !active) return;
    const boundary =
      Date.parse(day + 'T00:00:00+05:00') + 86400000 - Date.now();
    const timer = setTimeout(
      () => {
        setCandleUsed(false);
        setDay(halloweenLocalDay());
      },
      Math.max(100, boundary + 20),
    );
    return () => clearTimeout(timer);
  }, [day, active]);
  async function find(id: string) {
    if (
      !active ||
      found.includes(id) ||
      !(HALLOWEEN_SPIRITS as readonly string[]).includes(id)
    )
      return;
    if (!userId) {
      const next = [...new Set([...found, ...readGuest(), id])];
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify(next));
      } catch {}
      setFound(next);
      setMessage(
        `Найдено духов: ${next.length}/5. Войдите до конца праздника, чтобы сохранить значок.`,
      );
      return;
    }
    try {
      const data = await request({ action: 'find', spirit: id });
      if (account.current !== userId) return;
      setFound(data.found);
      setAwarded(data.awarded);
      setMessage(
        data.awarded
          ? 'Все пять духов найдены! Памятный значок появился в профиле.'
          : `Дух найден! Уже ${data.found.length}/5.`,
      );
      if (data.awarded) void community.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function light() {
    if (!ready || candleUsed) throw Error('Свеча уже гасила свет сегодня.');
    try {
      const data = await request({ action: 'candle' });
      if (account.current !== userId)
        throw Error('Аккаунт изменился. Обновите страницу.');
      setCandleUsed(true);
      setDay(data.day);
      return data;
    } catch (error) {
      if ((error as Error & { code?: string }).code === 'candle_used')
        setCandleUsed(true);
      throw error;
    }
  }
  return (
    <Context.Provider
      value={{ found, awarded, ready, candleUsed, find, light }}
    >
      {children}
      {active && message && (
        <div className="hw-hunt-toast" role="status">
          <p><FeedbackMessage>{message}</FeedbackMessage></p>
          {!userId && (
            <button type="button" onClick={community.login}>
              Войти
            </button>
          )}
          <button type="button" onClick={() => setMessage('')}>
            Закрыть
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function HiddenHalloweenSpirit({
  id,
}: {
  id: (typeof HALLOWEEN_SPIRITS)[number];
}) {
  const { active } = useHalloween();
  const hunt = useHalloweenHunt();
  const [busy, setBusy] = useState(false);
  if (!active || hunt.found.includes(id)) return null;
  return (
    <span className={`hw-spirit-hideout hw-spirit-${id}`}>
      <button
        type="button"
        aria-label="Найден скрытый дух"
        title="Кто здесь?"
        disabled={busy || !hunt.ready}
        onClick={() => {
          setBusy(true);
          void hunt.find(id).finally(() => setBusy(false));
        }}
      >
        <Ghost fill="#d5b5ff" stroke="#7c5a9b" />
      </button>
    </span>
  );
}
