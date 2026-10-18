export function MobileCatalogTabs({
  active,
}: {
  active: 'all' | 'ongoing' | 'genres' | 'themes';
}) {
  return (
    <nav className="mobile-catalog-page-tabs" aria-label="Разделы каталога">
      <a
        className={active === 'all' ? 'active' : ''}
        aria-current={active === 'all' ? 'page' : undefined}
        href="/catalog"
      >
        Все аниме
      </a>
      <a
        className={active === 'ongoing' ? 'active' : ''}
        aria-current={active === 'ongoing' ? 'page' : undefined}
        href="/catalog?tab=ongoing"
      >
        Онгоинги
      </a>
      <a
        className={active === 'genres' ? 'active' : ''}
        aria-current={active === 'genres' ? 'page' : undefined}
        href="/genres"
      >
        Жанры
      </a>
      <a
        className={active === 'themes' ? 'active' : ''}
        aria-current={active === 'themes' ? 'page' : undefined}
        href="/themes"
      >
        Темы
      </a>
    </nav>
  );
}
