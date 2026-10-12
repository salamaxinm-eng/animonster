'use client';
import { useEffect, useRef, useState } from 'react';
import { passWatchReporter } from '@/lib/client/pass-watch';
export function usePassWatch(user: string | undefined, anime: number | undefined, episode: number | undefined, provider: string, voiceover: string) {
  const reporter = useRef<ReturnType<typeof passWatchReporter> | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setNotice('');
    if (!user || !anime || !episode) return;
    const value = passWatchReporter({ anime, episode, provider, voiceover }, setNotice);
    reporter.current = value;
    const timer = setInterval(() => void value.flush(), 10000);
    const flush = () => void value.flush();
    window.addEventListener('pagehide', flush);
    return () => { value.stop(); reporter.current = null; clearInterval(timer); window.removeEventListener('pagehide', flush); };
  }, [user, anime, episode, provider, voiceover]);
  return { sample: (position: number) => reporter.current?.sample(position), notice };
}
