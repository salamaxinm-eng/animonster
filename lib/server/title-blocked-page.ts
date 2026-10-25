const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="7;url=/vpn">
<title>Тайтл заблокирован — AniMonster</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100svh;background:#0d0c14;color:#f5f3ff;font-family:system-ui,-apple-system,sans-serif}
header{padding:24px clamp(20px,5vw,72px);border-bottom:1px solid #ffffff12}header a{color:#f5f3ff;font-size:22px;font-weight:800;text-decoration:none;letter-spacing:-.04em}header span{color:#c4b5fd}
main{display:grid;place-items:center;min-height:calc(100svh - 80px);padding:40px 20px}
section{width:min(100%,600px);padding:clamp(24px,5vw,52px);text-align:center;border:1px solid #ffffff1f;border-radius:28px;background:linear-gradient(145deg,#1e1932,#12121e);box-shadow:0 24px 100px #0004}
.icon{display:grid;place-items:center;width:72px;height:72px;margin:0 auto 24px;border-radius:24px;background:#a78bfa1c;color:#c4b5fd}
.eyebrow{font-size:11px;letter-spacing:.12em;color:#c4b5fd}h1{font-size:clamp(28px,5vw,40px);line-height:1.15;margin:16px 0}p{line-height:1.7;color:#cbc7da}
.cta{display:inline-flex;align-items:center;justify-content:center;gap:12px;min-height:50px;padding:12px 22px;margin-top:20px;border-radius:14px;background:#c4b5fd;color:#171126;font-weight:700;text-decoration:none}.cta:hover{background:#ddd6fe}a:focus-visible{outline:3px solid #f5f3ff;outline-offset:4px}
.timer{font-size:13px;color:#a9a3bd;margin:16px 0 24px}.back{color:#cbc7da;font-size:14px}
</style></head><body>
<header><a href="/">Ani<span>Monster</span></a></header>
<main><section aria-labelledby="title">
<div class="icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m9 9 6 6m0-6-6 6"/></svg></div>
<p class="eyebrow">ANIMONSTER / ОГРАНИЧЕНИЕ ДОСТУПА</p>
<h1 id="title">Тайтл заблокирован</h1>
<p>Доступ к этому тайтлу на территории России ограничен по требованию правообладателя.</p>
<a class="cta" href="/vpn">Купить AniMonster VPN <span aria-hidden="true">→</span></a>
<p class="timer">Через 7 секунд вы автоматически перейдёте в раздел VPN.</p>
<a class="back" href="/catalog">Вернуться в каталог</a>
</section></main></body></html>`;

export function titleBlockedPage(permanent = false) {
  // Return the document directly: rendering a static rewrite can overwrite 451
  // and private cache headers with the cached destination page's 200 response.
  const document = permanent ? html
    .replace('<meta http-equiv="refresh" content="7;url=/vpn">', '')
    .replace('Доступ к этому тайтлу на территории России ограничен по требованию правообладателя.', 'Доступ к материалу закрыт по требованию правообладателя.')
    .replace(/<a class="cta"[^]*?<\/a>/, '')
    .replace(/<p class="timer"[^]*?<\/p>/, '') : html;
  return new Response(document, {
    status: 451,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
