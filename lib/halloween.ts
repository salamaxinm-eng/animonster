// Event ends after November 3, 2026 in the site's owner's time zone (UTC+05).
export const HALLOWEEN_START = Date.parse('2026-10-26T19:00:00Z');
export const HALLOWEEN_END = Date.parse('2026-11-03T19:00:00Z');
export const HALLOWEEN_CALM_KEY = 'animonster-halloween-calm-2026';
export const halloweenActive = (time = Date.now()) =>
  time >= HALLOWEEN_START && time < HALLOWEEN_END;
// Runs before first paint; cached HTML must not keep the event alive after expiration.
export const halloweenBootstrap = `(()=>{const r=document.documentElement,t=Date.now();if(t>=${HALLOWEEN_START}&&t<${HALLOWEEN_END})r.dataset.halloween='2026';else delete r.dataset.halloween;try{if(localStorage.getItem('${HALLOWEEN_CALM_KEY}')==='1')r.dataset.hwCalm='1';}catch{}})();`;
export const pumpkinPhrases = [
  'Ты точно пришёл смотреть аниме?',
  'Ещё один клик — и я выбираю аниме за тебя.',
  'Я тыква, а не кнопка «Следующая серия».',
  'Рюк просил яблоко. Мне достаточно внимания.',
  'Опенинг уже закончился. А ты всё ещё здесь.',
  'Спойлер: у этой тыквы счастливый финал.',
  'Субару бы уже начал новый круг. Ты всё кликаешь.',
  'Проверь плеер. Там тоже кто-то прячется.',
  'Обещаю не рассказывать, сколько раз ты нажал.',
  'Серия сама себя не посмотрит.',
  'Ведьминский совет: чай, плед и ещё одна серия.',
  'Банкай! Ладно, я просто светящаяся тыква.',
  'Не буди летучих мышей. Они тоже в онгоинге.',
  'Кажется, у нас начинается тыквенная арка.',
  'Твой клик принят. Контракт с тыквой заключён.',
  'Мой план на вечер: светиться и не спойлерить.',
  'За яблоком — к Рюку. За аниме — в плеер.',
  'Если это филлер, то очень уютный.',
  'Секретный босс сайта найден. Урон наносится кликами.',
  'Последняя серия? Мы оба знаем, чем это закончится.',
] as const;
export const pumpkinPhrase = (clicks: number) =>
  clicks < 5
    ? null
    : pumpkinPhrases[(Math.floor(clicks) - 5) % pumpkinPhrases.length];

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
