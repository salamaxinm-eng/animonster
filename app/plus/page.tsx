import { CommunityHeader } from '@/components/community/context';
import { PlusCollections } from '@/components/community/plus-collections';

export default function Page() {
  return (
    <div className="social-site">
      <CommunityHeader />
      <main className="title-page plus-page">
        <span className="eyebrow">ANIMONSTER PLUS</span>
        <h1>Бонусные подборки</h1>
        <p className="muted">
          Авторские списки для вечера, выходных и знакомства с новым сезоном.
        </p>
        <PlusCollections />
      </main>
    </div>
  );
}
