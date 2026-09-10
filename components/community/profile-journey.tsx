'use client';
import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Trophy, Play } from 'lucide-react';
type Stats = {
  xp: number;
  level: number;
  nextLevelAt: number;
  seconds: number;
  favorites: number;
  visible: boolean;
  achievements: {
    id: string;
    title: string;
    current: number;
    target: number;
    unlocked: boolean;
  }[];
  history: {
    anime_id: number;
    episode: number;
    position: number;
    completed_episodes: number;
    anime?: { russian: string };
  }[];
};
export function ProfileJourney({
  id,
  revision,
}: {
  id: string;
  revision?: number;
}) {
  const [data, setData] = useState<Stats | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    fetch('/api/stats?id=' + encodeURIComponent(id))
      .then(async (r) => {
        const x = (await r.json()) as any;
        if (!r.ok) throw Error(x.error);
        if (alive) {
          setData(x);
          setError('');
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id, revision]);
  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <p role="status">Загружаем прогресс…</p>;
  const unlocked = data.achievements.filter((a) => a.unlocked).length;
  return (
    <section className="journey">
      <div className="journey-stats">
        <div>
          <span>УРОВЕНЬ</span>
          <strong>{data.level}</strong>
          <Progress value={(data.xp % 10) * 10} />
          <small>
            {data.xp} опыта · следующий уровень в {data.nextLevelAt}
          </small>
        </div>
        <div>
          <span>ПРОСМОТРЕНО СЕРИЙ</span>
          <strong>{data.xp}</strong>
        </div>
        <div>
          <span>ЧАСОВ АНИМЕ</span>
          <strong>{(data.seconds / 3600).toFixed(1)}</strong>
        </div>
        <div>
          <span>ДОСТИЖЕНИЙ</span>
          <strong>
            {unlocked}
            <small> / 20</small>
          </strong>
          <Progress value={(unlocked / 20) * 100} />
        </div>
      </div>
      <details className="social-panel">
        <summary>
          <Trophy size={18} /> Достижения · {unlocked} из 20
        </summary>
        <div className="achievement-grid">
          {data.achievements.map((a) => (
            <div
              className={'achievement ' + (a.unlocked ? 'unlocked' : '')}
              key={a.id}
            >
              <Trophy size={20} />
              <strong>{a.title}</strong>
              <Progress value={Math.min(100, (a.current / a.target) * 100)} />
              <small>
                {a.unlocked
                  ? 'Получено'
                  : Math.min(a.current, a.target) + ' / ' + a.target}
              </small>
            </div>
          ))}
        </div>
      </details>
      <details className="social-panel">
        <summary>
          <Play size={18} /> История и просмотренные аниме
        </summary>
        {!data.visible ? (
          <p>Списки скрыты владельцем профиля.</p>
        ) : data.history.length ? (
          <div className="history-list">
            {data.history.map((h) => (
              <a
                href={'/anime/' + h.anime_id + '?episode=' + h.episode}
                key={h.anime_id}
              >
                <strong>{h.anime?.russian || 'Аниме #' + h.anime_id}</strong>
                <span>
                  Серия {h.episode} · {Math.floor(h.position / 60)}:
                  {String(h.position % 60).padStart(2, '0')}
                </span>
                <small>Просмотрено {h.completed_episodes} серий</small>
              </a>
            ))}
          </div>
        ) : (
          <p>После начала просмотра здесь появится история.</p>
        )}
      </details>
    </section>
  );
}
