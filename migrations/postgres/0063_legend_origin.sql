-- Personal honorary award. Issuance is a separate, explicit audited operation.
ALTER TABLE users ADD COLUMN legend_origin_at bigint;
ALTER TABLE users ADD COLUMN legend_origin_seen_at bigint;
INSERT INTO cosmetics(id,kind,slug,name,description,rarity,image,access_type,sort_order,created_at)
VALUES ('tag:legend-origin','tag','legend-origin','Исток легенды',
  'Персональная награда за особую поддержку AniMonster в самом начале. Выдаётся администрацией навсегда.',
  'legendary','/rewards/legend-origin/tag-v1.png','admin',1,0);
