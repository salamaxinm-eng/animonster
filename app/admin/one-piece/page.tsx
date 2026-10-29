'use client';
import { FeedbackMessage } from '@/components/feedback-message';
import { useEffect, useState } from 'react';
import { CommunityHeader } from '@/components/community/context';
type Rule = {
  code: string;
  name: string;
  description: string;
  rarity: string;
  xp_reward: number;
  active: number;
  condition_config: unknown;
};
export default function Page() {
  const [rules, setRules] = useState<Rule[]>([]),
    [selected, setSelected] = useState(''),
    [draft, setDraft] = useState<Rule | null>(null),
    [condition, setCondition] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/one-piece/admin', { signal: controller.signal })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        setRules(b);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  function choose(code: string) {
    const rule = rules.find((r) => r.code === code) || null;
    setSelected(code);
    setDraft(rule);
    setCondition(JSON.stringify(rule?.condition_config || {}, null, 2));
    setError('');
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...draft,
        active: !!draft.active,
        condition_config: JSON.parse(condition),
      };
      const r = await fetch('/api/one-piece/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setRules((items) =>
        items.map((item) =>
          item.code === draft.code
            ? { ...draft, condition_config: payload.condition_config }
            : item,
        ),
      );
      setError('Сохранено. Уже выданные XP и награды сохраняются.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="site-shell">
      <CommunityHeader />
      <main className="title-page">
        <a href="/admin">← Администрирование</a>
        <h1>Достижения One Piece</h1>
        <p className="muted">
          Условия проверяются только сервером. Секретные названия видны здесь
          только администраторам. Эталонные списки арок версионируются в
          config/one-piece.
        </p>
        {error && <p role="status"><FeedbackMessage>{error}</FeedbackMessage></p>}
        <label>
          Достижение{' '}
          <select value={selected} onChange={(e) => choose(e.target.value)}>
            <option value="">Выбрать…</option>
            {rules.map((r) => (
              <option value={r.code} key={r.code}>
                {r.code} · {r.name}
              </option>
            ))}
          </select>
        </label>
        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            style={{ display: 'grid', gap: 16, maxWidth: 760, marginTop: 20 }}
          >
            <label>
              Название{' '}
              <input
                value={draft.name}
                maxLength={100}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Описание{' '}
              <textarea
                value={draft.description}
                maxLength={1000}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <label>
              XP{' '}
              <input
                type="number"
                min={0}
                max={10000}
                value={draft.xp_reward}
                onChange={(e) =>
                  setDraft({ ...draft, xp_reward: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Редкость{' '}
              <select
                value={draft.rarity}
                onChange={(e) => setDraft({ ...draft, rarity: e.target.value })}
              >
                {['common', 'rare', 'epic', 'legendary', 'mythic'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked ? 1 : 0 })
                }
              />{' '}
              Доступно для получения
            </label>
            <label>
              Условие JSON{' '}
              <textarea
                rows={12}
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                spellCheck={false}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
