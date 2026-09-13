'use client';

import { useEffect, useState } from 'react';
import { BuySubscription } from './buy-subscription';
import { proxyImageUrl } from '@/lib/anime';

export function PlusCollections() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    fetch('/api/plus-collections')
      .then((response) => response.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  if (!rows) return <p>Загружаем подборки…</p>;
  if (!rows.length) return <p className="muted">Первая подборка готовится.</p>;
  return (
    <div className="plus-collection-grid">
      {rows.map((row) => (
        <article className="social-panel plus-collection" key={row.id}>
          {row.cover && <img src={row.cover} alt="" />}
          <h2>{row.title}</h2>
          <p>{row.description}</p>
          {row.locked ? (
            <div className="plus-collection-lock">
              <span>Список тайтлов доступен с Plus</span>
              <BuySubscription className="primary" />
            </div>
          ) : (
            <div className="plus-collection-items">
              {row.items.map((item: any) => {
                const anime = item.anime;
                return (
                  <a href={`/anime/${item.anime_id}`} key={item.anime_id}>
                    {anime?.image?.original && (
                      <img src={proxyImageUrl(anime.image.original)} alt="" />
                    )}
                    <strong>
                      {anime?.russian ||
                        anime?.name ||
                        `Аниме #${item.anime_id}`}
                    </strong>
                  </a>
                );
              })}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
