# Permanent nickname studio

Product agreed 2026-10-26: 5000 RUB once per account, all 20 preset colors and five optional effects (gradient, shimmer, neon, metal, stars), plus plain color. Free switching, preview before purchase, no recurring payments or dependency on Plus. Paid amount contributes to the supporter ranking, without Plus/fundraiser/Founder issuance.

The personal Legend Origin gold is not a palette item. Its existing two recipients retain the default animated gold and may return to it. **Only owner 72a2651c-ee22-48e2-8a2e-eaf81d83e332 gets the new studio free**; 3c199d52-d4c1-48f3-8051-83ccbe5f00a5 keeps only existing gold, with no free studio right.

Entry: `/profile?section=appearance&appearance=nickname`. Explicit Save applies the preview. Motion can be disabled and respects reduced-motion. Renderer is shared across profile/header/comments, ratings, rooms/chat, passport, notifications, blocks and admin member lists. Public DTOs expose selected style, never a purchase right; owner DTO additionally exposes nickname_unlocked.

Migration 0064 adds user selection, gift and paid timestamps, strict preset constraints, separate nickname order type (exactly 5000 RUB, zero duration) and serialized per-account checkout reservation. Existing profile clients preserve nickname_style when omitted. Server checks ownership and preset allowlists under the same account lock as payment changes.

`/api/nickname/purchase` authenticates and checks same origin, accepts buy/check only, ignores client user/price, resumes a pending checkout and prevents repeat purchase. Uncertain checkout creation is marked review to prevent duplicate charges; check reconciles Cashera by external order ID. Billing verifies remote transaction, order, currency and amount before issuing access. Confirmation is idempotent; test payments never unlock; refunds revoke only paid rights and clear unavailable color selection, preserving honorary gold and gifts. Canceled events cannot overwrite success; refunded orders cannot reopen from replay. No actual financial transaction is made by tests.

## Deployment

1. Run tests, TypeScript, lint on changed source and production build.
2. Back up PostgreSQL to a root-only pg_dump archive. Apply **only** migrations/postgres/0064_nickname_studio.sql and record it transactionally in schema_migrations; do not rerun all unrelated migrations.
3. Build tagged app image, canary with existing environment/network/media mount. Verify private API auth/origin guards and real two recipients' ownership, public health and catalog count. Use temporary test accounts for save checks and remove their sessions/accounts afterward.
4. Set PLAYER_DEMO_IMAGE in existing .player-demo.env, compose up app --no-deps, confirm healthy and public API. Preserve env secrets and all media. Retain old image for rollback. Schema is additive except allowing new order type; old images cannot settle nickname orders, so investigate callbacks before rollback after sales.

Global repository oxlint currently reports existing errors in unrelated files/tests. Require zero errors on changed production source and new test, and record unrelated baseline separately.

## Validation notes (2026-10-26)

- Full suite: 221 passed; additional renderer test passed all 120 color/effect combinations, escaped nicknames, gold access and motion-off rendering.
- TypeScript and lint of changed source/new tests passed. Global lint also reports pre-existing failures outside this change.
- First production canary caught PostgreSQL JSON parameter serialization that PGlite does not reproduce. Profile writes now bind JSON through `::text::jsonb`; targeted five tests passed after the fix. Keep the HTTP save canary as a deployment gate.
- Database backup: `/root/db-before-nickname-studio-20261026-125921.dump` (root-only, 119743130 bytes). Migration 0064 applied transactionally; owner gift true, Artyom gift/paid false; both gold/default choices preserved.
- Corrected production build image: `animonster-app:nickname-studio-20261026-r2`, ID `7662fcde87a0`. Actual HTTP canary passed authenticated save/public read, permanent gift without Plus, locked account, invalid presets, exclusive gold, duplicate purchase rejection, same-origin/auth guards, both real honorary profiles and unchanged 19-episode catalog. Temporary accounts/sessions removed.
- Reusable server check: `python3 scripts/verify-nickname-canary.py` against private port 3104. Does not create provider charges or edit real user choices.
