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
