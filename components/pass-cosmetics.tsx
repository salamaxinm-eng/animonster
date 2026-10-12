'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
type Item = { id: string; slug: string; kind: string; name: string; image: string; rarity: string };
const Catalog = createContext<Item[]>([]);
export function usePassCosmetic(slug?: string | null) { return useContext(Catalog).find((item) => item.slug === slug); }
export function PassCosmeticsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => { void fetch('/api/battlepass/catalog').then((r) => r.ok ? r.json() : null).then((v) => setItems(v?.cosmetics || [])).catch(() => {}); }, []);
  const frames = items.filter((i) => i.kind === 'frame' && /^[a-z0-9-]+$/.test(i.slug) && /^\/api\/battlepass\/assets\/[a-f0-9-]{36}$/.test(i.image));
  return <Catalog.Provider value={items}>
    <style>{`
      .pass-pin{display:inline-flex;transform-origin:center}
      .pass-pin.pass-rarity-rare:hover{animation:pass-pin-rare .9s ease-out}
      .pass-pin.pass-rarity-epic{animation:pass-pin-epic 5s ease-in-out infinite}
      .pass-pin.pass-rarity-legendary{animation:pass-pin-legendary 4s ease-in-out infinite}
      .user-tag-pass{display:inline-flex;align-items:center;justify-content:center;max-width:none!important;padding:5px 10px!important;border:1px solid #b27d57!important;border-radius:5px!important;background:#211b16!important;color:#f5e8da!important;font-size:10px!important;font-weight:750!important;letter-spacing:.1em;white-space:nowrap}
      .user-tag-pass.pass-rarity-epic{animation:pass-tag-epic 5s ease-in-out infinite}
      .user-tag-pass.pass-rarity-legendary{animation:pass-tag-legendary 3.5s ease-in-out infinite}
      @keyframes pass-pin-rare{50%{transform:rotate(-8deg) scale(1.06)}}
      @keyframes pass-pin-epic{50%{transform:rotate(5deg) scale(1.05);filter:drop-shadow(0 0 4px #b77d42)}}
      @keyframes pass-pin-legendary{25%{transform:rotate(-6deg) scale(1.06)}75%{transform:rotate(6deg) scale(1.06);filter:drop-shadow(0 0 7px #ca8052)}}
      @keyframes pass-tag-epic{50%{border-color:#d6aa70;box-shadow:inset 0 0 8px #c4834726}}
      @keyframes pass-tag-legendary{50%{border-color:#e0b071;box-shadow:0 0 8px #c5824b77,inset 0 0 8px #c5824b30}}
      @keyframes pass-frame-epic{50%{transform:rotate(5deg);filter:drop-shadow(0 0 4px #ad814e)}}
      @keyframes pass-frame-legendary{25%{transform:rotate(-7deg)}75%{transform:rotate(7deg);filter:drop-shadow(0 0 7px #d69b5b)}}
      @media(prefers-reduced-motion:reduce){.pass-pin,.user-tag-pass,[class*=profile-frame-pass-]>.user-avatar::after{animation:none!important}}
    `}</style>
    <style>{frames.map((f) => `.profile-frame-${f.slug}>.user-avatar::after{content:"";background:url("${f.image}") center/contain no-repeat;border:0!important;border-radius:0;inset:-16%;animation:${f.rarity === 'legendary' ? 'pass-frame-legendary 5s ease-in-out infinite' : f.rarity === 'epic' ? 'pass-frame-epic 6s ease-in-out infinite' : 'none'};filter:none!important;pointer-events:none}`).join('\n')}</style>
    {children}
  </Catalog.Provider>;
}
