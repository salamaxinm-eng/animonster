# AniMonster Halloween 2026

Season is active immediately on rollout during October 27 and through **November 3 inclusive, UTC+05**. Exact interval: 2026-10-26T19:00:00Z <= now < 2026-11-03T19:00:00Z. Cached HTML runs a small pre-paint date gate; provider checks visibility, minutes and a precise expiry timeout. On November 4 at 00:00 UTC+05 it removes the seasonal attribute and components. Existing user themes, cosmetics, gold nicknames and database are not rewritten. Profile theme selection explains the temporary override.

All viewers get the purple/orange illustrated landscape and orange primary buttons during the interval. Desktop and mobile logo use a purple SVG ghost with blinking eyes and an adjusting witch hat. Ghost button is separate from the home link, including on mobile; clicking hides it behind the wordmark. Reduced-motion/quiet mode uses a static hide response.

Six details:
- Side branch/apple button temporarily consumes the apple and shows a spiky Ryuk silhouette for about one second, then resets. No sound.
- Surprise anime action uses a 460ms hand transition before the original navigation. Repeated clicks cannot enqueue navigation; unmount clears timers. Quiet/reduced-motion, active video, fullscreen/PiP and dialogs skip the transition and navigate immediately.
- Two background bats make short flights in 47/61-second cycles behind site containers. Desktop fine-pointer card hover launches a small bat; no touch hover animation.
- Pumpkin rotates five expressions; after five clicks shows the requested message for 4.5 seconds.
- Small player-edge ghost peeks after 18 seconds and then every 57 seconds for 3.4 seconds, without pointer or keyboard interaction. Disabled in real/faux fullscreen/PiP or reduced-motion/quiet mode. It sits at the frame edge, not on controls.
- Quiet switch is persistent locally. Background scenery remains; continuous decoration motion stops. Global floating details hide during active video. Listeners, intervals and timers clean up; media state refreshes after route changes.

## Assets and image generation

Used the **built-in imagegen tool**, not CLI/API. Full prompt:

> Use case: illustration-story. Asset: wide landscape background illustration for AniMonster anime community Halloween event, 1536x1024 landscape. High-quality detailed anime background painting, atmospheric mysterious Japanese forest at Halloween night, layered purple and indigo storm clouds, small distant shrine and torii at lower right, warm amber paper lanterns winding down a forest path, gnarled silhouetted branches and orange autumn maple leaves framing left and right edges, a few small glowing jack-o-lanterns at bottom corners, delicate spider web upper right. Rich violet versus warm orange lighting. Main center and upper center mostly dark quiet open violet fog so website cards placed over it remain legible, visual detail concentrated in outside margins and lower quarter. No text, no letters, no logos, no website UI, no characters, no photo mockup. Full bleed original hand-painted anime environment, polished cinematic composition, spooky but welcoming.

Generated source: `C:/Users/salam/.codex/generated_images/01a16ffb-2995-7cd3-9e9e-cdcfa22ebfe1/exec-9c12b71c-66e7-4643-958f-b662e61cf6f7.png`. Inspected the output. Sharp converts to WebP and crops a mobile variant; no semantic repainting.

Project assets:
- `public/themes/halloween-2026/forest-v1.webp` — 1536x1024, 270914 bytes.
- `public/themes/halloween-2026/forest-mobile-v1.webp` — 672x896, 95464 bytes.
- `public/themes/halloween-2026/bat.svg` — native SVG. Ghost/hat, Ryuk silhouette, apple, pumpkin expressions and hands are code-native SVG, extending the existing vector identity.

## Validation/deployment

Tests exercise exact timezone boundaries (including stale bootstrap HTML), retention of saved theme selection, unavailable localStorage, single navigation/timer disposal, pumpkin cycle and separate accessible desktop/mobile logo controls. TypeScript, changed-source lint and production build are required. Verify production health, scene image MIME/dimensions, private payment endpoint authentication, both honorary gold profiles and the 19-episode catalog after rollout. No migrations, provider charges or new media downloads.

The live website UI was previously denied by tool policy; no bypass browser/headless screenshot is used. Generated scene inspected directly; logo structure checked via React server rendering.

Validation run: all **226 tests passed**, TypeScript passed, lint of all changed production sources/new tests passed. Source scene directly inspected; desktop WebP is ~265 KiB and mobile ~93 KiB.

## Released

Production image `animonster-app:halloween-20261027`, ID `6ff932ebc973`, deployed on 2026-10-27 local time. Private canary passed HEAD checks on home/player/profile, SHA-256 and MIME of all three scene/bat assets, 19 episodes, both honorary gold entitlements and payment auth/origin guards. Public production health, home HEAD, desktop/mobile art and bat SVG returned 200, with the 19-episode catalog retained. No database writes, migrations or provider charges. Canary container and temporary environment file removed.

Previous env/image reference saved root-only as `.player-demo.env.before-halloween-20261027`. Existing source release folder is `/root/animonster-release-player-features-20261025`; production secret environment and all video media were preserved. Rollback release image is retained. Automatic event expiry needs no scheduled agent, database edit or redeployment.

## Placement refinement

Pumpkin and quiet switch now live in the own-player promo, beside the player CTA; floating pumpkin and side branch are removed. Promo copy and CTA remain links, while pumpkin buttons are sibling elements, so interacting with the pumpkin cannot open the player. Mobile actions share one row with reserved pumpkin space; the speech bubble is bounded to the viewport and does not intercept clicks.

Apple now follows the AniMonster wordmark in both desktop/mobile headers, outside its home link, with reserved width during the eaten state. Ryuk still briefly appears below it. Narrow headers adjust at <=380px. Pumpkin keeps its five expressions and unlocks a rotating set of 20 phrases after five clicks; each further click advances the message, preserving the original first joke. Calendar expiry, quiet/reduced motion and video/fullscreen behavior stay intact.

Placement refinement released as `animonster-app:halloween-layout-20261027` (`81efed14a497`). TypeScript, changed-source lint, four seasonal tests (including apple order/separate navigation controls) and production build passed. Public health/home HEAD and the unchanged 19-episode catalog passed after rollout. Previous reference is `.player-demo.env.before-halloween-layout-20261027` on the host. No database/media changes.

## Selected extras and spirit hunt (revised user scope)

The preceding unreleased experiment was discarded. No Konami/VHS effect, extra avatar/broom, 404 sound/page, horror-only day filter, new share/BOO buttons, logo steam/sound, bat scrubber or midnight pause event is included.

Included:
- Fine-pointer watch buttons use a transparent jack-o-lantern follower with CSS glow. Native cursor restored on movement away, scrolling, click, blur, unmount, quiet/reduced-motion.
- Player echo shows a translucent mask spirit and “Не забудь вернуться” for 1.2 seconds on returning from a hidden tab/window or leaving native/faux fullscreen. A minimized OS window cannot display page content; the echo appears when the page becomes visible again. It does not change playback, volume or progress.
- Exact Russian search keywords Хэллоуин/Хеллоуин/Тыква show a pumpkin treat card and a random-anime action in header and full-page search; other queries use ordinary search.
- Candle beside footer copyright requests a server claim before a 3-second rgba(0,0,0,.95) body portal overlay. Very quiet generated door-creak audio is prepared only on the click; quiet mode suppresses audio. Visual restoration is independent of audio success. Fixed lower-right notice uses the exact requested text and a Close button. Atomic daily claims protect both account and HttpOnly guest-browser identity, including concurrent tabs. Day uses UTC+05. Mobile footer is temporarily visible during the event.
- Pumpkin phrases now begin on click 1; reaching click 20 yields a closable horror title card. Both requested genre filtering and returned genres are checked, so unrelated popular titles cannot silently replace horror. Network failure offers retry, not forced navigation.
- Five small spirits appear across different public sections. Guest progress is device-local; login during the event imports known IDs into account-scoped server records. Five distinct finds grant one permanent `pin:halloween-spirit-hunter-2026`. The public profile commemorative badge remains after the event and existing equipped pins are not replaced. Badge also appears in cosmetic collection.
- Final footer character holds the requested end-of-page sign and scrolls to top on click, respecting motion settings.

Migration 0065 creates find and daily-candle tables and the one epic achievement cosmetic. No orders, Plus grants, user theme changes or fake viewing history. JSON metadata uses PostgreSQL jsonb_build_object; date parameters bind through text casts. `/api/halloween` requires same origin on POST and binds the expected account ID; unknown spirit IDs are rejected. New claims stop at event expiry, earned cosmetic persists.

Assets are code-native SVG: `public/rewards/halloween-2026/spirit-hunter.svg`, `public/themes/halloween-2026/pumpkin-cursor.svg`. Door creak is low-gain Web Audio; no external sound file or background autoplay.

Validation: 229 tests passed; TypeScript and changed-source lint passed. Database tests cover account isolation, five distinct finds, concurrent/duplicate claims, permanent ownership, pin preservation, calendar cutoff, guest-cookie handling, daily candle collision rollback across browser/account identities, exact search and strict horror candidates.

Selected extras released on 2026-10-27 local time as `animonster-app:halloween-hunt-20261027` (`750dd960304c`), source commit `6985a28`. Before migration 0065, a root-only PostgreSQL dump `/root/db-before-halloween-hunt-20261026-230755.dump` (119780465 bytes) was created and its archive directory validated. Only migration 0065 was applied transactionally and registered. Previous image reference is saved as `.player-demo.env.before-halloween-hunt-20261027`.

Private canary against real PostgreSQL passed guest/auth candle once-per-day claims, five spirit finds and duplicate handling, exactly one permanent cosmetic, preserved equipped pin, public cosmetic flag, bad spirit/account/origin guards, route HEAD and SVG SHA-256/MIME checks. Temporary user/session/finds/candle claims, container and root-only environment file were removed. Both honorary profiles remain accessible. Public health, home HEAD, event API and both new SVG assets returned 200; all 19 player episodes remain present. Horror endpoint returned 24 horror candidates. No runtime errors were logged after rollout. Dangling build layers only were pruned (862.6 MB); tagged rollback images and media were retained. Live UI was not opened or visually verified.
