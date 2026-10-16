'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Avatar, CommunityHeader, useCommunity } from '@/components/community/context';

type Generation = {
  id: string; batch_id: string; anime: string; kind: 'pin' | 'frame'; rarity: 'common' | 'legendary';
  concept: string; model: string; status: 'draft' | 'published'; cosmetic_id: string | null;
  created_at: number; published_at: number | null;
};

async function read(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие');
  return data;
}

export function CosmeticGenerator() {
  const { user } = useCommunity();
  const [anime, setAnime] = useState(''), [kind, setKind] = useState<'pin' | 'frame'>('pin');
  const [rarity, setRarity] = useState<'common' | 'legendary' | 'both'>('both');
  const [commonIdea, setCommonIdea] = useState(''), [legendaryIdea, setLegendaryIdea] = useState('');
  const [reference, setReference] = useState<File | null>(null);
  const [items, setItems] = useState<Generation[]>([]), [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [recipient, setRecipient] = useState('');
  const load = useCallback(async () => {
    const data = await read(await fetch('/api/cosmetic-generator', { cache: 'no-store' }));
    setItems(data.generations); setConfigured(data.configured);
  }, []);
  useEffect(() => { void load().catch((e) => setMessage(e.message)); }, [load]);
  async function generate(e?: FormEvent, previous?: Generation) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true); setMessage('');
    const variants = previous ? [previous.rarity] : rarity === 'both' ? ['common', 'legendary'] as const : [rarity];
    const batch = crypto.randomUUID();
    try {
      for (const variant of variants) {
        setMessage(`Генерируется ${variant === 'common' ? 'обычный' : 'легендарный'} ${kind === 'pin' ? 'пин' : 'рамка'}…`);
        const form = new FormData();
        form.set('action', 'generate'); form.set('anime', previous?.anime || anime); form.set('kind', previous?.kind || kind);
        form.set('rarity', variant); form.set('batch', batch);
        form.set('idea', previous?.concept || (variant === 'common' ? commonIdea : legendaryIdea));
        if (reference) form.set('reference', reference);
        await read(await fetch('/api/cosmetic-generator', { method: 'POST', body: form }));
        await load();
      }
      setMessage('Готово. Проверьте каждую деталь в крупном размере перед публикацией.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка генерации'); }
    finally { setBusy(false); }
  }
  async function act(action: 'publish' | 'grant', id: string) {
    setBusy(true); setMessage('');
    try {
      const form = new FormData(); form.set('action', action); form.set('id', id);
      if (action === 'grant') form.set('user', recipient.trim());
      await read(await fetch('/api/cosmetic-generator', { method: 'POST', body: form }));
      await load(); setMessage(action === 'publish' ? 'Предмет добавлен в каталог. Пользователям он не выдан.' : 'Предмет выдан выбранному пользователю.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка сохранения'); }
    finally { setBusy(false); }
  }
  return <div className="site-shell"><CommunityHeader /><main className="generator-main">
    <div className="generator-top"><a href="/admin">← Админка</a><span>ANIMONSTER / МАСТЕРСКАЯ</span></div>
    <h1>Пины и рамки</h1>
    <p className="generator-lead">Пиксельные предметы в общей стилистике AniMonster. Генерации сохраняются как черновики; публикацию и выдачу вы подтверждаете отдельно.</p>
    {!configured && <p className="generator-notice">Генерация пока недоступна: на сервере нужен COSMETIC_IMAGE_API_KEY. Историю и опубликованные предметы можно просматривать.</p>}
    <div className="generator-layout"><section className="generator-form-panel"><h2>Новый предмет</h2>
      <form onSubmit={(event) => void generate(event)}>
        <label>Название аниме<input required maxLength={100} value={anime} onChange={(e) => setAnime(e.target.value)} placeholder="Например, Блич" /></label>
        <div className="generator-fields"><label>Тип<select value={kind} onChange={(e) => setKind(e.target.value as 'pin' | 'frame')}><option value="pin">Пин</option><option value="frame">Круглая рамка</option></select></label>
        <label>Редкость<select value={rarity} onChange={(e) => setRarity(e.target.value as 'common' | 'legendary' | 'both')}><option value="both">Обе</option><option value="common">Обычная</option><option value="legendary">Легендарная</option></select></label></div>
        {(rarity === 'both' || rarity === 'common') && <label>Идея обычного предмета <span>необязательно</span><textarea maxLength={300} value={commonIdea} onChange={(e) => setCommonIdea(e.target.value)} placeholder="Оставьте пустым для автоматического выбора символа" /></label>}
        {(rarity === 'both' || rarity === 'legendary') && <label>Идея легендарного предмета <span>необязательно</span><textarea maxLength={300} value={legendaryIdea} onChange={(e) => setLegendaryIdea(e.target.value)} placeholder="Другой сюжетный символ, а не усиленная копия обычного" /></label>}
        <label>Дополнительный референс <span>PNG, JPG или WebP · до 5 МБ</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setReference(e.target.files?.[0] || null)} /></label>
        <button className="generator-primary" type="submit" disabled={busy || !configured}>{busy ? 'Создаётся…' : 'Сгенерировать'}</button>
      </form><p className="generator-hint">Стиль задают прикреплённые референсы коллекции AniMonster. Пин: PNG 512×512. Рамка: PNG 1024×1024 с прозрачным центром.</p>
    </section><section className="generator-results"><div className="generator-result-heading"><h2>История генераций</h2><button onClick={() => void load()} disabled={busy}>Обновить</button></div>
      {message && <p className="generator-notice" role="status">{message}</p>}
      {!items.length && <p className="generator-empty">Пока нет генераций.</p>}
      <div className="generator-grid">{items.map((item) => <article key={item.id} className={`generator-card ${item.rarity}`}>
        <div className="generator-art">{item.kind === 'frame' ? <div className="generator-avatar"><Avatar avatar={user?.avatar || 'moon'} theme={user?.theme || 'eclipse'} large /><img className="generator-overlay" src={`/api/cosmetic-generator/assets/${item.id}`} alt="Примерка рамки" /></div> : <img className="generator-pin" src={`/api/cosmetic-generator/assets/${item.id}`} alt={item.concept} />}</div>
        <div className="generator-meta"><span>{item.kind === 'pin' ? 'ПИН' : 'РАМКА'} · {item.rarity === 'common' ? 'ОБЫЧНАЯ' : 'ЛЕГЕНДАРНАЯ'}</span><span>{item.status === 'published' ? 'В КАТАЛОГЕ' : 'ЧЕРНОВИК'}</span></div>
        <h3>{item.anime}</h3><p>{item.concept}</p><small>{new Date(item.created_at).toLocaleString('ru-RU')} · {item.model}</small>
        <div className="generator-actions"><a href={`/api/cosmetic-generator/assets/${item.id}`} target="_blank" rel="noreferrer">Крупно</a><a href={`/api/cosmetic-generator/assets/${item.id}`} download={`${item.anime}-${item.kind}-${item.rarity}.png`}>Скачать PNG</a>
          <button disabled={busy || !configured} onClick={() => void generate(undefined, item)}>Повторить</button>
          {item.status === 'draft' && <button disabled={busy} onClick={() => void act('publish', item.id)}>Сохранить в каталог</button>}</div>
        {item.status === 'published' && <div className="generator-grant"><label>ID пользователя<input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="ID аккаунта" /></label><button disabled={busy || !recipient.trim()} onClick={() => void act('grant', item.id)}>Выдать</button></div>}
      </article>)}</div>
    </section></div>
  </main></div>;
}
