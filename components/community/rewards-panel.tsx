'use client';

import { useEffect, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { useCommunity } from './context';

type Achievement = {
  id: string;
  name: string;
  description: string;
  threshold: number;
  progress: number;
  completed: boolean;
};
type Cosmetic = {
  id: string;
  kind: 'tag' | 'pin' | 'frame';
  slug: string;
  name: string;
  description: string;
  rarity: string;
  source: string;
  condition: string;
  unlocked: boolean;
  image?: string | null;
};

export function RewardsPanel() {
  const community = useCommunity();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [cosmetics, setCosmetics] = useState<Cosmetic[]>([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      fetch('/api/achievements').then((response) => response.json()),
      fetch('/api/cosmetics').then((response) => response.json()),
    ])
      .then(([progress, catalog]) => {
        setAchievements(progress.achievements || []);
        setCosmetics(catalog.cosmetics || []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function equip(item: Cosmetic) {
    const response = await fetch('/api/cosmetics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: item.kind, slug: item.slug }),
    });
    const result = await response.json();
    if (!response.ok) {
      setNotice(result.error || 'Награда пока недоступна');
      return;
    }
    await community.refresh();
    setNotice(`${item.name} установлено`);
  }

  if (loading)
    return (
      <section className="social-panel rewards-panel">Загрузка наград…</section>
    );

  return (
    <section className="social-panel rewards-panel">
      <header>
        <div>
          <h2>Награды</h2>
          <p>Достижения и редкая косметика AniMonster.</p>
        </div>
        <a href="/referrals">Пригласить друзей</a>
      </header>
      {notice && <p className="success-msg">{notice}</p>}
      <h3>Достижения</h3>
      <div className="reward-grid">
        {achievements.map((item) => (
          <article
            className={item.completed ? 'reward-card unlocked' : 'reward-card'}
            key={item.id}
          >
            <span>{item.completed ? <Check /> : <Lock />}</span>
            <strong>{item.name}</strong>
            <p>{item.description}</p>
            <progress
              max={item.threshold}
              value={Math.min(item.progress, item.threshold)}
            />
            <small>
              {item.completed
                ? 'Получено'
                : `${item.progress} / ${item.threshold} серий`}
            </small>
          </article>
        ))}
      </div>
      <h3>Косметика</h3>
      <div className="reward-grid cosmetics-reward-grid">
        {cosmetics.map((item) => (
          <article
            className={item.unlocked ? 'reward-card unlocked' : 'reward-card'}
            key={item.id}
          >
            {item.image ? (
              <img src={item.image} alt="" />
            ) : (
              <span>{item.kind}</span>
            )}
            <strong>{item.name}</strong>
            <p>{item.description || item.condition}</p>
            <small>
              {item.unlocked ? `Получено · ${item.source}` : item.condition}
            </small>
            {item.unlocked && (
              <button type="button" onClick={() => void equip(item)}>
                Установить
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
