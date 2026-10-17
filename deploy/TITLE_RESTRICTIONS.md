# Regional title restrictions

The database table `title_region_restrictions` controls which titles are restricted
in RU. Migration 0057 carries forward ID 60058 and adds IDs 57334 and 60543.
Administrators manage the list at `/admin#title-restrictions`: paste one URL per
line, optionally add a private notice reference, and save. Episode URLs and
duplicate links are normalised to one title. Removing a restriction reopens all
episodes; additions and removals are recorded in `moderation_actions`. Only users
with the admin role can read or modify this list. Changes require no restart.

Restricted pages return HTTP 451,
shows the restriction notice and links to /vpn, with a seven-second HTML refresh
that also works without JavaScript.
The videos, Kodik player, individual catalogue, offline preparation/licence and
new signed media requests are checked server-side. Other titles and VPN checkout
remain available. Aliases are checked against the resolved title identity.

## Deployment

1. Back up the current application image and public edge Caddyfile.
2. On the **public edge**, inside its existing reverse_proxy block, add:
   `header_up X-AniMonster-Client-IP {remote_host}`.
   The repository Caddyfile includes this directive. Validate and reload the actual
   public edge configuration, preserving its existing tunnel upstream and limits.
   Do not replace the live edge file with a different deployment topology.
3. App port 3000 must remain reachable only from the trusted proxy/internal network.
   The edge must overwrite client-supplied X-AniMonster-Client-IP. Any intermediary
   proxy must preserve this header only from that trusted edge; do not overwrite it
   with the tunnel IP. No CF-IPCountry or browser-provided country is trusted.
4. Build and replace the application using its existing Compose deployment, preserving
   CLUSTER_APP_BIND_ADDRESS. Apply migration `0057_title_region_restrictions.sql`
   before activating the new app. No new secret is required.
   geoip-country and its IPv4/IPv6 data must be included in the standalone image.
5. Check /api/health, /vpn, another anime, and both Russian and foreign access to
   /anime/60058 and /api/kodik/player?anime_id=60058&translation=1&episode=1.
   RU must receive 451 without any player URL; a known non-RU address must retain
   normal access. Verify that spoofing X-AniMonster-Client-IP from the public internet
   does not change the result. Verify automatic navigation to /vpn in a browser.

Unknown, private, malformed or missing client IP blocks **only listed titles**. If all
countries see the notice, inspect header forwarding rather than disabling the guard.
Country lookup is local; no visitor IP is sent to an external geolocation API.
The dependency version pins a GeoLite2 snapshot; update the dependency and rebuild
regularly to refresh the data. See https://github.com/sapics/geoip-country.

Previously downloaded files and external provider URLs already handed to browsers
cannot be recalled by this application. Legacy offline manifest tokens issued before
this change lack the title ID and expire within 30 minutes; derived segment tokens
can last six hours. Newly issued tokens carry the title ID through manifest rewrites.

Rollback: restore the previous application image. The extra overwritten IP header
can remain on Caddy without affecting the previous application.

## Applied on 17 October 2026

The public A record currently points directly to **2.26.48.72**. Its Caddy was
validated and reloaded with the trusted peer IP directive. The Caddy on
**31.77.10.81** was also updated, preserving its tunnel upstream.

Backups on both machines are in `/root/animonster-title-restrictions-20261017`.
The application server backup includes the database dump, changed source files,
and previous image ID; Docker tag `animonster-app:before-title-restrictions-20261017`
retains the old image. The application was rebuilt and replaced without database
migrations. The current container reports healthy.

Verification: 16 local tests, production build, origin 451 for Russian IPv4/IPv6,
origin 200 for non-RU and an unrelated title, public 200 from the German server,
and public requests with either forged RU or foreign headers giving the same
result. The notice navigates to `/vpn` after seven seconds in the browser.
AWG, XRay and the existing tunnel remain active.

## Admin rollout on 17 October 2026

Migration 0057 and the database-backed admin list are deployed. The active IDs
are 60058, 57334 and 60543; a URL with `?episode=1` covers the whole title.
The denial text is generic so newly added titles never show another anime's name.
Backups are in `/root/animonster-title-admin-20261017`, with Docker rollback tag
`animonster-app:before-title-admin-20261017`. Rolling back the app can retain the
additive table; restoring the whole database is unnecessary for an app rollback.

18 focused tests passed, including real PostgreSQL-compatible CRUD, access control,
audit entries, URL validation, and immediate changes across independent enforcement
module instances. Add, deduplication and removal were also exercised through the
local development admin UI. Production checks returned 451 for each restricted
page, episode URL and player API from a trusted RU address, and 200 for non-RU
page requests. The management endpoint denies unauthenticated access.
