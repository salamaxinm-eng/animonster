// Original SVG ornaments. Run with node scripts/generate-reward-art.mjs.
import { mkdir, writeFile } from 'node:fs/promises';

const palettes = {
  emerald: ['#c9ff85', '#73ed45', '#237c65'],
  sakura: ['#ffe6f5', '#ff77be', '#953876'],
  ocean: ['#fff3bd', '#52dcff', '#3062d1'],
  royal: ['#fff2ac', '#edbe52', '#ac53f2'],
  flame: ['#fff4a2', '#ff963a', '#dc3155'],
  astral: ['#f2dfff', '#c18aff', '#5e55e5'],
  frost: ['#e9ffff', '#7ee5ff', '#4185df'],
};
const star = (x, y, s, c) =>
  `<path d="M${x} ${y - s}v${s * 2}m${-s} ${-s}h${s * 2}" stroke="${c}" stroke-width="2"/><rect x="${x - 2}" y="${y - 2}" width="4" height="4" fill="#fff"/>`;
const gem = (x, y, s, c) =>
  `<path d="M${x} ${y - s} ${x + s * 0.65} ${y} ${x} ${y + s} ${x - s * 0.65} ${y}Z" fill="${c}" stroke="#fff6d8" stroke-width="1.5"/><path d="M${x} ${y - s}v${s * 2}l${-s * 0.65} ${-s}Z" fill="#fff" opacity=".3"/>`;
const crown = `<path d="m43 35-5-20 14 10 12-18 12 18 14-10-5 20Z" fill="url(#metal)" stroke="#fff0ac" stroke-width="2"/><path d="M43 36h42v5H43z" fill="#b26b26" stroke="#fff0ac"/>${gem(64, 24, 7, '#dc78ff')}`;
const wing = `<path d="M38 102C14 92 6 66 9 38l13 18-2-25 16 22-2-19 14 29-3 30Z" fill="url(#metal)" stroke="#f0ffed" stroke-width="1.4"/><path d="m17 53 22 39M22 66l17 26M27 80l12 12" fill="none" stroke="#28736f" stroke-width="2"/>`;
function ornaments(kind, a, b) {
  if (kind === 'oni')
    return (
      `<path d="M28 35Q5 20 22 0q-3 19 18 24m60 11q23-15 6-35 3 19-18 24" fill="#e94a78" stroke="#ffd1e8" stroke-width="2"/>` +
      ornaments('sakura', a, b) +
      gem(64, 113, 11, '#ff769c')
    );
  if (kind === 'royal')
    return (
      crown + gem(15, 66, 12, b) + gem(113, 66, 12, b) + gem(64, 111, 13, b)
    );
  if (kind === 'emerald')
    return (
      wing +
      `<g transform="translate(128 0) scale(-1 1)">${wing}</g>` +
      gem(64, 111, 14, b)
    );
  if (kind === 'sakura')
    return Array.from({ length: 9 }, (_, i) => {
      const t = (i * Math.PI * 2) / 9,
        x = 64 + 51 * Math.cos(t),
        y = 64 + 51 * Math.sin(t);
      return `<g transform="translate(${x} ${y})">${Array.from({ length: 5 }, (_, j) => `<ellipse cy="-5" rx="3.5" ry="6" transform="rotate(${j * 72})" fill="${j % 2 ? a : b}" stroke="#fff3fa" stroke-width=".6"/>`).join('')}<circle r="2.5" fill="#ffdf83"/></g>`;
    }).join('');
  if (kind === 'flame')
    return Array.from(
      { length: 9 },
      (_, i) =>
        `<g transform="rotate(${i * 40} 64 64)"><path d="M55 15Q48 3 62 0q-3 9 5 9 2-7 8-10-2 12 0 18-10 10-20-2Z" fill="${b}" stroke="${a}" stroke-width="1.3"/><path d="M60 14q-2-5 3-8-1 6 5 7l-3 7Z" fill="${a}"/></g>`,
    ).join('');
  if (kind === 'astral')
    return (
      [0, 120, 240]
        .map(
          (r) =>
            `<g transform="rotate(${r} 64 64) translate(64 12)"><path d="M0 0C-23-18-22 9-3 8-14 26 0 23 1 5 14 23 24 12 6 6 27-7 16-17 0 0Z" fill="${b}" stroke="${a}" stroke-width="1.4"/><path d="M0-2v16" stroke="#fff" stroke-width="2"/></g>`,
        )
        .join('') + gem(64, 112, 9, a)
    );
  if (kind === 'ocean')
    return (
      [0, 90, 180, 270]
        .map(
          (r) =>
            `<path transform="rotate(${r} 64 64)" d="M26 28C9 24 8 41 18 41c8 0 7-10 0-7 5-12 18-2 12 6" fill="none" stroke="${b}" stroke-width="5"/>`,
        )
        .join('') + gem(64, 113, 10, a)
    );
  return [0, 60, 120, 180, 240, 300]
    .map((r) => `<g transform="rotate(${r} 64 64)">${gem(64, 12, 10, b)}</g>`)
    .join('');
}
function defs(a, b, c) {
  return `<defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset=".4" stop-color="${b}"/><stop offset=".65" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient><radialGradient id="enamel"><stop stop-color="${c}"/><stop offset="1" stop-color="#100e24"/></radialGradient></defs>`;
}
palettes.oni = ['#ffdaef', '#ff78ac', '#8e234f'];
const frameKinds = {
  lime: 'emerald',
  violet: 'sakura',
  fire: 'flame',
  ice: 'frost',
  'violet-neon': 'astral',
  'premium-glow': 'royal',
  'one-piece-master': 'ocean',
  'referral-bloom': 'sakura',
  'referral-wings': 'emerald',
  'referral-tide': 'ocean',
  'referral-master': 'royal',
  'referral-phoenix': 'flame',
  'plus-sakura': 'sakura',
  'plus-illusion': 'astral',
  'plus-crystal': 'frost',
  'achievement-shinobi': 'sakura',
  'achievement-scout': 'emerald',
  'achievement-oni': 'oni',
  'achievement-mage': 'astral',
  'achievement-alchemist': 'royal',
};
await mkdir('public/frames', { recursive: true });
for (const [slug, kind] of Object.entries(frameKinds)) {
  const paletteOverrides = {
    'plus-crystal': 'emerald',
    lime: 'emerald',
    violet: 'astral',
    'premium-glow': 'astral',
    'achievement-scout': 'frost',
    'achievement-mage': 'frost',
  };
  const [a, b, c] = palettes[paletteOverrides[slug] || kind];
  const sparks = [
    [15, 18, 5],
    [110, 25, 5],
    [7, 87, 4],
    [108, 106, 5],
    [87, 6, 3],
  ]
    .map(([x, y, s]) => star(x, y, s, a))
    .join('');
  const crest =
    slug === 'achievement-shinobi'
      ? '<path d="M43 7h42v15H43Z" fill="#8296b3" stroke="#e9f3ff" stroke-width="2"/><path d="M65 11c-13-8-16 13-4 9 7-2 3-9-2-5m8 0 7 3-4-8" fill="none" stroke="#24314f" stroke-width="2"/>'
      : slug === 'achievement-alchemist'
        ? `<circle cx="64" cy="14" r="16" fill="#281528" stroke="${a}"/><path d="m64 0 12 22H52Zm0 28L52 6h24Z" fill="none" stroke="${b}" stroke-width="1.5"/>${gem(64, 14, 7, '#ff6487')}`
        : '';
  const extraCrest =
    slug === 'one-piece-master'
      ? '<path d="M43 17h42M49 16q0-19 15-19t15 19" fill="#ffd576" stroke="#fff1b6" stroke-width="2"/><path d="M49 11h30v5H49Z" fill="#dd466c"/>'
      : slug === 'referral-phoenix'
        ? '<path d="m64 119-16-19 13 5 3-15 3 15 13-5Z" fill="#fff0a3" stroke="#ff694c" stroke-width="2"/>'
        : '';
  const decoration = [
    'achievement-alchemist',
    'lime',
    'violet',
    'violet-neon',
  ].includes(slug)
    ? ornaments('frost', a, b)
    : ornaments(kind, a, b);
  await writeFile(
    `public/frames/${slug}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 144 144">${defs(a, b, c)}<circle cx="64" cy="64" r="49" fill="none" stroke="${c}" stroke-width="7"/><circle cx="64" cy="64" r="49" fill="none" stroke="url(#metal)" stroke-width="3"/><circle cx="64" cy="64" r="54" fill="none" stroke="${b}" stroke-width="1" stroke-dasharray="2 5"/>${decoration}${crest}${extraCrest}${sparks}</svg>`,
  );
}
const symbols = {
  pirate:
    '<path d="M29 65h70M39 61q0-32 25-32t25 32" fill="#ffd374" stroke="#fff0ba" stroke-width="3"/><path d="M39 55h50v8H39z" fill="#e64962"/><path d="m44 91 40-14m-40 0 40 14" stroke="#ffe4ba" stroke-width="5"/><path d="M52 75q12-16 24 0v10H52Z" fill="#fff3d8"/><path d="M58 76h4m5 0h4" stroke="#392535" stroke-width="4"/>',
  leaf: '<path d="M29 46h70v36H29Z" fill="#899eb3" stroke="#e7f9ff" stroke-width="3"/><path d="M69 53c-25-13-31 24-10 24 17 0 15-22 0-18-9 4-2 12 3 7m10 2 13 7-5-17" fill="none" stroke="#192d44" stroke-width="4"/><circle cx="36" cy="53" r="2"/><circle cx="92" cy="75" r="2"/>',
  sword:
    '<path d="m41 86 39-50 9-5-3 13-39 50Z" fill="#f4eeff" stroke="#9bb9ef" stroke-width="2"/><path d="m35 78 21 16m-21 5 10-13" stroke="#ffc573" stroke-width="6"/>',
  notebook:
    '<path d="m41 31 48 8-6 61-48-9Z" fill="#211b35" stroke="#e5c6ff" stroke-width="3"/><path d="m48 40 29 5m-30 4 29 5m-36 28 10-38" stroke="#ba7ce5" stroke-width="2"/><path d="m59 62 7 4-8 17m0-17 8 17" stroke="#fff1fa" stroke-width="3"/>',
  wings:
    '<path d="M62 95 31 73V35l30 24Zm4 0 31-22V35L67 59Z" fill="#c7f0ff" stroke="#fff" stroke-width="2"/><path d="m34 43 26 22m-26-9 26 20m-26-8 26 19m33-44L69 65m24-9L69 76m24-8L69 87" stroke="#429ccf" stroke-width="4"/>',
  sun: '<path d="M63 27c4 23 24 14 19 36 18-5 12 23-1 29-31 17-48-5-43-20 1-12 10-18 13-29-2 17 12 17 12-16Z" fill="#ff6e3e" stroke="#ffe89c" stroke-width="2"/><path d="M64 60c9 12 17 21 2 31-19-2-11-21-2-31" fill="#fff3af"/>',
  infinity:
    '<path d="M65 65c-38-46-45 36-10 12l24-24c35-24 28 58-10 12" fill="none" stroke="#cfa8ff" stroke-width="9"/><path d="M65 65c-38-46-45 36-10 12l24-24c35-24 28 58-10 12" fill="none" stroke="#f8e8ff" stroke-width="2"/>',
  staff:
    '<path d="m48 97 23-60" stroke="#ffdca7" stroke-width="6"/><path d="m60 34 15-12 16 14-16 18Z" fill="#cb8eff" stroke="#ffe6b3" stroke-width="3"/><path d="m75 24-7 12 8 14 6-15Z" fill="#fff5ff"/>',
  saw: '<path d="m35 73 48-41 13 14-48 43Z" fill="#dbe8df" stroke="#fff4cb" stroke-width="3"/><path d="m44 84 44-40" stroke="#687778" stroke-width="3"/><path d="m33 70 21 23-13 12-20-23Z" fill="#f08031" stroke="#ffe08e" stroke-width="3"/><path d="m55 52 6-8m4-1 6-8m4-1 6-8m-18 47 8-5m2-5 8-5m2-5 8-5" stroke="#f4fbe8" stroke-width="4"/>',
  hunter:
    '<path d="M30 39h68v52H30Z" fill="#175854" stroke="#cbffc4" stroke-width="3"/><path d="M43 48v33m16-33v33m-16-17h16m9-16 17 33m0-33L68 81" stroke="#c1ff91" stroke-width="5"/>',
  alchemy:
    '<circle cx="64" cy="64" r="30" fill="none" stroke="#ffcf91" stroke-width="3"/><path d="m64 32 28 48H36Zm0 64L36 48h56Z" fill="none" stroke="#f49d85" stroke-width="2"/><path d="m64 46 10 18-10 18-10-18Z" fill="#ee5570" stroke="#fff2c2" stroke-width="2"/>',
  compass:
    '<circle cx="64" cy="64" r="24" fill="#132c30" stroke="#e1ffb8" stroke-width="3"/><path d="m75 44-4 27-27 13 11-27Z" fill="#d0ff8a" stroke="#fff" stroke-width="2"/><path d="m55 57 16 14-27 13Z" fill="#3ba9a0"/>',
  crew: '<path d="M64 31v61m-20-9q20 25 40 0M33 71l11 12 4-17m47 5L84 83l-4-17M46 52h36" fill="none" stroke="#a3edff" stroke-width="6"/><circle cx="64" cy="35" r="8" fill="#15385d" stroke="#ffe4a2" stroke-width="4"/>',
  crown,
  phoenix:
    '<path d="M64 94C30 89 24 62 29 37l22 25-4-36 17 31 17-31-4 36 22-25c5 25-1 52-35 57Z" fill="url(#metal)" stroke="#fff1a2" stroke-width="2"/><path d="m64 50 9 19-9 20-9-20Z" fill="#ffefb0"/>',
};
const pins = [
  ['achievement-one-piece', 'royal', 'pirate'],
  ['achievement-naruto', 'flame', 'leaf'],
  ['achievement-bleach', 'astral', 'sword'],
  ['achievement-death-note', 'astral', 'notebook'],
  ['achievement-attack-on-titan', 'emerald', 'wings'],
  ['achievement-demon-slayer', 'flame', 'sun'],
  ['achievement-jujutsu-kaisen', 'astral', 'infinity'],
  ['achievement-frieren', 'frost', 'staff'],
  ['achievement-chainsaw-man', 'flame', 'saw'],
  ['achievement-hunter-x-hunter', 'emerald', 'hunter'],
  ['achievement-fullmetal-alchemist', 'royal', 'alchemy'],
  ['referral-scout', 'emerald', 'compass'],
  ['referral-crew', 'ocean', 'crew'],
  ['referral-master', 'royal', 'crown'],
  ['referral-legend', 'flame', 'phoenix'],
];
for (const [slug, kind, symbol] of pins) {
  const [a, b, c] = palettes[kind];
  const art =
    symbol === 'crown'
      ? `<g transform="translate(-13 10) scale(1.2)">${crown}</g>${gem(64, 85, 13, b)}`
      : symbols[symbol];
  await writeFile(
    `public/pins/${slug}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${defs(a, b, c)}<path d="m64 9 40 17 12 40-21 36-31 17-31-17L12 66l12-40Z" fill="#100f21" stroke="${c}" stroke-width="5"/><path d="m64 14 37 16 10 36-19 33-28 15-28-15-19-33 10-36Z" fill="url(#enamel)" stroke="url(#metal)" stroke-width="3"/><circle cx="64" cy="64" r="42" fill="none" stroke="${b}" stroke-dasharray="2 5" opacity=".5"/>${art}${star(22, 25, 7, a)}${star(105, 91, 7, a)}${gem(64, 112, 6, b)}</svg>`,
  );
}
