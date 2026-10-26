// Event ends after November 3, 2026 in the site's owner's time zone (UTC+05).
export const HALLOWEEN_START = Date.parse('2026-10-26T19:00:00Z');
export const HALLOWEEN_END = Date.parse('2026-11-03T19:00:00Z');
export const HALLOWEEN_CALM_KEY = 'animonster-halloween-calm-2026';
export const halloweenActive = (time = Date.now()) =>
  time >= HALLOWEEN_START && time < HALLOWEEN_END;
// Runs before first paint; cached HTML must not keep the event alive after expiration.
export const halloweenBootstrap = `(()=>{const r=document.documentElement,t=Date.now();if(t>=${HALLOWEEN_START}&&t<${HALLOWEEN_END})r.dataset.halloween='2026';else delete r.dataset.halloween;try{if(localStorage.getItem('${HALLOWEEN_CALM_KEY}')==='1')r.dataset.hwCalm='1';}catch{}})();`;
export const pumpkinFace = (clicks: number) =>
  Math.max(0, Math.floor(clicks)) % 5;

// Navigation happens exactly once. Fast repeated clicks cannot queue multiple pages.
export function createHalloweenSurprise(
  schedule: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>,
  cancel: (timer: ReturnType<typeof setTimeout>) => void,
  show: (visible: boolean) => void,
) {
  let busy = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (callback: () => void, ms: number) => {
    const timer = schedule(() => {
      timers.delete(timer);
      callback();
    }, ms);
    timers.add(timer);
  };
  return {
    run(action: () => void, animate: boolean) {
      if (busy) return false;
      if (!animate) {
        action();
        return true;
      }
      busy = true;
      show(true);
      later(action, 460);
      later(() => {
        busy = false;
        show(false);
      }, 1050);
      return true;
    },
    dispose() {
      for (const timer of timers) cancel(timer);
      timers.clear();
      busy = false;
    },
  };
}
