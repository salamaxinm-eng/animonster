# VPN cabinet rollout (slice 2)

The site owns subscriptions, devices, encrypted downloadable profiles, and a durable job queue. The DE-2 agent polls `/api/vpn/agent` over HTTPS and applies AWG and XRay configuration locally. No management port is opened on the VPN server. The VPN payment switch remains off in this slice.

## Before deploying

1. Confirm `https://animonster.su/api/health` returns `200` through the DE-2 edge proxy and reaches the app on `2.26.48.72` over the existing `wg0` tunnel. Public DNS can continue pointing to DE-2. The VPN server's XRay camouflage target is `animonster.su:443`, so the public site must remain reachable.
2. Back up PostgreSQL and the VPN server's `/opt/animonster-vpn/secrets` directory. Keep both backups private.
3. Generate a 32-byte random `VPN_CONFIG_KEY` encoded with standard Base64 and a separate random `VPN_AGENT_TOKEN` of at least 32 characters. Add them to the new site's `.env.production`. Keep `VPN_PILOT_GRANTS_ENABLED=false` except while assigning a test subscription.
4. Deploy the site code and apply migration `0041_vpn_access.sql` using the existing migration process. Start the application and check `/api/health` and `/vpn`.
5. Copy `deploy/vpn-agent.py` from the VPN workspace to `/opt/animonster-vpn/deploy/` on DE-2. Install `deploy/animonster-vpn-agent.service` as a systemd service. The agent's private environment file `/opt/animonster-vpn/secrets/agent.env` needs `VPN_SITE_URL=https://animonster.su`, `VPN_PUBLIC_IP=31.77.10.81`, and the same `VPN_AGENT_TOKEN`; mode `0600`.
6. Start the agent only after the site endpoint and HTTPS are reachable from DE-2. Check its logs and the existing website, `wg0`, `awg0`, and XRay after startup.

The site secret `VPN_CONFIG_KEY` must be backed up separately. Losing it makes previously issued client profiles unreadable in the cabinet. The agent's root-only state in `/opt/animonster-vpn/managed` contains client keys and must be backed up with the VPN server.

## Pilot acceptance

With `VPN_PILOT_GRANTS_ENABLED=true`, an administrator can POST to `/api/vpn/admin` with `{ "userId": "...", "days": 1 }` to grant a test account one day. Set the flag back to `false` after granting. The test user should add a device in `/vpn`, download the AWG and XRay profiles, connect through each, revoke one device, and see it stop connecting. Add five devices and verify the sixth is rejected. Let a short test subscription expire (or shorten its expiry in a test database) and verify the DE-2 agent removes its peers. The pilot profile from slice 1 remains separate.

The agent uses the original AWG and XRay configuration as immutable base snapshots, then renders managed users alongside the pilot users. A device job is retried after a site or VPN server outage. Every device has its own AWG keys, preshared key, IP address, and XRay UUID. Profile downloads require the account session and an active subscription. The site encrypts stored profiles with AES-256-GCM.

## Operational notes

- The current agent recreates both VPN containers when a device is added or revoked. Existing sessions may pause briefly. Dynamic user updates can replace this before scaling beyond the pilot.
- The agent enforces the last known subscription expiry locally even if the site becomes unreachable. A later renewal needs a `renew` job from the site.
- Do not enable VPN checkout yet. Payments and refunds belong to slice 3.
