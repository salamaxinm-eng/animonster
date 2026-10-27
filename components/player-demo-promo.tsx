'use client';
import { PlayerCatalogFundingBar } from '@/components/player-catalog-funding';
import { HalloweenPumpkin } from '@/components/halloween';
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
    <section className="demo-promo" aria-label="Собственный плеер AniMonster">
      <div className="demo-promo-header">
        <a className="demo-promo-copy" href="/player-demo">
          <small>ANIMONSTER LAB · УЖЕ МОЖНО ПОПРОБОВАТЬ</small>
          <strong>Знакомься: наш собственный плеер</strong>
          <p>
            Re:Zero · Сезон одной лентой · Несколько озвучек · Бесплатно для
            всех
          </p>
        </a>
        <div className="demo-promo-actions">
          <a className="demo-promo-cta" href="/player-demo">
            Попробовать плеер ↗
          </a>
          <HalloweenPumpkin />
        </div>
      </div>
      <PlayerCatalogFundingBar />
    </section>
  );
}
