'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  demoProgressKey,
  validDemoProgress,
  type DemoProgress,
  type DemoRoomSnapshot,
} from '@/lib/demo-session';

async function request<T>(url: string, input?: unknown): Promise<T> {
  const response = await fetch(url, {
    ...(input
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }
      : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  const value = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(value.error || 'Не удалось выполнить действие'),
      { status: response.status },
    );
  return value;
}
export function useDemoProgress(userId: string | undefined, loaded: boolean) {
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<Record<string, DemoProgress>>({});
  const store = useRef<Record<string, DemoProgress>>({});
  const sent = useRef(0);
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    setReady(false);
    let local: Record<string, DemoProgress> = {};
    try {
      const value = JSON.parse(
        localStorage.getItem(demoProgressKey(userId)) || '{}',
      );
      for (const item of Object.values(value)) {
        if (validDemoProgress(item)) local[item.episode] = item;
      }
    } catch {}
    store.current = local;
    setItems(local);
    const hydrate = async () => {
      if (userId) {
        try {
          const remote = await request<{ items: DemoProgress[] }>(
            '/api/player-demo/progress',
          );
          if (cancelled) return;
          for (const item of remote.items) {
            if (
              validDemoProgress(item) &&
              (!local[item.episode] ||
                item.updatedAt > local[item.episode].updatedAt)
            )
              local[item.episode] = item;
          }
          local = { ...local };
          // Flush locally newer offline progress without replacing newer records on the server.
          for (const item of Object.values(local)) {
            void request('/api/player-demo/progress', item).catch(() => {});
          }
        } catch {}
      }
      if (cancelled) return;
      store.current = local;
      setItems(local);
      setReady(true);
      try {
        localStorage.setItem(demoProgressKey(userId), JSON.stringify(local));
      } catch {}
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [userId, loaded]);
  const save = useCallback(
    (item: DemoProgress, flush = false) => {
      if (!validDemoProgress(item)) return;
      store.current = { ...store.current, [item.episode]: item };
      setItems(store.current);
      try {
        localStorage.setItem(
          demoProgressKey(userId),
          JSON.stringify(store.current),
        );
      } catch {}
      if (userId && (flush || Date.now() - sent.current > 10000)) {
        sent.current = Date.now();
        void fetch('/api/player-demo/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
          keepalive: true,
        }).catch(() => {});
      }
    },
    [userId],
  );
  return { ready, items, save };
}

export function useDemoRoom(userId?: string) {
  const [requested, setRequested] = useState('');
  const [snapshot, setSnapshot] = useState<DemoRoomSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = useRef(snapshot);
  current.current = snapshot;
  const clockOffset = useRef(0);
  const pending = useRef<Record<string, unknown> | null>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (!userId) {
      current.current = null;
      setSnapshot(null);
      pending.current = null;
    }
  }, [userId]);
  const accept = useCallback((next: DemoRoomSnapshot) => {
    clockOffset.current = next.serverTime - Date.now();
    if (
      current.current &&
      next.room.code === current.current.room.code &&
      next.room.version < current.current.room.version
    )
      return;
    current.current = next;
    setSnapshot(next);
    setError('');
  }, []);
  function changeUrl(code: string) {
    const url = new URL(location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    history.replaceState(null, '', url);
    setRequested(code);
  }
  useEffect(() => {
    const code = new URL(location.href).searchParams.get('room') || '';
    if (/^[a-f0-9]{24}$/.test(code)) setRequested(code);
  }, []);
  useEffect(() => {
    if (!requested || !userId) return;
    let cancelled = false;
    void request<DemoRoomSnapshot>('/api/player-demo/party?code=' + requested)
      .then((value) => {
        if (!cancelled) accept(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [requested, userId, accept]);
  useEffect(() => {
    if (!snapshot || !userId) return;
    const code = snapshot.room.code;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let heartbeat = 0;
    const poll = async () => {
      try {
        const next =
          Date.now() - heartbeat > 15000
            ? await request<DemoRoomSnapshot>('/api/player-demo/party', {
                action: 'heartbeat',
                code,
              })
            : await request<DemoRoomSnapshot>(
                '/api/player-demo/party?code=' + code,
              );
        if (Date.now() - heartbeat > 15000) heartbeat = Date.now();
        if (!cancelled) accept(next);
      } catch (cause) {
        if (!cancelled) {
          setError((cause as Error).message);
          if ((cause as { status?: number }).status === 404) {
            setSnapshot(null);
            current.current = null;
            return;
          }
        }
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [snapshot?.room.code, userId, accept]);
  useEffect(
    () => () => {
      if (sendTimer.current) clearTimeout(sendTimer.current);
    },
    [],
  );
  async function action(input: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const next = await request<DemoRoomSnapshot>(
        '/api/player-demo/party',
        input,
      );
      accept(next);
      changeUrl(next.room.code);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const queue = useCallback(
    (state: {
      episode: number;
      position: number;
      playing: boolean;
      rate: number;
    }) => {
      if (!current.current?.host) return;
      pending.current = state;
      const send = async () => {
        if (sending.current || !pending.current || !current.current?.host)
          return;
        sending.current = true;
        const input = pending.current;
        pending.current = null;
        try {
          accept(
            await request<DemoRoomSnapshot>('/api/player-demo/party', {
              ...input,
              action: 'state',
              code: current.current.room.code,
              version: current.current.room.version,
            }),
          );
        } catch (cause) {
          setError((cause as Error).message);
          try {
            if (current.current)
              accept(
                await request<DemoRoomSnapshot>(
                  '/api/player-demo/party?code=' + current.current.room.code,
                ),
              );
          } catch {}
        } finally {
          sending.current = false;
          if (pending.current)
            sendTimer.current = setTimeout(() => void send(), 100);
        }
      };
      if (sendTimer.current) clearTimeout(sendTimer.current);
      sendTimer.current = setTimeout(() => void send(), 100);
    },
    [accept],
  );
  return {
    snapshot,
    requested,
    error,
    busy,
    queue,
    clockOffset,
    isSending: () => sending.current || pending.current !== null,
    create: (episode: number, position: number) =>
      action({ action: 'create', episode, position }),
    join: () => action({ action: 'join', code: requested }),
    leave: async () => {
      if (snapshot) {
        try {
          await request('/api/player-demo/party', {
            action: 'leave',
            code: snapshot.room.code,
          });
        } catch (cause) {
          setError((cause as Error).message);
          return;
        }
      }
      current.current = null;
      setSnapshot(null);
      changeUrl('');
    },
  };
}
