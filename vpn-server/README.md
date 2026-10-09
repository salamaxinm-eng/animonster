# AniMonster VPN server

The VPN server runs on DE-2 separately from the AniMonster web application.
`deploy/compose.yaml` starts AmneziaWG and XRay. `deploy/vpn-agent.py` polls the
website for device jobs and reconciles both server configurations.

The deployment root is `/opt/animonster-vpn`. Copy the contents of this
directory there before running the services. The agent service file expects
that path. Runtime configuration, keys, pilot client profiles, agent token,
managed device state, and backups belong in the server's `secrets/` or
`managed/` directories. Never commit those directories or client profiles.

The service requires `VPN_AGENT_TOKEN` and `VPN_PUBLIC_IP` in
`/opt/animonster-vpn/secrets/agent.env`. See
[`../deploy/VPN_ACCESS_DEPLOY.md`](../deploy/VPN_ACCESS_DEPLOY.md) for the site
migration and deployment order.

Run agent unit tests with `python -m unittest discover -s tests` from this
directory.
