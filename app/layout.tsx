import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'AniMonster — твоя территория аниме',description:'Открывай аниме, смотри трейлеры и собирай свою коллекцию на AniMonster.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ru" className="dark"><body>{children}</body></html>}
