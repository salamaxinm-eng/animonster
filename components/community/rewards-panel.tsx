'use client';

import { useEffect, useState } from 'react';
import { Avatar, UserTag, useCommunity } from './context';

type Achievement = {
  id: string;
  name: string;
  description: string;
  threshold: number;
  progress: number;
  completed: boolean;
  anime_id: number | null;
  rewards: { kind: string; slug: string; name: string; image: string | null }[];
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
  const [source, setSource] = useState('all');

  useEffect(() => {
    async function loadRewards() {
      // Achievement evaluation grants rewards before the inventory is read.
      const progressResponse = await fetch('/api/achievements');
      if (!progressResponse.ok) throw new Error('Achievements unavailable');
      const progress = await progressResponse.json();
      const catalogResponse = await fetch('/api/cosmetics');
      if (!catalogResponse.ok) throw new Error('Cosmetics unavailable');
      return [progress, await catalogResponse.json()];
    }
    void loadRewards()
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
      setNotice(`Установлено: ${item.name}`);
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
          <p>
            Любимые истории становятся частью твоего профиля. Награды за
            достижения и друзей — навсегда.
          </p>
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
            <div className="achievement-loot">
              {item.rewards?.map((reward) =>
                reward.kind === 'frame' ? (
                  <span
                    key={reward.slug}
                    className={`achievement-frame-preview profile-frame-${reward.slug}`}
                    title={reward.name}
                  >
                    <Avatar avatar={community.user?.avatar} />
                  </span>
                ) : reward.kind === 'pin' && reward.image ? (
                  <img key={reward.slug} src={reward.image} alt={reward.name} />
                ) : (
                  <UserTag key={reward.slug} id={reward.slug} />
                ),
              )}
            </div>
            <strong>{item.name}</strong>
            <p>{item.description}</p>
            <progress
              aria-label={`Прогресс: ${item.name}`}
              max={item.threshold}
              value={Math.min(item.progress, item.threshold)}
            />
            <small>
              {item.completed
                ? 'Получено'
                : `${item.progress} / ${item.threshold} серий`}
            </small>
            <small className="achievement-reward-names">
              Награда: {item.rewards?.map((reward) => reward.name).join(' + ')}
            </small>
            {item.anime_id && !item.completed && (
              <a className="achievement-watch" href={`/anime/${item.anime_id}`}>
                Смотреть аниме →
              </a>
            )}
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
      <nav className="reward-source-tabs" aria-label="Как получить украшение">
        {[
          ['all', 'Все'],
          ['achievement', 'За аниме'],
          ['referral', 'За друзей'],
            ['plus', 'Plus'],
            ['purchase', 'Годовой Plus'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={source === value}
            onClick={() => setSource(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="reward-grid cosmetics-reward-grid">
        {cosmetics
          .filter(
            (item) =>
              item.kind === kind &&
              (source === 'all' || item.source === source),
          )
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
                {item.unlocked
                  ? `Доступно · ${{ achievement: 'за достижение', referral: 'за друзей', plus: 'Plus', free: 'для всех', admin: 'награда' }[item.source] || 'награда'}`
                  : item.condition}
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
