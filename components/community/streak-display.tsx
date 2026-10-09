'use client';

import { useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { streakAsset, type Streak } from '@/lib/streak';

function dayWord(days: number) {
  const plural = new Intl.PluralRules('ru').select(days);
  return plural === 'one' ? 'день' : plural === 'few' ? 'дня' : 'дней';
}

export function StreakDisplay({ streak }: { streak: Streak }) {
  const source = streakAsset(streak.tier);
  const [missingAsset, setMissingAsset] = useState(false);
  useEffect(() => setMissingAsset(false), [source]);

  return (
    <section className={`profile-streak profile-streak-tier-${streak.tier} ${streak.current ? '' : 'profile-streak-inactive'}`} aria-label="Ежедневный огонёк">
      <span className="profile-streak-art" aria-hidden="true">
        {missingAsset ? (
          <Flame className="profile-streak-fallback" strokeWidth={1.8} />
        ) : (
          <img src={source} alt="" onError={() => setMissingAsset(true)} />
        )}
      </span>
      <div className="profile-streak-copy">
        {streak.current ? (
          <strong><span>{streak.current}</span> {dayWord(streak.current)} подряд</strong>
        ) : (
          <strong>Начни серию просмотра</strong>
        )}
        {(streak.current > 0 || streak.longest > 0) && (
          <small>Лучший: {streak.longest} {dayWord(streak.longest)}</small>
        )}
      </div>
    </section>
  );
}
