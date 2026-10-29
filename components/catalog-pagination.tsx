import { listingUrl } from '@/lib/seo';
export function CatalogPagination({
  path,
  page,
  pages,
  tab = 'all',
  sort = 'rating',
}: {
  path: string;
  page: number;
  pages: number;
  tab?: string;
  sort?: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="catalog-pagination" aria-label="Страницы каталога">
      {page > 1 ? (
        <a
          className="primary"
          rel="prev"
          href={listingUrl(path, page - 1, tab, sort)}
        >
          Назад
        </a>
      ) : (
        <span aria-disabled="true">Назад</span>
      )}
      <span>
        {page} / {pages}
      </span>
      {page < pages ? (
        <a
          className="primary"
          rel="next"
          href={listingUrl(path, page + 1, tab, sort)}
        >
          Далее
        </a>
      ) : (
        <span aria-disabled="true">Далее</span>
      )}
    </nav>
  );
}
