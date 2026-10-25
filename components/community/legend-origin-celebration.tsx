'use client';
import { useEffect, useState } from 'react';
import { Crown, Flame, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { UserNickname } from '@/components/user-nickname';
import type { Profile } from '@/lib/community';

export function LegendOriginCelebration({ user }: { user: Profile }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false,
      timer: ReturnType<typeof setInterval> | undefined;
    const controller = new AbortController();
    void fetch('/api/rewards/legend-origin', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((state) => {
        if (cancelled || !state?.pending) return;
        const reveal = () => {
          if (
            document.visibilityState !== 'visible' ||
            document.fullscreenElement ||
            document.querySelector('[role="dialog"],dialog[open]')
          )
            return;
          setOpen(true);
          if (timer) clearInterval(timer);
        };
        timer = setInterval(reveal, 1500);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [user.id]);
  const acknowledge = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/rewards/legend-origin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!response.ok) throw new Error();
      setOpen(false);
    } catch {
      setError(
        'Не удалось сохранить. Попробуй ещё раз — твои награды уже выданы.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) void acknowledge();
      }}
    >
      <DialogContent
        className="legend-origin-dialog"
        overlayClassName="legend-origin-overlay"
        showCloseButton={false}
      >
        <div className="legend-origin-embers" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 37) % 100}%`,
                animationDelay: `${i * 0.31}s`,
                animationDuration: `${4 + (i % 4)}s`,
              }}
            />
          ))}
        </div>
        <div className="legend-origin-hero">
          <span className="legend-origin-kicker">
            <Flame size={14} /> ИМЯ В ИСТОРИИ ANIMONSTER
          </span>
          <DialogTitle>
            <UserNickname user={user} />, это пламя — твоё
          </DialogTitle>
          <img
            className="legend-origin-art"
            src="/rewards/legend-origin/tag-v1.png"
            alt="Уникальный тег Исток легенды"
            width={2171}
            height={724}
          />
        </div>
        <DialogDescription className="legend-origin-intro">
          Есть поддержка, которую помнишь всегда.
        </DialogDescription>
        <div className="legend-origin-letter">
          <p>
            Ты оказал самую большую финансовую поддержку на старте. Но за этой
            помощью стоит нечто большее: доверие к идее и к человеку, который
            пытается воплотить её в жизнь. Когда впереди ещё столько
            неизвестного, такая поддержка даёт силы продолжать.
          </p>
          <p>
            Этот уникальный тег — твоё место в истории AniMonster. А пожизненная
            премиум-подписка — моя благодарность за то, что ты был рядом в самом
            начале.
          </p>
          <p>
            Спасибо, что помог зажечь это пламя. Часть его света всегда будет
            твоей.
          </p>
        </div>
        <div className="legend-origin-gifts">
          <span>
            <Flame size={17} /> Исток легенды
          </span>
          <span>
            <Sparkles size={17} /> Золотой ник
          </span>
          <span>
            <Crown size={17} /> Plus навсегда
          </span>
        </div>
        {error && (
          <p className="error-msg" role="alert">
            {error}
          </p>
        )}
        <button
          className="legend-origin-accept"
          type="button"
          disabled={busy}
          onClick={() => void acknowledge()}
        >
          {busy ? 'Сохраняем…' : 'Спасибо, я сохраню этот свет'}
        </button>
        <small className="legend-origin-signature">
          С благодарностью, создатель AniMonster
        </small>
      </DialogContent>
    </Dialog>
  );
}
