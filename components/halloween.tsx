'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { HalloweenHorrorPrize } from '@/components/halloween-random';
import { Ghost } from 'lucide-react';
import { usePathname } from 'next/navigation';
import {
  createHalloweenSurprise,
  halloweenActive,
  HALLOWEEN_END,
  HALLOWEEN_CALM_KEY,
  pumpkinFace,
  pumpkinPhrase,
} from '@/lib/halloween';

type Season = {
  active: boolean;
  calm: boolean;
  motion: boolean;
  blocked: boolean;
  fullscreen: boolean;
  surprise: (action: () => void) => void;
  toggleCalm: () => void;
};
const SeasonContext = createContext<Season>({
  active: false,
  calm: false,
  motion: false,
  blocked: false,
  fullscreen: false,
  surprise: (action) => action(),
  toggleCalm: () => {},
});
export const useHalloween = () => useContext(SeasonContext);

export function HalloweenProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false),
    [calm, setCalm] = useState(false),
    [reduced, setReduced] = useState(true),
    [visible, setVisible] = useState(true);
  const [blocked, setBlocked] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [veil, setVeil] = useState(false);
  const transition = useRef<ReturnType<typeof createHalloweenSurprise> | null>(
    null,
  );
  useEffect(() => {
    transition.current = createHalloweenSurprise(
      (fn, ms) => setTimeout(fn, ms),
      clearTimeout,
      setVeil,
    );
    return () => {
      transition.current?.dispose();
      transition.current = null;
    };
  }, []);
  useEffect(() => {
    const update = () => {
      setActive(halloweenActive());
      setReady(true);
    };
    update();
    const interval = setInterval(update, 60000);
    const remaining = HALLOWEEN_END - Date.now();
    const expiry =
      remaining > 0 && remaining < 2147483647
        ? setTimeout(update, remaining + 10)
        : null;
    const visibility = () => {
      setVisible(!document.hidden);
      update();
    };
    document.addEventListener('visibilitychange', visibility);
    visibility();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches);
    motion();
    media.addEventListener('change', motion);
    try {
      setCalm(localStorage.getItem(HALLOWEEN_CALM_KEY) === '1');
    } catch {}
    return () => {
      clearInterval(interval);
      if (expiry) clearTimeout(expiry);
      document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', motion);
    };
  }, []);
  useEffect(() => {
    let nativeFullscreen = false;
    const update = () => {
      const full =
        !!document.fullscreenElement ||
        nativeFullscreen ||
        !!document.pictureInPictureElement;
      setFullscreen(full);
      setBlocked(
        full ||
          [...document.querySelectorAll('video')].some(
            (video) => !video.paused && !video.ended,
          ),
      );
    };
    const nativeBegin = () => {
        nativeFullscreen = true;
        update();
      },
      nativeEnd = () => {
        nativeFullscreen = false;
        update();
      };
    const events = [
      'play',
      'pause',
      'ended',
      'emptied',
      'fullscreenchange',
      'enterpictureinpicture',
      'leavepictureinpicture',
    ];
    for (const event of events) document.addEventListener(event, update, true);
    document.addEventListener('webkitbeginfullscreen', nativeBegin, true);
    document.addEventListener('webkitendfullscreen', nativeEnd, true);
    update();
    return () => {
      for (const event of events)
        document.removeEventListener(event, update, true);
      document.removeEventListener('webkitbeginfullscreen', nativeBegin, true);
      document.removeEventListener('webkitendfullscreen', nativeEnd, true);
    };
  }, [pathname]);
  const motion = active && !calm && !reduced && visible;
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    if (active) root.dataset.halloween = '2026';
    else delete root.dataset.halloween;
    if (!motion) root.dataset.hwCalm = '1';
    else delete root.dataset.hwCalm;
    if (blocked) root.dataset.hwMedia = '1';
    else delete root.dataset.hwMedia;
    return () => {
      delete root.dataset.halloween;
      delete root.dataset.hwCalm;
      delete root.dataset.hwMedia;
    };
  }, [active, motion, blocked, ready]);
  function toggleCalm() {
    setCalm((old) => {
      const next = !old;
      try {
        localStorage.setItem(HALLOWEEN_CALM_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  }
  function surprise(action: () => void) {
    const animate =
      motion && !blocked && !document.querySelector('[role="dialog"]');
    if (transition.current) transition.current.run(action, animate);
    else action();
  }
  return (
    <SeasonContext.Provider
      value={{
        active,
        calm,
        motion,
        blocked,
        fullscreen,
        surprise,
        toggleCalm,
      }}
    >
      {children}
      {active && (
        <>
          <HalloweenDecor />
          {veil && (
            <div className="hw-shadow-veil" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <ShadowHand key={i} index={i} />
              ))}
            </div>
          )}
        </>
      )}
    </SeasonContext.Provider>
  );
}

function WitchGhost() {
  return (
    <svg viewBox="0 0 64 72" aria-hidden="true" className="hw-witch-ghost">
      <path fill="#ad75f5" d="M15 60V38a17 17 0 0134 0v23l-8-6-9 7-9-7z" />
      <g className="hw-ghost-eyes" fill="#fff4e8">
        <ellipse cx="25" cy="40" rx="2.5" ry="4" />
        <ellipse cx="39" cy="40" rx="2.5" ry="4" />
      </g>
      <path
        d="M28 49q4 4 8 0"
        fill="none"
        stroke="#5a267f"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g className="hw-witch-hat">
        <path fill="#ec792a" d="M20 25L31 2l4 10 10 14z" />
        <path fill="#fda13c" d="M8 29q23-14 49 0-23 9-49 0" />
        <path fill="#37203c" d="M23 20l17-1 3 6-22 1z" />
        <rect
          x="29"
          y="19"
          width="7"
          height="6"
          rx="1"
          fill="none"
          stroke="#ffcf7c"
          strokeWidth="1.7"
        />
      </g>
      <path
        className="hw-ghost-hand"
        d="M46 46q12-9 2-17"
        stroke="#b98bff"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function SeasonalBrand({ mobile = false }: { mobile?: boolean }) {
  const { active } = useHalloween();
  const [hiding, setHiding] = useState(false);
  useEffect(() => {
    if (!hiding) return;
    const timer = setTimeout(() => setHiding(false), 1400);
    return () => clearTimeout(timer);
  }, [hiding]);
  const word = (
    <span>Ani{mobile ? <strong>Monster</strong> : <span>Monster</span>}</span>
  );
  if (!active)
    return (
      <a
        className={mobile ? 'mobile-brand' : 'brand'}
        href="/"
        aria-label="AniMonster — главная"
      >
        <Ghost
          aria-hidden="true"
          size={mobile ? 29 : 30}
          fill="currentColor"
          strokeWidth={1.7}
        />
        {word}
      </a>
    );
  return (
    <div className={`hw-brand-lockup${mobile ? ' hw-brand-mobile' : ''}`}>
      <button
        type="button"
        className={`hw-brand-ghost${hiding ? ' hw-ghost-hiding' : ''}`}
        aria-label="Спрятать призрака за AniMonster"
        onClick={() => {
          setHiding(true);
        }}
      >
        <WitchGhost />
      </button>
      <a
        className={mobile ? 'mobile-brand' : 'brand'}
        href="/"
        aria-label="AniMonster — главная"
      >
        {word}
      </a>
      <HalloweenBrandApple />
    </div>
  );
}

function Bat() {
  return (
    <svg viewBox="0 0 100 46" aria-hidden="true">
      <path
        d="M49 18l-7-11 1 14C28 7 14 7 0 0l12 35q9-13 18 2 10-9 16 7h8q6-16 16-7 9-15 18-2L100 0C86 7 72 7 57 21l1-14-7 11z"
        fill="currentColor"
      />
    </svg>
  );
}
function Ryuk() {
  return (
    <svg viewBox="0 0 120 230" aria-hidden="true">
      <path
        fill="#090711"
        d="M40 63L20 37l20 9-5-23 16 12L57 3l10 31 20-22-4 28 25-8-22 29 4 22 20 13-12 8 13 15-19 1 15 19-20-2 10 19-20-5 8 59-16-13-4 34-9-24-12 12-2-60-20 7 6-23-19 4 10-22-13 1 11-17-13-7 25-16z"
      />
      <path fill="#e84839" d="M44 56l12 4-8 5zm33-1l-12 5 8 4z" />
      <path
        d="M45 76q15 11 30-2"
        fill="none"
        stroke="#a9a0b5"
        strokeWidth="2"
      />
      <path d="M32 120L8 177l8 7 30-53m37-13l27 56-8 9-34-55" fill="#090711" />
    </svg>
  );
}
function Pumpkin({ face }: { face: number }) {
  return (
    <svg viewBox="0 0 80 78" aria-hidden="true">
      <path
        d="M39 18q-4-11 6-15"
        stroke="#63834a"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="40" cy="46" rx="34" ry="28" fill="#da6320" />
      <ellipse cx="40" cy="46" rx="23" ry="28" fill="#ef842a" />
      <ellipse cx="40" cy="46" rx="12" ry="28" fill="#fa9739" />
      {face === 0 ? (
        <g fill="#ffefb0">
          <path d="M17 36l15 6-15 5zm46 0l-15 6 15 5z" />
          <path d="M19 53l12 4 9-4 9 4 12-4-9 12H28z" />
        </g>
      ) : face === 1 ? (
        <g fill="#ffefb0">
          <path
            d="M18 40q7-9 14 0m16 0q7-9 14 0"
            stroke="#ffefb0"
            fill="none"
            strokeWidth="4"
          />
          <path d="M23 52q17 24 34 0z" />
        </g>
      ) : face === 2 ? (
        <g fill="#ffefb0">
          <ellipse cx="25" cy="40" rx="5" ry="7" />
          <ellipse cx="55" cy="40" rx="5" ry="7" />
          <ellipse cx="40" cy="58" rx="6" ry="8" />
        </g>
      ) : face === 3 ? (
        <g fill="#ffefb0">
          <path d="M17 40l15 5M48 45l15-5" stroke="#ffefb0" strokeWidth="4" />
          <path d="M22 58l10-5 8 5 8-5 10 5-7 7H29z" />
        </g>
      ) : (
        <g fill="#ffefb0">
          <path
            d="M17 39q8-10 15 0"
            stroke="#ffefb0"
            strokeWidth="4"
            fill="none"
          />
          <ellipse cx="55" cy="39" rx="5" ry="6" />
          <path d="M26 54q14 16 28 0z" />
        </g>
      )}
    </svg>
  );
}
function HalloweenBrandApple() {
  const { active, blocked } = useHalloween();
  const [ryuk, setRyuk] = useState(false);
  useEffect(() => {
    if (!ryuk) return;
    const timer = setTimeout(() => setRyuk(false), 1250);
    return () => clearTimeout(timer);
  }, [ryuk]);
  if (!active) return null;
  return (
    <span className="hw-brand-apple">
      <button
        type="button"
        className={`hw-apple${ryuk ? ' hw-apple-eaten' : ''}`}
        aria-label="Взять яблоко Рюка"
        disabled={ryuk || blocked}
        onClick={() => setRyuk(true)}
      >
        <svg viewBox="0 0 50 55" aria-hidden="true">
          <path
            d="M26 13q-1-9 7-11"
            stroke="#6d8b45"
            strokeWidth="4"
            fill="none"
          />
          <path
            d="M25 17C0-1 0 39 17 49q8 5 10-1c17 10 31-39 11-35-5 0-10 5-13 4"
            fill="#ed4939"
          />
          <path
            d="M13 20q-5 5-3 12"
            stroke="#ffb49a"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {ryuk && !blocked && (
        <span className="hw-ryuk" aria-hidden="true">
          <Ryuk />
        </span>
      )}
      <span className="hw-sr-only" role="status">
        {ryuk ? 'Яблоко исчезло. Из тени появился Рюк.' : ''}
      </span>
    </span>
  );
}
export function HalloweenPumpkin() {
  const { active, calm, toggleCalm } = useHalloween();
  const [clicks, setClicks] = useState(0),
    [hint, setHint] = useState(false);
  const phrase = pumpkinPhrase(clicks + 4);
  useEffect(() => {
    if (!phrase) return;
    setHint(true);
    const timer = setTimeout(() => setHint(false), 4500);
    return () => clearTimeout(timer);
  }, [clicks, phrase]);
  if (!active) return null;
  return (
    <div className="hw-promo-pumpkin">
      <button
        type="button"
        className="hw-pumpkin"
        aria-label="Поговорить с тыквой"
        onClick={() => setClicks((value) => value + 1)}
      >
        <Pumpkin face={pumpkinFace(clicks)} />
      </button>
      <button
        type="button"
        className="hw-calm-toggle"
        aria-pressed={calm}
        aria-label={
          calm
            ? 'Включить хэллоуинскую анимацию'
            : 'Отключить фоновую хэллоуинскую анимацию'
        }
        title={calm ? 'Включить анимацию' : 'Тихий режим'}
        onClick={toggleCalm}
      >
        {calm ? 'Оживить' : 'Тише'}
      </button>
      {hint && phrase && clicks < 20 && (
        <span role="status" className="hw-pumpkin-hint">
          {phrase}
        </span>
      )}
      {clicks >= 20 && <HalloweenHorrorPrize/>}
    </div>
  );
}
function HalloweenDecor() {
  const { motion, blocked } = useHalloween();
  if (!motion || blocked) return null;
  return (
    <div className="hw-ambient" aria-hidden="true">
      <i className="hw-bat hw-bat-one">
        <Bat />
      </i>
      <i className="hw-bat hw-bat-two">
        <Bat />
      </i>
    </div>
  );
}
function ShadowHand({ index }: { index: number }) {
  return (
    <svg
      className="hw-shadow-hand"
      viewBox="0 0 120 240"
      style={{ '--hand-index': index } as CSSProperties}
      aria-hidden="true"
    >
      <path
        d="M35 240l-4-91-19-28Q2 108 8 105q6-5 14 7l13 17-9-83q-2-17 5-17t10 16l9 60-1-88q0-17 7-17t7 17l5 86 9-77q2-18 9-15t5 18l-3 83 10-49q3-15 10-12t4 17l-6 89-19 36 2 63z"
        fill="#05030b"
      />
    </svg>
  );
}
export function PlayerHalloweenVisitor({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { active, motion, fullscreen } = useHalloween();
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!active || !motion || fullscreen || disabled) return;
    let hide: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      if (document.hidden) return;
      setPeek(true);
      hide = setTimeout(() => setPeek(false), 3400);
    };
    const first = setTimeout(show, 18000);
    const interval = setInterval(show, 57000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      if (hide) clearTimeout(hide);
      setPeek(false);
    };
  }, [active, motion, fullscreen, disabled]);
  if (!active || !motion || fullscreen || disabled) return null;
  return (
    <span
      className={`hw-player-edge${peek ? ' hw-player-peek' : ''}`}
      aria-hidden="true"
    >
      <Ghost fill="#d8c3fa" stroke="#754b9d" />
    </span>
  );
}
