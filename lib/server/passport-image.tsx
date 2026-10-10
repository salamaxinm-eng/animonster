import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { db } from './core';
import type { Passport } from './passport';
import { avatars } from '@/lib/community';

async function avatarImage(passport: Passport) {
  const token = passport.user.avatar.match(/^custom:([a-f0-9-]{36}):\d+$/i);
  if (token) {
    const row = await db().prepare('SELECT mime_type,data FROM user_avatars WHERE user_id=?')
      .bind(token[1]).first<{ mime_type: string; data: Uint8Array }>();
    if (row) return { src: `data:${row.mime_type};base64,${Buffer.from(row.data).toString('base64')}`, position: 'center' };
  }
  const hero = await readFile(path.join(process.cwd(), 'public', 'hero.png'));
  return { src: `data:image/png;base64,${hero.toString('base64')}`, position: avatars.find((a) => a.id === passport.user.avatar)?.position || 'center' };
}
async function poster(source: string) {
  try {
    const target = source.startsWith('/') && !source.startsWith('//')
      ? new URL(source, 'https://animonster.su').href
      : new URL('/api/image?url=' + encodeURIComponent(source), 'https://animonster.su').href;
    const response = await fetch(target, { signal: AbortSignal.timeout(5000) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 500_000) return null;
    return `data:${response.headers.get('content-type')};base64,${bytes.toString('base64')}`;
  } catch { return null; }
}
export async function renderPassportImage(passport: Passport, format: 'portrait' | 'wide', download = false) {
  const portrait = format === 'portrait';
  const width = portrait ? 1080 : 1200, height = portrait ? 1350 : 630;
  const [font, brandIcon] = await Promise.all([
    readFile(path.join(process.cwd(), 'public', 'fonts', 'Play-Regular.ttf')),
    readFile(path.join(process.cwd(), 'public', 'icon-512.png')),
  ]);
  const avatar = await avatarImage(passport);
  const posters = await Promise.all(passport.favorites.map((item) => poster(item.image)));
  const box = { border: '1px solid #34353c', borderRadius: 14, background: '#15161b' };
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: portrait ? 64 : 42, background: '#0b0c10', color: '#f3f3f6', fontFamily: 'Play', gap: portrait ? 34 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: portrait ? 34 : 28, fontWeight: 700 }}>
          <img src={'data:image/png;base64,' + brandIcon.toString('base64')} width={portrait ? 46 : 36} height={portrait ? 46 : 36} alt="" />
          <span>Ani<span style={{ color: '#f23a54' }}>Monster</span></span>
        </div>
        <span style={{ color: '#a9aab2', fontSize: portrait ? 20 : 17 }}>АНИМЕ-ПАСПОРТ · № {passport.user.number}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 26, flex: 1 }}>
        <div style={{ ...box, padding: portrait ? 36 : 28, display: 'flex', flexDirection: 'column', gap: portrait ? 52 : 24, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
            <img src={avatar.src} alt="" width={portrait ? 150 : 110} height={portrait ? 150 : 110} style={{ borderRadius: 18, objectFit: 'cover', objectPosition: avatar.position, border: '2px solid #f23a54' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: portrait ? 48 : 34, fontWeight: 700 }}>{passport.user.nick}</span>
              <span style={{ color: '#f47b8b', fontSize: 20 }}>{passport.archetype.name}</span>
              <span style={{ color: '#a9aab2', fontSize: 17 }}>На AniMonster с {new Date(Number(passport.user.created_at)).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              ['СЕРИЙ', String(passport.episodes)],
              ['АНИМЕ', String(passport.anime_count)],
              ['ВРЕМЯ', passport.watch_seconds ? passport.watch_seconds < 3600 ? '<1 ч' : Math.floor(passport.watch_seconds / 3600) + ' ч' : '—'],
            ].map(([label, value]) => <div key={label} style={{ ...box, display: 'flex', flexDirection: 'column', flex: 1, padding: 18, gap: 5 }}><span style={{ fontSize: portrait ? 34 : 28 }}>{value}</span><span style={{ color: '#9c9ea9', fontSize: 15 }}>{label}</span></div>)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ color: '#a9aab2', fontSize: 18 }}>ЛЮБИМЫЕ ЖАНРЫ</span>
            {passport.genres.slice(0, portrait ? 5 : 3).map((genre) => <div key={genre.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20 }}><span>{genre.name}</span><span style={{ color: '#f47b8b' }}>{genre.percent}%</span></div>)}
            {!passport.genres.length && <span style={{ color: '#777b87' }}>История ещё не собрана</span>}
          </div>
        </div>
        {!!passport.favorites.length && <div style={{ ...box, display: 'flex', flexDirection: 'column', ...(portrait ? {} : { flex: 1 }), padding: portrait ? 30 : 22, gap: 16 }}>
          <span style={{ color: '#a9aab2', fontSize: 18 }}>МОЯ ТРОЙКА</span>
          {passport.favorites.map((item, index) => <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {posters[index] ? <img src={posters[index]!} alt="" width={portrait ? 76 : 54} height={portrait ? 94 : 68} style={{ borderRadius: 6, objectFit: 'cover' }} /> : <div style={{ width: portrait ? 76 : 54, height: portrait ? 94 : 68, background: '#292b32', borderRadius: 6 }} />}
            <span style={{ color: '#f23a54', fontSize: 22 }}>{String(index + 1).padStart(2, '0')}</span>
            <span style={{ fontSize: portrait ? 23 : 19 }}>{item.title}</span>
          </div>)}
        </div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #35363d', paddingTop: 18, color: '#a9aab2', fontSize: 19 }}>
        <span>Мой аниме-паспорт</span><span>animonster.su</span>
      </div>
    </div>,
    { width, height, fonts: [{ name: 'Play', data: font, weight: 400, style: 'normal' }],
      headers: { 'Cache-Control': 'private, no-store', ...(download ? { 'Content-Disposition': `attachment; filename="animonster-passport-${format}.png"` } : {}) } },
  );
}
