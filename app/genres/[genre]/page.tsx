import { redirect } from 'next/navigation';
import { animeTaxonomy } from '@/lib/server/anime-taxonomy';
import { tagKey } from '@/lib/anime-taxonomy';
import { CommunityHeader } from '@/components/community/context';
import { GenreCatalog } from '@/components/genre-catalog';
export default async function Page({
  params,
}: {
  params: Promise<{ genre: string }>;
}) {
  const route = await params;
  let genre = route.genre;
  try {
    genre = decodeURIComponent(genre);
  } catch {}
  const { themes } = await animeTaxonomy();
  const theme = themes.find((name) => tagKey(name) === tagKey(genre));
  if (theme) redirect('/search?theme=' + encodeURIComponent(theme));
  return (
    <div className="site-shell">
      <CommunityHeader />
      <main className="title-page">
        <h1>{genre}</h1>
        <GenreCatalog genre={genre} />
      </main>
    </div>
  );
}
