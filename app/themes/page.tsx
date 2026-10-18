import { Sparkles } from 'lucide-react';
import { CommunityHeader } from '@/components/community/context';
import { MobileCatalogTabs } from '@/components/mobile-catalog-tabs';
import { animeTaxonomy } from '@/lib/server/anime-taxonomy';

export const metadata = {
  title: 'Темы аниме — AniMonster',
  description:
    'Аниме по темам: исекай, путешествия во времени и другие истории.',
};
export const dynamic = 'force-dynamic';

export default async function ThemesPage() {
  const { themes } = await animeTaxonomy();
  return (
    <div className="site-shell">
      <CommunityHeader />
      <main className="genre-hub">
        <MobileCatalogTabs active="themes" />
        <div className="genre-hub-heading">
          <p className="eyebrow">КАТАЛОГ ANIMONSTER</p>
          <h1>Темы аниме</h1>
          <p>Выбери сюжет, мир или мотив истории.</p>
        </div>
        {themes.length ? (
          <nav className="genre-grid" aria-label="Темы аниме">
            {themes.map((theme) => (
              <a
                className="genre-tile theme-tile"
                href={'/search?theme=' + encodeURIComponent(theme)}
                key={theme}
              >
                <span className="genre-tile-content">
                  <Sparkles aria-hidden="true" />
                  <strong>{theme}</strong>
                </span>
              </a>
            ))}
          </nav>
        ) : (
          <p role="status">
            Темы пока недоступны. Попробуйте открыть раздел позже.
          </p>
        )}
      </main>
    </div>
  );
}
