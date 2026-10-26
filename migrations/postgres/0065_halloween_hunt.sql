CREATE TABLE halloween_spirit_finds (
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 spirit_id text NOT NULL CHECK(spirit_id IN ('home','genres','recommendations','player','statistics')),
 found_at bigint NOT NULL,
 PRIMARY KEY(user_id,spirit_id)
);
CREATE TABLE halloween_candle_uses (
 actor text NOT NULL CHECK(char_length(actor)<=100),
 day date NOT NULL,
 used_at bigint NOT NULL,
 PRIMARY KEY(actor,day)
);
INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,access_type,sort_order,created_at)
VALUES ('pin:halloween-spirit-hunter-2026','pin','halloween-spirit-hunter-2026','Ловец духов · Хэллоуин 2026',
 'Памятный значок за пять скрытых духов в разных разделах AniMonster. Остаётся навсегда.',
 'epic','/rewards/halloween-2026/spirit-hunter.svg','achievement',20,0);
