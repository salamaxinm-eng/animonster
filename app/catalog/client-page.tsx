'use client';
import { SlidersHorizontal } from 'lucide-react';
import { AnimeGrid } from '@/components/anime-grid';
import { CommunityHeader } from '@/components/community/context';
import { MobileCatalogTabs } from '@/components/mobile-catalog-tabs';
import { CatalogPagination } from '@/components/catalog-pagination';
import { listingUrl } from '@/lib/seo';
import type { Anime } from '@/lib/anime';
export default function CatalogPage({
  initialItems: items,
  initialPages: pages,
  initialTab: tab,
  initialPage: page,
  initialSort: sort,
}: {
  initialItems: Anime[];
  initialPages: number;
  initialTab: 'all' | 'ongoing';
  initialPage: number;
  initialSort: 'rating' | 'fresh';
}) {
  return (
    <div className="site-shell mobile-catalog-page">
      <CommunityHeader />
      <main className="title-page">
        <MobileCatalogTabs active={tab} />
        <div className="mobile-catalog-toolbar">
          <h1>
            {tab === 'ongoing' ? 'Онгоинги' : 'Каталог аниме'}
            {page > 1 ? ' — страница ' + page : ''}
          </h1>
          <button
            onClick={() => {
              location.href = listingUrl(
                '/catalog',
                1,
                tab,
                sort === 'rating' ? 'fresh' : 'rating',
              );
            }}
          >
            <SlidersHorizontal />{' '}
            {sort === 'rating' ? 'По рейтингу' : 'Сначала новые'}
          </button>
        </div>
        <AnimeGrid items={items} />
        <CatalogPagination
          path="/catalog"
          page={page}
          pages={pages}
          tab={tab}
          sort={sort}
        />
      </main>
    </div>
  );
}
