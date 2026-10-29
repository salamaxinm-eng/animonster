'use client';
import { FeedbackMessage } from '@/components/feedback-message';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useHalloween } from '@/components/halloween';
import { useHalloweenHunt } from '@/components/halloween-hunt';
import { prepareDoorCreak } from '@/lib/client/halloween-audio';
import type { Anime } from '@/lib/anime';
function ReturnSpirit() {
  return (
    <svg viewBox="0 0 110 170" aria-hidden="true">
      <path
        fill="#241932"
        d="M6 165q-4-39 8-63L30 48q8-36 29-34 24 0 30 36l18 115z"
      />
      <ellipse cx="58" cy="59" rx="23" ry="32" fill="#f1e7e3" />
      <path
        d="M43 50h9m13 0h9M51 76q7 5 14 0"
        stroke="#35263c"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M44 59l7 9m22-9l-7 9" stroke="#a492bd" strokeWidth="4" />
    </svg>
  );
}
export function HalloweenCursor() {
  const { active, motion } = useHalloween();
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active || !motion) return;
    const fine = matchMedia('(hover:hover) and (pointer:fine)');
    const hide = () => {
      setVisible(false);
      document.documentElement.removeAttribute('data-hw-cursor');
    };
    const move = (event: PointerEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest('[data-hw-watch]')
          : null;
      const show =
        !!target &&
        !target.matches(':disabled,[aria-disabled="true"]') &&
        fine.matches;
      setVisible(show);
      document.documentElement.toggleAttribute('data-hw-cursor', show);
      if (show && ref.current)
        ref.current.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0)`;
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', hide);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', hide);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
      hide();
    };
  }, [active, motion]);
  return active ? (
    <span
      ref={ref}
      className={`hw-cursed-cursor${visible ? ' hw-cursor-on' : ''}`}
      aria-hidden="true"
    >
      <img src="/themes/halloween-2026/pumpkin-cursor.svg" alt="" />
    </span>
  ) : null;
}
export function HalloweenSearchTreat() {
  const { active, surprise } = useHalloween();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  if (!active) return null;
  async function random() {
    if (busy) return;
    setBusy(true);
    setError('');
    controller.current = new AbortController();
    try {
      const response = await fetch('/api/catalog?sort=rating', {
        signal: controller.current.signal,
      });
      if (!response.ok) throw Error();
      const data = (await response.json()) as Anime[];
      if (!data.length) throw Error();
      const anime = data[Math.floor(Math.random() * data.length)];
      surprise(() => location.assign('/anime/' + anime.id));
    } catch (error) {
      if ((error as Error).name !== 'AbortError')
        setError('Не удалось выбрать аниме. Попробуйте ещё раз.');
      setBusy(false);
    }
  }
  return (
    <div className="hw-search-treat">
      <img
        src="/themes/halloween-2026/pumpkin-cursor.svg"
        alt="Улыбающаяся тыква"
      />
      <strong>Сладость или гадость? Выбирай аниме!</strong>
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => void random()}
        data-hw-watch
      >
        {busy ? 'Выбираем…' : 'Случайное аниме'}
      </button>
      {error && <p role="alert"><FeedbackMessage>{error}</FeedbackMessage></p>}
    </div>
  );
}
export function HalloweenPlayerEcho({
  mediaRef,
  expanded = false,
}: {
  mediaRef: RefObject<HTMLVideoElement | null>;
  expanded?: boolean;
}) {
  const { active, calm } = useHalloween();
  const [echo, setEcho] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    previous = useRef(expanded);
  useEffect(() => {
    if (!active || calm) return;
    let away = false,
      full = !!document.fullscreenElement;
    const show = () => {
      if (timer.current) clearTimeout(timer.current);
      setEcho(true);
      timer.current = setTimeout(() => setEcho(false), 1200);
    };
    const visibility = () => {
      if (document.hidden) away = true;
      else if (away) {
        away = false;
        show();
      }
    };
    const fullscreen = () => {
      const next = !!document.fullscreenElement;
      if (full && !next) show();
      full = next;
    };
    const video = mediaRef.current;
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('fullscreenchange', fullscreen);
    video?.addEventListener('webkitendfullscreen', show);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', fullscreen);
      video?.removeEventListener('webkitendfullscreen', show);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, calm, mediaRef]);
  useEffect(() => {
    const collapsed = previous.current && !expanded;
    previous.current = expanded;
    if (!active || calm || !collapsed) return;
    setEcho(true);
    const t = setTimeout(() => setEcho(false), 1200);
    return () => clearTimeout(t);
  }, [active, calm, expanded]);
  return active && !calm && echo ? (
    <div className="hw-player-echo" role="status">
      <ReturnSpirit />
      <span>Не забудь вернуться</span>
    </div>
  ) : null;
}
export function HalloweenFooterCandle() {
  const { active, calm } = useHalloween(),
    hunt = useHalloweenHunt();
  const [busy, setBusy] = useState(false),
    [dark, setDark] = useState(false),
    [notice, setNotice] = useState('');
  const alive = useRef(true);
  const pending = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    sound = useRef<ReturnType<typeof prepareDoorCreak> | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      sound.current?.dispose();
    };
  }, []);
  if (!active) return null;
  async function extinguish() {
    if (pending.current || hunt.candleUsed || !hunt.ready) return;
    pending.current = true;
    setBusy(true);
    setNotice('');
    sound.current = calm ? null : prepareDoorCreak();
    try {
      await hunt.light();
      if (!alive.current) {
        sound.current?.dispose();
        return;
      }
      setDark(true);
      try {
        sound.current?.play();
      } catch {
        sound.current?.dispose();
      }
      timer.current = setTimeout(() => {
        setDark(false);
        setNotice('Свет вернулся. А ты?.. С Хэллоуином!');
        pending.current = false;
        setBusy(false);
      }, 3000);
    } catch (error) {
      sound.current?.dispose();
      setNotice((error as Error).message);
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className={`hw-footer-candle${hunt.candleUsed ? ' hw-candle-used' : ''}`}
        aria-label={
          hunt.candleUsed ? 'Свеча уже гасила свет сегодня' : 'Погасить свечу'
        }
        title={hunt.candleUsed ? 'Возвращайтесь завтра' : 'Секретная свеча'}
        disabled={!hunt.ready || busy || hunt.candleUsed}
        onClick={() => void extinguish()}
      >
        <span className="hw-candle-flame" />
        <span className="hw-candle-wax" />
      </button>
      {(dark || notice) &&
        createPortal(
          <>
            {dark && <div className="hw-footer-darkness" aria-hidden="true" />}
            {notice && (
              <div className="hw-light-notice" role="status">
                <p><FeedbackMessage>{notice}</FeedbackMessage></p>
                <button type="button" onClick={() => setNotice('')}>
                  Закрыть
                </button>
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  );
}
export function HalloweenPageEnd() {
  const { active, motion } = useHalloween();
  return active ? (
    <div className="hw-page-end">
      <ReturnSpirit />
      <button
        type="button"
        onClick={() =>
          window.scrollTo({ top: 0, behavior: motion ? 'smooth' : 'auto' })
        }
      >
        Дальше аниме нет. Вернись наверх ↑
      </button>
    </div>
  ) : null;
}
