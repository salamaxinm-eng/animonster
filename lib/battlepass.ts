export const PASS_LEVELS = 40;
export const PASS_LEVEL_XP = 400;
export const PASS_PRICE = 1499;
export type PassTask = { id: string; title: string; metric: 'seconds' | 'days' | 'titles' | 'episodes'; target: number; xp: number };
export const PASS_TASKS: Record<'daily' | 'weekly' | 'seasonal', PassTask[]> = {
  daily: [
    { id: 'minutes5', title: 'Посмотреть 5 минут', metric: 'seconds', target: 300, xp: 50 },
    { id: 'minutes20', title: 'Посмотреть 20 минут', metric: 'seconds', target: 1200, xp: 50 },
    { id: 'minutes40', title: 'Посмотреть 40 минут', metric: 'seconds', target: 2400, xp: 100 },
  ],
  weekly: [
    { id: 'minutes120', title: 'Посмотреть 120 минут', metric: 'seconds', target: 7200, xp: 300 },
    { id: 'days3', title: 'По 20 минут в 3 разных дня', metric: 'days', target: 3, xp: 250 },
    { id: 'genre3', title: '3 разные серии выбранного жанра', metric: 'episodes', target: 3, xp: 150 },
    { id: 'titles3', title: 'По 20 минут у 3 разных тайтлов', metric: 'titles', target: 3, xp: 200 },
  ],
  seasonal: [
    { id: 'minutes600', title: 'Посмотреть 600 минут', metric: 'seconds', target: 36000, xp: 600 },
    { id: 'minutes1200', title: 'Посмотреть 1 200 минут', metric: 'seconds', target: 72000, xp: 600 },
    { id: 'days15', title: 'По 20 минут в 15 разных дней', metric: 'days', target: 15, xp: 600 },
    { id: 'days25', title: 'По 20 минут в 25 разных дней', metric: 'days', target: 25, xp: 600 },
  ],
};
export type PassStats = { seconds: number; days: Record<string, number>; titles: Record<string, number>; episodes: number };
export const emptyStats = (): PassStats => ({ seconds: 0, days: {}, titles: {}, episodes: 0 });
export function taskProgress(stats: PassStats, task: PassTask) {
  if (task.metric === 'days') return Object.values(stats.days).filter((n) => n >= 1200).length;
  if (task.metric === 'titles') return Object.values(stats.titles).filter((n) => n >= 1200).length;
  return stats[task.metric];
}
export function passLevel(xp: number) { return Math.min(PASS_LEVELS, Math.floor(Math.max(0, xp) / PASS_LEVEL_XP)); }
const formatters = new Map<string, Intl.DateTimeFormat>();
export function passDay(time: number, zone: string) {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(zone, format);
  }
  const parts = format.formatToParts(time);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
}
export function addDays(day: string, days: number) { return new Date(Date.parse(day + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10); }
// Find the first UTC instant belonging to a local date, including DST boundaries.
export function dayStart(day: string, zone: string) {
  const centre = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(centre) || new Date(centre).toISOString().slice(0, 10) !== day) throw new Error('Некорректная дата');
  let lo = centre - 36 * 3600000, hi = centre + 36 * 3600000;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (passDay(mid, zone) < day) lo = mid; else hi = mid; }
  if (passDay(hi, zone) !== day) throw new Error('Дата не существует в выбранной часовой зоне');
  return hi;
}
export function seasonDates(day: string, zone: string) { return { starts_at: dayStart(day, zone), ends_at: dayStart(addDays(day, 56), zone) }; }
export function passWeek(time: number, start: number, zone: string) {
  return Math.floor((Date.parse(passDay(time, zone)) - Date.parse(passDay(start, zone))) / (7 * 86400000)) + 1;
}
export type Range = [number, number];
export function mergeCoverage(ranges: Range[], next: Range, duration: number) {
  const result: Range[] = [];
  for (const range of [...ranges, [Math.max(0, next[0]), Math.min(duration, next[1])] as Range].filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]); else result.push([...range]);
  }
  return result;
}
export function coverageSeconds(ranges: Range[]) { return ranges.reduce((sum, [a, b]) => sum + b - a, 0); }
// Sparse or discontinuous samples establish a new baseline; they never award a seek.
export function confirmedDelta(previous: { t: number; p: number }, sample: { t: number; p: number }) {
  const wall = (sample.t - previous.t) / 1000, movement = sample.p - previous.p;
  return wall > 0 && wall <= 5 && movement > 0 && movement <= wall * 1.25 + 0.25 ? Math.min(wall, movement) : 0;
}
