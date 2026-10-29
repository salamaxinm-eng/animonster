'use client';
import { useEffect, useRef, useState } from 'react';
import { passWatchReporter } from '@/lib/client/pass-watch';
import { ONE_PIECE_ID } from '@/lib/one-piece';

export function useOnePieceWatch(
  user: string | undefined,
  anime: number | undefined,
  episode: number | undefined,
  provider: string,
  voiceover: string,
) {
  const reporter = useRef<ReturnType<typeof passWatchReporter> | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setNotice('');
    if (!user || anime !== ONE_PIECE_ID || !episode) return;
    setNotice(
      'Достижения One Piece: ждём события просмотра и длительность от плеера.',
    );
    const value = passWatchReporter(
      { anime, episode, provider, voiceover },
      setNotice,
      {
        endpoint: '/api/one-piece/watch',
        requireDuration: true,
        onResponse: (data) => {
          if (data.unlocked?.length)
            window.dispatchEvent(new Event('one-piece-achievements'));
        },
      },
    );
    reporter.current = value;
    const timer = setInterval(() => void value.flush(), 10000);
    const flush = () => void value.flush();
    window.addEventListener('pagehide', flush);
    return () => {
      value.stop();
      reporter.current = null;
      clearInterval(timer);
      window.removeEventListener('pagehide', flush);
    };
  }, [user, anime, episode, provider, voiceover]);
  return {
    notice,
    sample: (position: number, duration?: number, rate?: number) =>
      reporter.current?.sample(position, duration, rate),
  };
}
