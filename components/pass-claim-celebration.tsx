'use client';

import type { CSSProperties, RefObject } from 'react';
import { Check, Crown, Sparkles, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import type { PassReward } from '@/lib/server/battlepass';
import { PassImage } from './pass-image';

export const claimRewardKey = (reward: Pick<PassReward, 'season_id' | 'level' | 'track' | 'cosmetic_id'>) => `${reward.season_id}:${reward.level}:${reward.track}:${reward.cosmetic_id}`;
const kinds = { pin: 'Пин', frame: 'Рамка', tag: 'Тег', background: 'Фон профиля', plus: 'AniMonster Plus' };

export function PassClaimCelebration({ rewards, onClose, returnFocus }: {
  rewards: PassReward[];
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const premium = rewards.some(reward => reward.track === 'premium');
  return <Dialog open={rewards.length > 0} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={`pass-claim-dialog ${premium ? 'premium' : 'free'}`} finalFocus={returnFocus} showCloseButton={false}>
      <DialogClose render={<Button type="button" variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Закрыть окно наград" />}><X size={18} aria-hidden="true" /></DialogClose>
      <div className="pass-claim-heading">
        <span className="pass-claim-kicker"><Sparkles size={14} aria-hidden="true" /> ТВОЯ КОЛЛЕКЦИЯ РАСТЁТ</span>
        <DialogTitle>Награды получены</DialogTitle>
        <DialogDescription>Добавлено в аккаунт: {rewards.length}. Твои новые трофеи уже ждут тебя.</DialogDescription>
      </div>
      <div className="pass-claim-stage">
        <div className="pass-claim-sparks" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => {
          const angle = i * Math.PI / 8;
          return <i key={i} style={{ '--spark-x': `${Math.cos(angle) * (100 + i % 3 * 30)}px`, '--spark-y': `${Math.sin(angle) * (100 + i % 3 * 30)}px` } as CSSProperties} />;
        })}</div>
        <div className={`pass-claim-grid${rewards.length === 1 ? ' single' : ''}`}>
          {rewards.map((reward, i) => <article key={claimRewardKey(reward)} className={`pass-claim-item ${reward.track} ${reward.kind}`} style={{ '--reveal-delay': `${Math.min(i * 65, 400)}ms` } as CSSProperties}>
            <div className="pass-claim-item-meta"><span>{kinds[reward.kind]}</span><span>{reward.level} ур.</span></div>
            <div className="pass-claim-art">{reward.kind === 'plus' ? <div className="pass-claim-plus"><Crown size={42} aria-hidden="true" /><strong>+{reward.plus_days}</strong><span>дня Плюса</span></div> : <PassImage src={reward.preview} alt={reward.name} size={rewards.length === 1 ? 512 : 256} sizes={rewards.length === 1 ? '360px' : '220px'} loading={rewards.length === 1 ? 'eager' : 'lazy'} />}</div>
            <h3>{reward.name}</h3><span className="pass-claim-received"><Check size={13} aria-hidden="true" /> Получено</span>
          </article>)}
        </div>
      </div>
      <div className="pass-claim-actions">
        <Button type="button" onClick={onClose}>Отлично</Button>
        {rewards.some(reward => reward.kind !== 'plus') && <a href="/profile?section=appearance">Перейти к оформлению →</a>}
      </div>
    </DialogContent>
  </Dialog>;
}
