type Sample = { t: number; p: number };
type Selection = { anime: number; episode: number; provider: string; voiceover: string };
// Only playback samples count. No focus/visibility gate, including iframe fullscreen.
export function passWatchReporter(selection: Selection, notify: (message: string) => void = () => {}) {
  let token = '', origin = 0, seq = 1, starting = false, sending = false, stopped = false, retryAt = 0;
  let queue: Sample[] = [], pending: Sample[] | null = null;
  async function start() {
    if (starting || stopped || Date.now() < retryAt) return;
    starting = true;
    try {
      const response = await fetch('/api/battlepass/watch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', ...selection }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Учёт пропуска временно недоступен');
      if (!stopped) { token = data.token || ''; origin = performance.now(); seq = 1; }
      if (token) notify(data.durationKnown ? '' : 'AniMonster Pass: минуты учитываются. Для жанрового задания длительность этой серии ещё не подтверждена каталогом.');
      if (!token) retryAt = Date.now() + 60000;
    } catch (error) { retryAt = Date.now() + 30000; notify((error as Error).message); }
    finally { starting = false; }
  }
  async function flush() {
    if (!token || sending || (!pending && !queue.length)) return;
    sending = true;
    pending ||= queue.splice(0, 120);
    try {
      const response = await fetch('/api/battlepass/watch', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, seq, samples: pending }) });
      const data = await response.json();
      if (response.ok) { pending = null; seq++; if (data.ended) { token = ''; retryAt = Date.now() + 60000; } }
      else if (response.status < 500) { token = ''; queue = []; pending = null; retryAt = Date.now() + 5000; notify(data.error || 'Учёт просмотра переподключается'); }
    } catch { /* Retry the identical sequence. The server deduplicates it. */ }
    finally { sending = false; }
  }
  return {
    sample(position: number) {
      if (stopped || !Number.isFinite(position) || position < 0) return;
      if (!token) { void start(); return; }
      const t = Math.floor(performance.now() - origin), last = queue.at(-1) || pending?.at(-1);
      if (last && (t <= last.t || t - last.t < 200)) return;
      if (queue.length >= 120) queue = [queue.at(-1)!];
      queue.push({ t, p: position });
      if (queue.length >= 20 || t - queue[0].t >= 10000) void flush();
    },
    flush,
    stop() { stopped = true; void flush(); },
  };
}
