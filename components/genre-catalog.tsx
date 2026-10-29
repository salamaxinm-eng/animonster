import type { Anime } from '@/lib/anime';
import { AnimeGrid } from './anime-grid';
import { CatalogPagination } from './catalog-pagination';
export function GenreCatalog({
  genre,
  items,
  page,
  pages,
}: {
  genre: string;
  items: Anime[];
  page: number;
  pages: number;
}) {
  return (
    <>
      {items.length ? <AnimeGrid items={items} /> : <p>Тайтлов пока нет.</p>}
      <CatalogPagination
        path={'/genres/' + encodeURIComponent(genre)}
        page={page}
        pages={pages}
      />
    </>
  );
}
