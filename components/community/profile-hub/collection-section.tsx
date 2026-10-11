'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import type { Profile } from '@/lib/community';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { CosmeticVisual } from './cosmetic-visual';
import {
  Empty,
  FilterTabs,
  ResourceState,
  equipped,
  rarityLabels,
  sectionHref,
  useResource,
  type Cosmetic,
} from './shared';

const sourceNames: Record<string, string> = {
  free: 'Доступно всем',
  plus: 'AniMonster Plus',
  achievement: 'Достижение',
  referral: 'Приглашение друзей',
  purchase: 'Покупка',
  admin: 'Награда администрации',
  founder: 'Founding 10',
  fundraising: 'Поддержка проекта',
  battlepass: 'AniMonster Pass',
};
export function CollectionSection({
  user,
  revision,
}: {
  user: Profile;
  revision: number;
}) {
  const resource = useResource<{ cosmetics: Cosmetic[] }>(
    '/api/profile-hub?kind=inventory',
    revision,
  );
  const [kind, setKind] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [selected, setSelected] = useState<Cosmetic | null>(null);
  const available =
    resource.data?.cosmetics.filter((item) => item.unlocked) || [];
  const filtered = available.filter(
    (item) =>
      (kind === 'all' || item.kind === kind) &&
      (rarity === 'all' || item.rarity === rarity),
  );
  const rarities = Array.from(new Set(available.map((item) => item.rarity)));
  return (
    <>
      <div className="hub-section-title">
        <p className="hub-lead">
          Ваши предметы и оформление, доступное с текущим уровнем и подпиской.
        </p>
        <Link className="hub-button" href={sectionHref('appearance')}>
          Настроить профиль
        </Link>
      </div>
      <ResourceState {...resource} />
      {!resource.loading && !resource.error && (
        <>
          <FilterTabs
            options={[
              ['all', 'Все'],
              ['pin', 'Пины'],
              ['frame', 'Рамки'],
              ['background', 'Фоны'],
              ['tag', 'Теги'],
              ['theme', 'Темы'],
            ]}
            value={kind}
            onChange={setKind}
            label="Категории предметов"
          />
          <div className="hub-filters">
            <label className="hub-select-label">
              Редкость
              <select
                value={rarity}
                onChange={(event) => setRarity(event.target.value)}
              >
                <option value="all">Все значения</option>
                {rarities.map((value) => (
                  <option key={value} value={value}>
                    {rarityLabels[value] || value}
                  </option>
                ))}
              </select>
            </label>
            <span className="hub-count">Предметов: {filtered.length}</span>
          </div>
          {filtered.length ? (
            <div className="hub-item-grid">
              {filtered.map((item) => (
                <button
                  className={`hub-item hub-item-button rarity-${item.rarity}`}
                  key={item.id}
                  onClick={() => setSelected(item)}
                >
                  <CosmeticVisual item={item} user={user} />
                  <strong>{item.name}</strong>
                  <small>{rarityLabels[item.rarity] || item.rarity}</small>
                  {equipped(item, user) && (
                    <span className="hub-equipped">
                      <Check size={14} aria-hidden="true" />
                      Установлено
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <Empty>В этой категории пока нет доступных предметов.</Empty>
          )}
          <Link className="hub-support-link" href={sectionHref('achievements')}>
            Посмотреть награды за достижения →
          </Link>
        </>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="hub-dialog">
          {selected && (
            <>
              <DialogTitle>{selected.name}</DialogTitle>
              <DialogDescription>
                {selected.description || selected.condition}
              </DialogDescription>
              <CosmeticVisual item={selected} user={user} />
              <p>
                Редкость: {rarityLabels[selected.rarity] || selected.rarity}
              </p>
              <p>
                Источник: {sourceNames[selected.source] || selected.condition}
              </p>
              {equipped(selected, user) && (
                <p className="hub-equipped">
                  <Check size={14} />
                  Установлено в профиле
                </p>
              )}
              <Link className="hub-primary" href={sectionHref('appearance')}>
                Перейти к оформлению
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
