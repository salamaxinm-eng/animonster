'use client';

import { useEffect, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { Avatar, UserTag, useCommunity } from './context';

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

export function RewardsPanel({
  onEquipped,
}: {
  onEquipped?: () => Promise<void>;
}) {
  const community = useCommunity();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [cosmetics, setCosmetics] = useState<Cosmetic[]>([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<Cosmetic['kind']>('frame');

  useEffect(() => {
    void Promise.all([
      fetch('/api/achievements').then((response) => response.json()),
      fetch('/api/cosmetics').then((response) => response.json()),
    ])
      .then(([progress, catalog]) => {
        setAchievements(progress.achievements || []);
        setCosmetics(catalog.cosmetics || []);
      })
      .catch(() => {
        setFailed(true);
        setNotice('Не удалось загрузить награды. Обновите страницу.');
      })
      .finally(() => setLoading(false));
  }, []);

  async function equip(item: Cosmetic) {
    if (pending) return;
    setPending(item.id);
    setNotice('');
    setFailed(false);
    try {
      const response = await fetch('/api/cosmetics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.kind, slug: item.slug }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Награда пока недоступна');
      }
      await community.refresh();
      await onEquipped?.();
      setNotice(`${item.name} установлено`);
    } catch (error) {
      setFailed(true);
      setNotice(
        error instanceof Error
          ? error.message
          : 'Не удалось установить украшение',
      );
    } finally {
      setPending(null);
    }
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
      {notice && (
        <p
          role={failed ? 'alert' : 'status'}
          className={failed ? 'error-msg' : 'success-msg'}
        >
          {notice}
        </p>
      )}
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
      <nav className="admin-tool-tabs" aria-label="Тип украшений">
        {(
          [
            ['frame', 'Рамки'],
            ['tag', 'Теги'],
            ['pin', 'Пины'],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="reward-grid cosmetics-reward-grid">
        {cosmetics
          .filter((item) => item.kind === kind)
          .map((item) => (
            <article
              className={`reward-card cosmetic-card rarity-${item.rarity} ${item.unlocked ? 'unlocked' : ''}`}
              key={item.id}
            >
              <small className="cosmetic-rarity">
                {{
                  common: 'Обычная',
                  rare: 'Редкая',
                  epic: 'Эпическая',
                  legendary: 'Легендарная',
                }[item.rarity] || item.rarity}
              </small>
              <div
                className={`cosmetic-preview profile-frame-${item.kind === 'frame' ? item.slug : 'none'}`}
              >
                {item.kind === 'frame' ? (
                  <Avatar avatar={community.user?.avatar} large />
                ) : item.kind === 'tag' ? (
                  <UserTag id={item.slug} />
                ) : item.image ? (
                  <img src={item.image} alt="" />
                ) : (
                  <span>{item.kind}</span>
                )}
              </div>
              <strong>{item.name}</strong>
              <p>{item.description || item.condition}</p>
              <small>
                {item.unlocked ? `Получено · ${item.source}` : item.condition}
              </small>
              {item.unlocked && (
                <button
                  type="button"
                  disabled={
                    !!pending ||
                    (item.kind === 'frame'
                      ? community.user?.profile_frame
                      : community.user?.[item.kind]) === item.slug
                  }
                  onClick={() => void equip(item)}
                >
                  {pending === item.id
                    ? 'Устанавливаем…'
                    : (item.kind === 'frame'
                          ? community.user?.profile_frame
                          : community.user?.[item.kind]) === item.slug
                      ? 'Установлено ✓'
                      : 'Установить'}
                </button>
              )}
            </article>
          ))}
      </div>
    </section>
  );
}
