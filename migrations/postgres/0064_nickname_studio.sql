-- Permanent, separate cosmetic purchase: never creates a Plus grant.
ALTER TABLE users ADD COLUMN nickname_style jsonb;
ALTER TABLE users ADD COLUMN nickname_unlocked_at bigint;
ALTER TABLE users ADD COLUMN nickname_gift_at bigint;
ALTER TABLE users ADD CONSTRAINT users_nickname_style_check CHECK (
 nickname_style IS NULL OR (jsonb_typeof(nickname_style)='object'
 AND nickname_style ?& ARRAY['color','effect','motion']
 AND jsonb_typeof(nickname_style->'motion')='boolean'
 AND nickname_style->>'color' IN ('default','legend','coral','scarlet','rose','fuchsia','peach','tangerine','lemon','lime','mint','emerald','jade','turquoise','ice','sky','azure','lavender','violet','lilac','silver','pearl')
 AND nickname_style->>'effect' IN ('solid','gradient','shimmer','neon','metal','stars')));
ALTER TABLE users ADD CONSTRAINT users_nickname_legend_check CHECK (
 nickname_style->>'color' IS DISTINCT FROM 'legend' OR legend_origin_at IS NOT NULL);
ALTER TABLE orders DROP CONSTRAINT orders_plan_check;
ALTER TABLE orders ADD CONSTRAINT orders_plan_check CHECK (plan IN ('monthly','annual','support','donation','vpn','vpn_plus','battlepass','nickname'));
ALTER TABLE orders DROP CONSTRAINT orders_duration_days_check;
ALTER TABLE orders ADD CONSTRAINT orders_duration_days_check CHECK (
 (plan IN ('donation','battlepass','nickname') AND duration_days=0) OR
 (plan NOT IN ('donation','battlepass','nickname') AND duration_days>0));
ALTER TABLE orders ADD CONSTRAINT orders_nickname_price_check CHECK (plan<>'nickname' OR amount=5000);
CREATE TABLE nickname_purchases (
 user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 order_id text NOT NULL UNIQUE REFERENCES orders(id),
 state text NOT NULL CHECK(state IN ('pending','review','active','canceled','chargebacked')),
 payment_url text,
 created_at bigint NOT NULL
);
-- Explicit owner gift only. The other Legend Origin recipient keeps his gold, without the studio.
UPDATE users SET nickname_gift_at=COALESCE(nickname_gift_at,(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint)
 WHERE id='72a2651c-ee22-48e2-8a2e-eaf81d83e332';
