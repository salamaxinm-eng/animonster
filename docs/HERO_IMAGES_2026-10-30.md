# Responsive home hero posters — 2026-10-30

The desktop foreground previously used a 480px thumbnail while the backdrop requested 960px. This stretched the sharp foreground and downloaded two variants of each poster. Both existing image elements now use identical src, srcSet (480/960) and sizes, allowing the browser to select one resource and reuse its download for both layers. Existing layout, artwork, cache, WebP quality and first-slide priority are preserved. Other slides remain lazy.

The gateway retains withoutEnlargement; larger width parameters never fabricate missing detail. Current originals are only 421–725px wide. This change improves the foreground up to the original resolution, not to true HD. Higher-resolution source artwork would be needed for further detail.

Read-only production measurements before the change (Black Clover): backdrop 700x990 / 176300 bytes; foreground 480x679 / 86866 bytes. After resource reuse the large-screen image payload is 176300 rather than 263166 bytes (33% less), and the foreground has 46% more pixels across. These are encoded image bytes, excluding response headers. Small-screen selection depends on viewport, pixel density and browser.

Validation: actual PopularHero server rendering verifies shared responsive attributes, initial priority, lazy remaining slides and unchanged single H1. Existing image gateway tests verify cached WebP variants and URL safety. TypeScript, lint and production build are checked. Browser/device visual testing is unavailable in the current Work settings; do not claim physical Safari/Android verification.
