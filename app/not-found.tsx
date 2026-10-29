import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Страница не найдена',
  description:
    'Запрошенная страница не найдена. Найдите аниме в каталоге AniMonster.',
  robots: { index: false, follow: true },
};
export default function NotFound() {
  return (
    <main className="title-page">
      <h1>Страница не найдена</h1>
      <p>Проверьте адрес или выберите аниме в каталоге.</p>
      <a className="primary" href="/catalog">
        Открыть каталог
      </a>
    </main>
  );
}
