'use client';
import { useEffect, useState } from 'react';
export function BattlepassProgress() {
  const [data, setData] = useState<{ season?: { title: string }; level: number; xp: number; nextXp: number } | null>(null);
  useEffect(() => { void fetch('/api/battlepass').then((r) => r.ok ? r.json() : null).then(setData).catch(() => {}); }, []);
  if (!data?.season) return null;
  return <a href="/battlepass" className="hub-button" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
    <span>AniMonster Pass · {data.season.title}</span><strong>Ур. {data.level}/40 · {data.nextXp ? `${data.nextXp} XP до следующего` : 'Все уровни открыты'}</strong>
  </a>;
}
