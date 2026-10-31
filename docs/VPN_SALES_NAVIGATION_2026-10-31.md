# VPN sales and navigation — 2026-10-31

The standard VPN purchase was restored by a persistent Compose override on the live app server (177.3.218.227): /root/animonster-vpn-sales-20261031/compose.vpn-sales.yaml sets VPN_PAYMENTS_ENABLED=true. The existing image and all other runtime settings were preserved; the VPN + Plus bundle remains disabled. Future image deployments must retain the running Compose label chain so this setting persists.

The VPN agent on 31.77.10.81 had an outdated credential and received HTTP 401. Its private agent.env credential was synchronized with the site's existing VPN_AGENT_TOKEN, then the service was restarted. Existing encryption keys and VPN configuration were preserved. No secrets are stored in Git.

Verification used temporary isolated accounts: public /api/vpn reported purchase.available=true, 149 RUB and 30 days; a device was created, became active, both private AWG and XRay profiles were downloaded, then the device was revoked and the test account/session/subscription removed. Platega accepted a read-only request for an existing transaction (200). No new payment was created or charged. Private operational verification artifacts are in the server directory above.

Navigation changes: VPN is now in the desktop primary header for visitors and signed-in users; it is the first item in the mobile Profile dropdown, with the old duplicate removed; the owner's profile overview has an AniMonster VPN card linking to /vpn. The card reuses existing responsive panel/button styles and the shared VPN_PLAN price/duration. The existing five-item mobile bottom navigation and mobile topbar are unchanged.

Validation: TypeScript and targeted lint passed; 12 existing navigation/profile tests passed. Production builds and read-only checks of the deployed navigation are run during release. Local browser/device visual testing remains unavailable in Work settings.
