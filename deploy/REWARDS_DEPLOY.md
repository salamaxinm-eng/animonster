# Anime rewards and ornamental frames

Apply migrations `0021_anime_reward_collection.sql` and
`0022_achievement_and_plus_frames.sql` with the normal migration container before
starting the updated app. Include the new `public/frames` and `public/pins` SVGs.

The migrations preserve existing cosmetics and Plus access. Existing One Piece
achievement owners receive the additional permanent pin immediately. Qualified
referral counts backfill the new frames at 1, 3, 5 and 25 friends; the existing
10-friend frame is redesigned in place. New anime achievements evaluate existing
completed viewing history when the rewards panel opens or viewing progress updates.
Season-specific goals count the stated season, using canonical Shikimori anime IDs.

The rewards panel evaluates achievements before fetching inventory so new rewards
can be equipped immediately. The three new Plus frames still require an active
subscription; achievement and referral cosmetics remain permanent.

Check `/profile?tab=rewards` (all source filters, previews, equip, locked rewards)
and `/referrals` at mobile and desktop sizes. Reduced-motion preferences disable
ornament animation. Art is reproducible with `node scripts/generate-reward-art.mjs`.
