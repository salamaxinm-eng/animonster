CREATE TABLE player_catalog_campaign (
 id integer PRIMARY KEY CHECK(id=1),
 starts_at bigint NOT NULL
);
INSERT INTO player_catalog_campaign(id,starts_at)
VALUES (1,(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint);
CREATE INDEX orders_player_catalog_donations ON orders(confirmed_at)
 WHERE fundraising_goal_id='player' AND plan='donation' AND status='succeeded' AND NOT is_test;
