export function MobileCatalogTabs({
  active,
}: {
  active: 'all' | 'ongoing' | 'genres';
}) {
  return (
    <nav className="mobile-catalog-page-tabs" aria-label="Разделы каталога">
      <a className={active === 'all' ? 'active' : ''} href="/catalog">
        Все аниме
      </a>
      <a
        className={active === 'ongoing' ? 'active' : ''}
        href="/catalog?tab=ongoing"
      >
        Онгоинги
      </a>
      <a className={active === 'genres' ? 'active' : ''} href="/genres">
        Жанры
      </a>
    </nav>
  );
}
