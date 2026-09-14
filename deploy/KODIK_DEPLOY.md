# Kodik catalog deployment

Set `KODIK_API_TOKEN`, `KODIK_SYNC_ENABLED=true` and initially
`KODIK_CATALOG_ENABLED=false` in `.env.production`.

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

Migration `0012_repair_kodik_catalog.sql` returns records previously skipped
for a missing generic poster to the automatic queue and repairs titles whose
primary provider was overwritten by fallback metadata. Keep the timer enabled
until the `ждут автопроверки` counter reaches zero.
