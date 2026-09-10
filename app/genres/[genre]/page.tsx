import { CommunityHeader } from '@/components/community/context';
import { GenreCatalog } from '@/components/genre-catalog';
export default async function Page({
  params,
}: {
  params: Promise<{ genre: string }>;
}) {
  const { genre } = await params;
  return (
    <div className="social-site">
      <CommunityHeader />
      <main className="title-page">
        <h1>{genre}</h1>
        <GenreCatalog genre={genre} />
      </main>
    </div>
  );
}
