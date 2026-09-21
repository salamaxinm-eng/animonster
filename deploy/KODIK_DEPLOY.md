# Kodik catalog deployment

Set `KODIK_API_TOKEN`, `KODIK_SYNC_ENABLED=true` and initially
`KODIK_CATALOG_ENABLED=false` in `.env.production`. The token must also be
available in the web application container: the player uses Kodik on demand.

```sh
docker compose --env-file .env.production up -d --build
install -m 0755 deploy/animonster-kodik-sync /usr/local/bin/animonster-kodik-sync
install -m 0644 deploy/animonster-kodik-sync.service /etc/systemd/system/
install -m 0644 deploy/animonster-kodik-sync.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now animonster-kodik-sync.timer
systemctl start animonster-kodik-sync.service
```

Wait until the admin panel reports `full_sync_complete=1`, no saved cursor and
no synchronization error. Records waiting for automatic matching drain ten at
a time on subsequent worker runs. Review or reject the remaining ambiguous
records in the admin panel. Then set `KODIK_CATALOG_ENABLED=true` and recreate
the app container.

After deployment, sign in with an age-confirmed account and open One Piece
(anime ID 21). Its source selector must show Kodik entries and more than the
11 AniLiberty episodes. If it only shows AniLiberty, inspect the web app
container's `KODIK_API_TOKEN`, then recreate that container.

Migration `0012_repair_kodik_catalog.sql` returns records previously skipped
for a missing generic poster to the automatic queue and repairs titles whose
primary provider was overwritten by fallback metadata. Keep the timer enabled
until the `ждут автопроверки` counter reaches zero.
