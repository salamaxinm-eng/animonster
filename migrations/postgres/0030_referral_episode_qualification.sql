UPDATE cosmetics
SET description = CASE slug
  WHEN 'referral-bloom' THEN 'За 1 приглашённого друга, посмотревшего 3 серии аниме.'
  WHEN 'referral-wings' THEN 'За 3 приглашённых друзей, посмотревших по 3 серии аниме.'
  WHEN 'referral-tide' THEN 'За 5 приглашённых друзей, посмотревших по 3 серии аниме.'
  WHEN 'referral-phoenix' THEN 'За 25 приглашённых друзей, посмотревших по 3 серии аниме.'
END
WHERE slug IN (
  'referral-bloom',
  'referral-wings',
  'referral-tide',
  'referral-phoenix'
);
