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

When the admin panel reports that the initial sync is complete, set
`KODIK_CATALOG_ENABLED=true` and recreate the app container.
