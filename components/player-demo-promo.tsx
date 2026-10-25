'use client';
import { useEffect, useState } from 'react';

export function PlayerDemoPromo() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/player-demo', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((response) => {
        if (response.ok) setAvailable(true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (!available) return null;
  return (
    <a className="demo-promo" href="/player-demo">
      <span>
        <small>ANIMONSTER LAB · УЖЕ МОЖНО ПОПРОБОВАТЬ</small>
        <strong>Знакомься: наш собственный плеер</strong>
        <p>Re:Zero · Сезон одной лентой · Несколько озвучек · Бесплатно для всех</p>
      </span>
      <span>Попробовать плеер ↗</span>
    </a>
  );
}
