# Two-node AniMonster deployment

The database and public Caddy entrypoint run on the primary node. A second app
instance runs on the worker node. The nodes communicate only over WireGuard:

- primary: `10.77.0.1`;
- worker: `10.77.0.2`.

On the primary node set these values in `.env.production`:

```dotenv
POSTGRES_BIND_ADDRESS=10.77.0.1
CLUSTER_APP_UPSTREAM=10.77.0.2:3000
```

Deploy the primary normally:

```sh
docker compose --env-file .env.production up -d --build
```

On the worker, copy `.env.production` securely from the primary and run:

```sh
docker compose -f compose.app-node.yaml --env-file .env.production up -d --build
```

Verify both `/api/health` endpoints before reloading Caddy. If the worker is
unavailable, Caddy's active health check removes it from rotation and continues
serving the local app.
